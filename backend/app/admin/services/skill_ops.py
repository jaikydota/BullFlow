"""后台 skill 池增删改查（全局，带审计）。"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.admin.schemas.skill_admin import AdminSkillPayload
from app.admin.services.audit_logger import append_audit_log

from app.models.skill import Skill


def _to_dict(s: Skill) -> dict:
    return {
        "id": s.id,
        "slug": s.slug,
        "name": s.name,
        "description": s.description,
        "prompt": s.prompt,
        "contentTypes": s.content_types or [],
        "platforms": s.platforms or [],
        "category": s.category,
        "icon": s.icon,
        "sourceUrl": s.source_url,
        "status": s.status,
        "recommended": bool(s.recommended),
        "sortOrder": s.sort_order,
        "createdAt": s.created_at.isoformat() if s.created_at else None,
        "updatedAt": s.updated_at.isoformat() if s.updated_at else None,
    }


async def list_skills(db: AsyncSession) -> list[dict]:
    rows = (
        await db.execute(select(Skill).order_by(Skill.sort_order.asc(), Skill.created_at.asc()))
    ).scalars().all()
    return [_to_dict(s) for s in rows]


async def _apply(skill: Skill, body: AdminSkillPayload) -> None:
    skill.slug = body.slug
    skill.name = body.name
    skill.description = body.description
    skill.prompt = body.prompt
    skill.content_types = body.content_types
    skill.platforms = body.platforms
    skill.category = body.category
    skill.icon = body.icon
    skill.source_url = body.source_url
    skill.status = body.status
    skill.recommended = body.recommended
    skill.sort_order = body.sort_order


async def create_skill(db: AsyncSession, body: AdminSkillPayload, *, operator_id: str) -> dict:
    skill = Skill()
    await _apply(skill, body)
    db.add(skill)
    await db.flush()
    await db.refresh(skill)
    await append_audit_log(
        db, operator_id=operator_id, action="skill.create",
        resource_type="skill", resource_id=str(skill.id), detail={"slug": skill.slug},
    )
    await db.commit()
    await db.refresh(skill)
    return _to_dict(skill)


async def update_skill(db: AsyncSession, skill_id: str, body: AdminSkillPayload, *, operator_id: str) -> dict:
    skill = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if skill is None:
        raise NotFoundError("skill 不存在")
    await _apply(skill, body)
    await db.flush()
    await append_audit_log(
        db, operator_id=operator_id, action="skill.update",
        resource_type="skill", resource_id=str(skill.id), detail={"slug": skill.slug},
    )
    await db.commit()
    await db.refresh(skill)
    return _to_dict(skill)


async def delete_skill(db: AsyncSession, skill_id: str, *, operator_id: str) -> dict:
    skill = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if skill is None:
        raise NotFoundError("skill 不存在")
    slug = skill.slug
    await db.delete(skill)
    await append_audit_log(
        db, operator_id=operator_id, action="skill.delete",
        resource_type="skill", resource_id=str(skill_id), detail={"slug": slug},
    )
    await db.commit()
    return {"id": skill_id}
