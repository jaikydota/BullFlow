"""admin: 平台能力目录 + 平台发布策略。

- 国内平台：扩展字段「支持/必填」矩阵来自 publish_spec.py（与网关发布过滤实时一致）；
- 海外平台：来自 platform_registry + composio_spec（无扩展字段，只有支持的发布类型）；
- 每平台附 `provider`（lapi / composio）与后台策略 `policy`（首期：是否允许含链接发帖）。
长度/枚举/视频等参考约束由前端静态目录展示（见 tlf_frontend/src/constants/platformSpecs.ts）。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.database import get_db
from tlf_app.core.dependencies import AdminClaims, get_current_admin
from tlf_app.core.exceptions import NotFoundError
from tlf_app.models.platform_policy import PlatformPolicy
from tlf_app.schemas.admin import PlatformPolicyUpdateRequest
from tlf_app.schemas.common import ok
from tlf_app.services import composio_spec
from tlf_app.services.platform_policy import get_policy, get_policy_map, policy_to_dict
from tlf_app.services.platform_registry import COMPOSIO_PLATFORMS, PROVIDER_COMPOSIO, PROVIDER_LAPI
from tlf_app.services.publish_spec import PUBLISH_SPEC, platform_field_matrix

router = APIRouter()


def _known_platform(platform_code: str) -> bool:
    return platform_code in PUBLISH_SPEC or platform_code in COMPOSIO_PLATFORMS


@router.get("/platforms")
async def list_platforms(
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """列出全部支持云端登录/分发的平台（国内 + 海外）+ 扩展字段矩阵 + 上游 + 后台策略。"""
    policies = await get_policy_map(db)
    out: list[dict] = []
    for entry in platform_field_matrix():
        item = dict(entry)
        item["provider"] = PROVIDER_LAPI
        item["policy"] = policy_to_dict(policies.get(item["platform_code"]))
        out.append(item)
    for code in sorted(COMPOSIO_PLATFORMS):
        kinds = composio_spec.supported_kinds(code)
        out.append({
            "platform_code": code,
            "kinds": kinds,
            "fields": {k: [] for k in kinds},   # 海外平台无扩展字段
            "provider": PROVIDER_COMPOSIO,
            "policy": policy_to_dict(policies.get(code)),
        })
    return ok(out)


@router.put("/platforms/{platform_code}/policy")
async def update_platform_policy(
    platform_code: str,
    body: PlatformPolicyUpdateRequest,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """修改平台发布策略（upsert）。首期：`allow_links` 是否允许含链接发帖。

    关闭后该平台的 SDK 发布请求若标题/正文含 URL 或裸域名，受理前同步拒绝（40000），
    不建任务、不产生上游费用。对所有租户生效。
    """
    if not _known_platform(platform_code):
        raise NotFoundError(f"平台 {platform_code} 不存在")
    policy = await get_policy(db, platform_code)
    if policy is None:
        policy = PlatformPolicy(platform_code=platform_code)
        db.add(policy)
    policy.allow_links = body.allow_links
    policy.note = body.note
    # 返回前显式 commit：前端保存后立即刷新列表，走另一条连接必须读到新值（CLAUDE.md §9.1.1）
    await db.commit()
    await db.refresh(policy)
    return ok(policy_to_dict(policy))
