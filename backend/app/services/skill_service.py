"""内容生成 skill 池服务（全局，无 user_id）。"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.skill import Skill


def skill_to_dict(s: Skill) -> dict:
    return {
        "id": s.id,
        "slug": s.slug,
        "name": s.name,
        "description": s.description,
        "prompt": s.prompt,
        "content_types": s.content_types or [],
        "platforms": s.platforms or [],
        "category": s.category,
        "icon": s.icon,
        "source_url": s.source_url,
        "recommended": bool(s.recommended),
    }


async def get_active_skill(skill_id: str | None, db: AsyncSession) -> Skill | None:
    """按 ID 取一个启用的 skill；空 / 非法格式 / 不存在 / 已下架均返回 None。

    skill 是可选增强项，传入非 UUID 的脏 id 时降级为「不使用」（返回 None），
    而非抛错让整个生成请求 500。
    """
    if not skill_id:
        return None
    try:
        uuid.UUID(str(skill_id))
    except (ValueError, AttributeError, TypeError):
        return None
    row = (
        await db.execute(
            select(Skill).where(Skill.id == skill_id, Skill.status == "active")
        )
    ).scalar_one_or_none()
    return row


async def get_skill_prompt(skill_id: str | None, db: AsyncSession) -> str | None:
    """取 skill 提示词文本（供生成注入）。"""
    skill = await get_active_skill(skill_id, db)
    return skill.prompt if skill else None


async def list_active_skills(
    db: AsyncSession,
    *,
    content_type: str | None = None,
    platform: str | None = None,
) -> list[Skill]:
    """列出启用的 skill，按内容类型 / 平台过滤（空 content_types/platforms = 通用）。"""
    rows = (
        await db.execute(
            select(Skill)
            .where(Skill.status == "active")
            .order_by(Skill.sort_order.asc(), Skill.created_at.asc())
        )
    ).scalars().all()

    def matches(s: Skill) -> bool:
        if content_type and s.content_types and content_type not in s.content_types:
            return False
        if platform and s.platforms and platform not in s.platforms:
            return False
        return True

    return [s for s in rows if matches(s)]
