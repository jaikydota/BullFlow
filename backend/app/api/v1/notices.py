from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.models.admin_platform import PlatformSetting
from app.schemas.common import success

router = APIRouter(prefix="/notices", tags=["顶部公告"])


def _normalize(raw) -> list[dict]:
    """从 platform_settings.top_notices 的 JSON 数组归一化为前端需要的形状。"""
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        if not item.get("enabled", True):
            continue
        text = (item.get("text") or "").strip()
        if not text:
            continue
        out.append(
            {
                "id": item.get("id") or f"notice-{i}",
                "text": text,
                "linkUrl": (item.get("link_url") or "").strip() or None,
                "accent": item.get("accent") or None,  # 可选 preset：primary / rose / emerald / amber / sky
            }
        )
    return out


@router.get("")
async def list_notices(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """C 端顶部公告列表（登录可访问）。"""
    row = (
        await db.execute(
            select(PlatformSetting).where(PlatformSetting.key == "top_notices")
        )
    ).scalar_one_or_none()
    items = _normalize(row.value if row else None)
    return success(data={"items": items})
