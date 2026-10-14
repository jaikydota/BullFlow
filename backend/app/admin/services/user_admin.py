from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.core.security import hash_password
from app.admin.schemas.user_admin import AdminUserCreateBody, AdminUserPatchBody
from app.admin.services.audit_logger import append_audit_log
from app.models.user import User
from app.services.user_seq import allocate_user_seq_no

logger = logging.getLogger(__name__)

import re as _re

_CN_PHONE_RE = _re.compile(r"^1[3-9]\d{9}$")


def _validate_normalize_phone(raw: str | None) -> str | None:
    """校验并归一化国内手机号：空 → None；合法 11 位（或带 86 前缀）→ '86'+11 位；非法 → BadRequestError。"""
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    digits = "".join(ch for ch in s if ch.isdigit())
    if len(digits) == 13 and digits.startswith("86"):
        digits = digits[2:]
    if not _CN_PHONE_RE.match(digits):
        raise BadRequestError("手机号格式不正确，请输入 11 位国内手机号")
    return "86" + digits


async def _assert_phone_unique(db: AsyncSession, phone: str, *, exclude_id: str | None = None) -> None:
    stmt = select(User.id).where(User.phone == phone)
    if exclude_id is not None:
        stmt = stmt.where(User.id != exclude_id)
    if (await db.execute(stmt)).scalar_one_or_none():
        raise ConflictError("手机号已被占用")


def _assert_can_manage_user(actor: User, target: User, *, allow_role_change: bool) -> None:
    if actor.role == "super_admin":
        return
    if actor.role == "admin":
        if target.role != "user":
            raise ForbiddenError("仅能管理租户用户（role=user）")
        if allow_role_change:
            raise ForbiddenError("无权修改账号角色")
        return
    raise ForbiddenError("权限不足")


async def get_user_detail(db: AsyncSession, user_id: str) -> User:
    row = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if row is None:
        raise NotFoundError("用户不存在")
    return row


async def create_user_by_admin(
    db: AsyncSession,
    body: AdminUserCreateBody,
    *,
    actor: User,
    operator_id: str,
) -> User:
    if actor.role == "admin" and body.role != "user":
        raise ForbiddenError("仅能创建租户用户账号")
    if actor.role != "super_admin" and actor.role != "admin":
        raise ForbiddenError("权限不足")

    raw_email = (body.email or "").strip().lower()
    phone_norm = _validate_normalize_phone(body.phone)

    # 邮箱 / 手机号二选一必填
    if not raw_email and not phone_norm:
        raise BadRequestError("邮箱和手机号至少填写一个")

    # 邮箱：填了直接用；只填手机号 → 走 C 端同款占位邮箱 phone+{86xxx}@matrix365.local
    email_norm = raw_email if raw_email else f"phone+{phone_norm}@matrix365.local"
    exists = (
        await db.execute(select(User).where(func.lower(User.email) == email_norm))
    ).scalar_one_or_none()
    if exists:
        raise ConflictError("邮箱已注册" if raw_email else "该手机号已注册")

    if phone_norm:
        await _assert_phone_unique(db, phone_norm)

    sn = await allocate_user_seq_no(db)

    try:
        pwd_hash = hash_password(body.password)
    except Exception as ex:
        logger.exception("password hash failed")
        raise BadRequestError("密码处理失败，请确认已安装 bcrypt 并重启服务") from ex

    user = User(
        email=email_norm,
        phone=phone_norm,
        password_hash=pwd_hash,
        nickname=body.nickname
        or (raw_email.split("@")[0] if raw_email else f"用户{phone_norm[-4:]}"),
        role=body.role,
        language="zh-CN",
        created_by=str(actor.id),
        seq_no=sn,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError as e:
        orig = getattr(e, "orig", None)
        detailed = str(orig) if orig is not None else str(e)
        low = detailed.lower()
        errno = None
        if getattr(orig, "args", None):
            try:
                errno = int(orig.args[0])
            except (TypeError, ValueError, IndexError):
                errno = None
        if errno == 1062 or errno == 19:
            raise ConflictError("该邮箱已被占用或违反唯一约束")
        if (
            "duplicate" in low
            or "unique constraint failed" in low
            or ("unique" in low and "constraint" in low)
        ):
            raise ConflictError("该邮箱已被占用或违反唯一约束")
        if errno == 1452:
            raise BadRequestError("外键校验失败（如操作者账号无效）")
        logger.warning("create_user integrity_error errno=%s detail=%s", errno, detailed)
        raise BadRequestError("用户写入失败，请查看服务端日志") from e
    await db.refresh(user)
    # 后台新建的租户用户（role=user）与 C 端注册保持一致：默认注入永久 Free 订阅
    # （幂等：已有 active 订阅则跳过；失败仅记录，不阻塞建号）
    if user.role == "user":
        try:
            from app.services.saas_subscription import ensure_free_subscription

            await ensure_free_subscription(db, str(user.id))
        except Exception:
            logger.exception("ensure_free_subscription failed for admin-created user=%s", user.id)
    await append_audit_log(
        db,
        operator_id=operator_id,
        action="user.admin_create",
        resource_type="user",
        resource_id=str(user.id),
        detail={"email": user.email, "role": user.role},
    )
    return user


async def patch_user_by_admin(
    db: AsyncSession,
    user_id: str,
    body: AdminUserPatchBody,
    *,
    actor: User,
    operator_id: str,
) -> User:
    target = await get_user_detail(db, user_id)

    if target.id == actor.id:
        if body.status == "disabled":
            raise BadRequestError("不可禁用当前登录账号")
        if body.role is not None and body.role != actor.role:
            raise BadRequestError("不可修改当前登录账号角色")

    changed_role = body.role is not None and body.role != target.role

    _assert_can_manage_user(actor, target, allow_role_change=changed_role)

    if actor.role == "admin":
        if body.role is not None:
            raise ForbiddenError("无权修改角色")

    if body.status is not None:
        target.status = body.status
    if body.role is not None:
        target.role = body.role
    if body.nickname is not None:
        target.nickname = body.nickname
    if body.password:
        target.password_hash = hash_password(body.password)
    if body.email is not None:
        email_norm = str(body.email).strip().lower()
        if email_norm:
            dup = (
                await db.execute(
                    select(User.id).where(
                        func.lower(User.email) == email_norm, User.id != target.id
                    )
                )
            ).scalar_one_or_none()
            if dup:
                raise ConflictError("邮箱已被占用")
            target.email = email_norm
    if body.phone is not None:
        # 空串=清空；非空=校验+归一化（'86'+11）+唯一性校验
        phone_norm = _validate_normalize_phone(body.phone)
        if phone_norm:
            await _assert_phone_unique(db, phone_norm, exclude_id=str(target.id))
        target.phone = phone_norm

    await db.flush()
    await db.refresh(target)
    detail: dict = {}
    if body.status is not None:
        detail["status"] = body.status
    if body.role is not None:
        detail["role"] = body.role
    if body.nickname is not None:
        detail["nickname"] = body.nickname
    if body.password:
        detail["password"] = "***"
    if body.email is not None:
        detail["email"] = target.email
    if body.phone is not None:
        detail["phone"] = target.phone or ""

    await append_audit_log(
        db,
        operator_id=operator_id,
        action="user.admin_patch",
        resource_type="user",
        resource_id=str(target.id),
        detail=detail if detail else None,
    )
    return target

