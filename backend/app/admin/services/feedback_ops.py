"""用户反馈：后台查看与处理（跨全体用户，不做租户隔离）。"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models.feedback import Feedback
from app.models.user import User

from app.core.exceptions import NotFoundError
from app.admin.schemas.feedback_admin import FeedbackAdminOut, FeedbackPatch
from app.admin.services.audit_logger import append_audit_log


def _iso(dt) -> str | None:
    return dt.isoformat(timespec="seconds") if dt else None


def _to_out(fb: Feedback, user: User | None) -> dict:
    return FeedbackAdminOut(
        id=str(fb.id),
        category=fb.category,
        content=fb.content,
        images=list(fb.images or []),
        contact=fb.contact,
        status=fb.status,
        reply=fb.reply,
        repliedAt=_iso(fb.replied_at),
        createdAt=_iso(fb.created_at),
        userId=str(fb.user_id),
        userName=(user.nickname if user else None),
        userPhoneTail=((user.phone or "")[-4:] if user and user.phone else None),
        userEmail=(
            None
            if (not user or not user.email or user.email.endswith("@matrix365.local"))
            else user.email
        ),
    ).model_dump()


async def list_feedbacks(
    db: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    category: str | None = None,
    search: str | None = None,
) -> tuple[list[dict], int]:
    filters = []
    if status in ("pending", "resolved"):
        filters.append(Feedback.status == status)
    if category in ("suggestion", "bug", "other"):
        filters.append(Feedback.category == category)
    if search:
        like = f"%{search.strip()}%"
        filters.append(
            func.coalesce(Feedback.content, "").like(like)
            | func.coalesce(Feedback.contact, "").like(like)
        )

    total = int(
        (
            await db.execute(select(func.count()).select_from(Feedback).where(*filters))
        ).scalar()
        or 0
    )
    rows = list(
        (
            await db.execute(
                select(Feedback)
                .where(*filters)
                .order_by(Feedback.created_at.desc())
                .limit(page_size)
                .offset((page - 1) * page_size)
            )
        )
        .scalars()
        .all()
    )
    # 批量取提交用户信息
    user_ids = list({r.user_id for r in rows})
    users: dict = {}
    if user_ids:
        urows = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        users = {str(u.id): u for u in urows}
    return [_to_out(r, users.get(str(r.user_id))) for r in rows], total


async def get_feedback(db: AsyncSession, feedback_id: str) -> dict:
    fb = (
        await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    ).scalar_one_or_none()
    if fb is None:
        raise NotFoundError("反馈不存在")
    user = (
        await db.execute(select(User).where(User.id == fb.user_id))
    ).scalar_one_or_none()
    return _to_out(fb, user)


async def patch_feedback(
    db: AsyncSession, feedback_id: str, body: FeedbackPatch, *, operator_id: str | None = None
) -> dict:
    fb = (
        await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    ).scalar_one_or_none()
    if fb is None:
        raise NotFoundError("反馈不存在")
    if body.status is not None:
        fb.status = body.status
    if body.reply is not None:
        reply = body.reply.strip()
        fb.reply = reply or None
        fb.replied_at = utcnow() if reply else None
    await db.flush()
    if operator_id:
        await append_audit_log(
            db,
            operator_id=operator_id,
            action="feedback.update",
            resource_type="feedback",
            resource_id=str(fb.id),
            detail={"status": fb.status},
        )
    await db.commit()
    await db.refresh(fb)
    user = (
        await db.execute(select(User).where(User.id == fb.user_id))
    ).scalar_one_or_none()
    return _to_out(fb, user)


async def feedback_overview(db: AsyncSession) -> dict:
    total = int((await db.execute(select(func.count()).select_from(Feedback))).scalar() or 0)
    pending = int(
        (
            await db.execute(
                select(func.count()).select_from(Feedback).where(Feedback.status == "pending")
            )
        ).scalar()
        or 0
    )
    return {"total": total, "pending": pending, "resolved": total - pending}
