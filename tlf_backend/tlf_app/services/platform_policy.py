"""平台发布策略：读取 + 发布前校验（首期：含链接发帖开关）。

链接判定是**启发式**：显式 URL（http/https/www.）或裸域名（如 `example.com/xx`）都算——
X 会把裸域名也自动转成 t.co 链接并按「含链接帖子」计费，所以裸域名不能放过。
误判成本很低（用户改一下文案即可），漏判成本高（一条 $0.20），故宁可从严。
"""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.exceptions import BadRequestError
from tlf_app.models.platform_policy import PlatformPolicy

# 显式 URL 或 裸域名（常见 TLD）+ 可选路径。忽略大小写。
_LINK_RE = re.compile(
    r"(?i)(?:https?://|www\.)\S+"
    r"|\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*"
    r"\.(?:com|net|org|io|co|cn|me|app|dev|ai|xyz|info|biz|tv|cc|shop|top|site|online|store"
    r"|link|ly|to|gg|us|uk|de|jp|kr|hk|tw|sg)(?:/\S*)?\b"
)


def contains_link(*texts: str | None) -> bool:
    """任一文本含 URL / 裸域名即 True。"""
    return any(bool(t) and _LINK_RE.search(t) is not None for t in texts)


def policy_to_dict(policy: PlatformPolicy | None) -> dict:
    """策略行 → 对外/后台展示字典；无行 = 默认全部允许。"""
    if policy is None:
        return {"allow_links": True, "note": None, "configured": False}
    return {"allow_links": bool(policy.allow_links), "note": policy.note, "configured": True}


async def get_policy_map(db: AsyncSession) -> dict[str, PlatformPolicy]:
    rows = (await db.execute(select(PlatformPolicy))).scalars().all()
    return {r.platform_code: r for r in rows}


async def get_policy(db: AsyncSession, platform_code: str) -> PlatformPolicy | None:
    return (await db.execute(
        select(PlatformPolicy).where(PlatformPolicy.platform_code == platform_code)
    )).scalar_one_or_none()


async def assert_links_allowed(db: AsyncSession, platform_code: str, *texts: str | None) -> None:
    """该平台若关闭了「含链接发帖」且内容含链接 → 抛 40000（发布受理前调用，不建任务不扣费）。"""
    policy = await get_policy(db, platform_code)
    if policy is None or policy.allow_links:
        return
    if contains_link(*texts):
        raise BadRequestError(
            f"平台 {platform_code} 当前禁止发布含链接的内容（后台策略「含链接发帖」已关闭），"
            f"请去掉标题 / 正文中的链接或域名后重试"
        )


__all__ = ["contains_link", "policy_to_dict", "get_policy_map", "get_policy", "assert_links_allowed"]
