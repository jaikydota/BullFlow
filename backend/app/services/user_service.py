from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate
from app.services.user_seq import allocate_user_seq_no

ROLE_HIERARCHY = {"super_admin": 3, "admin": 2, "user": 1}


class UserService:

    def __init__(self, db: AsyncSession):
        self.db = db

    # ---- Query ----

    async def get_by_id(self, user_id: str) -> User:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise NotFoundError("用户不存在")
        return user

    async def get_by_email(self, email: str) -> User | None:
        result = await self.db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_phone(self, phone: str) -> User | None:
        result = await self.db.execute(select(User).where(User.phone == phone))
        return result.scalar_one_or_none()

    async def list_users(
        self, *, page: int = 1, page_size: int = 20, search: str | None = None
    ) -> tuple[list[User], int]:
        query = select(User)
        count_query = select(func.count()).select_from(User)

        if search:
            like = f"%{search}%"
            query = query.where(User.email.ilike(like) | User.nickname.ilike(like))
            count_query = count_query.where(User.email.ilike(like) | User.nickname.ilike(like))

        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        query = query.order_by(User.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(query)
        users = list(result.scalars().all())
        return users, total

    # ---- Auth helpers ----

    async def authenticate(self, email: str, password: str) -> User:
        user = await self.get_by_email(email)
        if user is None or not verify_password(password, user.password_hash):
            from app.core.exceptions import AuthenticationError
            raise AuthenticationError("邮箱或密码错误")
        if user.status != "active":
            raise ForbiddenError("用户已被禁用")
        return user

    async def authenticate_by_phone_password(self, phone: str, password: str) -> User:
        user = await self.get_by_phone(phone)
        if user is None or not verify_password(password, user.password_hash):
            from app.core.exceptions import AuthenticationError
            raise AuthenticationError("手机号或密码错误")
        if user.status != "active":
            raise ForbiddenError("用户已被禁用")
        return user

    async def authenticate_by_phone(self, phone: str) -> User:
        """验证码已外部校验，此处仅按手机号取用户并检查状态。"""
        user = await self.get_by_phone(phone)
        if user is None:
            raise NotFoundError("该手机号未注册")
        if user.status != "active":
            raise ForbiddenError("用户已被禁用")
        return user

    # ---- 自助注册（无 current_user） ----

    async def register_by_phone(
        self,
        phone: str,
        password: str | None = None,
        nickname: str | None = None,
        invitation_code: str | None = None,
    ) -> User:
        existing = await self.get_by_phone(phone)
        if existing:
            raise ConflictError("该手机号已注册")

        # 用 phone 占位生成一个唯一伪邮箱，避免 email NOT NULL 约束冲突
        # 用户后续可在「个人资料」补上真实邮箱
        placeholder_email = f"phone+{phone}@matrix365.local"
        if await self.get_by_email(placeholder_email):
            raise ConflictError("该手机号已注册")

        # 邀请码归因：销售码 → sales_id；普通用户码 → 记邀请关系 + 发一阶奖励（见下）
        from app.services import referral_service

        inviter = await referral_service.resolve_inviter(self.db, invitation_code)
        sales_id = inviter.id if (inviter is not None and inviter.role == "sales") else None

        sn = await allocate_user_seq_no(self.db)
        # 注册只需手机号：未设密码时存空哈希（verify_password 对空串安全返回 False，
        # 即密码登录不可用），用户后续在「个人资料」设密码即可覆盖。
        user = User(
            email=placeholder_email,
            phone=phone,
            password_hash=hash_password(password) if password else "",
            nickname=nickname or f"用户{phone[-4:]}",
            role="user",
            status="active",
            language="zh-CN",
            seq_no=sn,
            sales_id=sales_id,
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)

        # 普通用户邀请：记邀请关系 + 发一阶（注册）奖励给邀请人（幂等 / 失败不阻塞注册）
        if inviter is not None and inviter.role == "user":
            try:
                await referral_service.record_referral_tier1(
                    self.db, inviter=inviter, invitee=user, code=invitation_code
                )
            except Exception:
                import logging

                logging.getLogger(__name__).exception(
                    "record_referral_tier1 failed inviter=%s invitee=%s", inviter.id, user.id
                )
        return user

    async def reset_password_by_phone(self, phone: str, new_password: str) -> User:
        user = await self.get_by_phone(phone)
        if user is None:
            raise NotFoundError("该手机号未注册")
        if user.status != "active":
            raise ForbiddenError("用户已被禁用")
        user.password_hash = hash_password(new_password)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    # ---- Create ----

    async def create_user(self, data: UserCreate, current_user: User | None = None) -> User:
        existing = await self.get_by_email(data.email)
        if existing:
            raise ConflictError("该邮箱已注册")

        if current_user:
            self._check_can_create_role(current_user, data.role)

        sn = await allocate_user_seq_no(self.db)
        user = User(
            email=data.email,
            password_hash=hash_password(data.password),
            nickname=data.nickname or data.email.split("@")[0],
            role=data.role,
            language=data.language,
            created_by=current_user.id if current_user else None,
            seq_no=sn,
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    # ---- Update ----

    async def update_user(self, user_id: str, data: UserUpdate, current_user: User) -> User:
        target = await self.get_by_id(user_id)
        self._check_can_edit(current_user, target)

        if data.nickname is not None:
            target.nickname = data.nickname
        if data.avatar is not None:
            target.avatar = data.avatar
        if data.password is not None:
            target.password_hash = hash_password(data.password)
        if data.language is not None:
            target.language = data.language
        if data.role is not None:
            self._check_can_change_role(current_user, target, data.role)
            target.role = data.role
        if data.status is not None:
            self._check_can_edit(current_user, target)
            target.status = data.status

        await self.db.flush()
        await self.db.refresh(target)
        return target

    # ---- Disable (soft delete) ----

    async def disable_user(self, user_id: str, current_user: User) -> User:
        target = await self.get_by_id(user_id)
        if target.id == current_user.id:
            raise ForbiddenError("不能禁用自己")
        self._check_can_edit(current_user, target)
        target.status = "disabled"
        await self.db.flush()
        return target

    # ---- Permission helpers ----

    @staticmethod
    def _check_can_create_role(current: User, target_role: str) -> None:
        if target_role == "super_admin":
            raise ForbiddenError("不能创建超级管理员")
        if target_role == "admin" and current.role != "super_admin":
            raise ForbiddenError("只有超级管理员可以创建管理员")
        if current.role == "user":
            raise ForbiddenError("普通用户无权创建账号")

    @staticmethod
    def _check_can_edit(current: User, target: User) -> None:
        if current.id == target.id:
            return
        c_level = ROLE_HIERARCHY.get(current.role, 0)
        t_level = ROLE_HIERARCHY.get(target.role, 0)
        if c_level <= t_level:
            raise ForbiddenError("只能编辑低级别用户")

    @staticmethod
    def _check_can_change_role(current: User, target: User, new_role: str) -> None:
        if new_role == "super_admin":
            raise ForbiddenError("不能设置超级管理员角色")
        c_level = ROLE_HIERARCHY.get(current.role, 0)
        new_level = ROLE_HIERARCHY.get(new_role, 0)
        if new_level >= c_level:
            raise ForbiddenError("不能设置与自己同级或更高级别的角色")

    # ---- Super admin init ----

    async def ensure_super_admin(self, email: str, password: str) -> User:
        existing = await self.get_by_email(email)
        if existing:
            return existing
        sn = await allocate_user_seq_no(self.db)
        user = User(
            email=email,
            password_hash=hash_password(password),
            nickname="超级管理员",
            role="super_admin",
            status="active",
            seq_no=sn,
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user
