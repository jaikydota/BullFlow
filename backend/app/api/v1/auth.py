from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import (
    AuthenticationError,
    BadRequestError,
    CaptchaRequiredError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    TokenExpiredError,
)
from app.core.redis import get_redis
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ChangePhoneRequest,
    LoginRequest,
    PhoneLoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SendSmsCodeRequest,
    SmsLoginRequest,
    TokenResponse,
    UpdateMeRequest,
    UserBrief,
)
from app.schemas.common import success
from app.schemas.user import UserResponse
from app.services.captcha_service import consume_ticket, pop_ticket
from app.services.user_service import UserService
from app.services.verification_code_service import generate_and_send_code, verify_code

router = APIRouter(prefix="/auth", tags=["认证"])

_LOGIN_FAIL_TTL = 900  # 登录失败计数滑动窗口（秒）


def _client_ip(request: Request) -> str | None:
    if request.client:
        return request.client.host
    return None


def _login_fail_key(ip: str | None, account: str) -> str:
    return f"login:fail:{ip or 'unknown'}:{account}"


async def _login_fail_count(ip: str | None, account: str) -> int:
    v = await get_redis().get(_login_fail_key(ip, account))
    return int(v) if v else 0


async def _incr_login_fail(ip: str | None, account: str) -> None:
    redis = get_redis()
    key = _login_fail_key(ip, account)
    n = await redis.incr(key)
    if n == 1:
        await redis.expire(key, _LOGIN_FAIL_TTL)


async def _reset_login_fail(ip: str | None, account: str) -> None:
    await get_redis().delete(_login_fail_key(ip, account))


async def _guard_login_captcha(ip: str | None, account: str, ticket: str | None) -> None:
    """渐进式人机验证：连续失败达到阈值后要求 ticket，缺失/无效则要求验证。"""
    if await _login_fail_count(ip, account) >= settings.CAPTCHA_LOGIN_THRESHOLD:
        if not await pop_ticket(ticket):
            raise CaptchaRequiredError()


def _issue_token(user: User) -> TokenResponse:
    access_token = create_access_token(user.id, extra={"role": user.role})
    refresh_token = create_refresh_token(user.id)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserBrief.model_validate(user),
    )


# ============ 邮箱密码登录 ============

@router.post("/login")
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = _client_ip(request)
    account = str(body.email).lower()
    await _guard_login_captcha(ip, account, body.captcha_ticket)
    svc = UserService(db)
    try:
        user = await svc.authenticate(body.email, body.password)
    except AuthenticationError:
        await _incr_login_fail(ip, account)
        raise
    await _reset_login_fail(ip, account)
    return success(data=_issue_token(user).model_dump())


# ============ 发送短信验证码 ============

@router.post("/send-sms-code")
async def send_sms_code(
    body: SendSmsCodeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # 始终要求人机验证（防刷短信）
    await consume_ticket(body.captcha_ticket)

    svc = UserService(db)
    existing = await svc.get_by_phone(body.phone)

    if body.purpose == "register":
        if existing:
            raise ConflictError("该手机号已注册，请直接登录")
    elif body.purpose == "login":
        # 短信登录即注册：未注册也允许发码（登录时自动注册），仅拦截被禁用账号
        if existing is not None and existing.status != "active":
            raise ForbiddenError("用户已被禁用")
    elif body.purpose == "reset_password":
        if existing is None:
            raise NotFoundError("该手机号未注册")
        if existing.status != "active":
            raise ForbiddenError("用户已被禁用")
    elif body.purpose == "change_phone":
        if existing:
            raise ConflictError("该手机号已被使用，请更换")

    await generate_and_send_code(body.phone, body.purpose, ip=_client_ip(request))
    return success(message="验证码已发送", data={"ttl": settings.SMS_VERIFY_CODE_TTL})


# ============ 手机号 + 验证码 + 密码注册 ============

@router.post("/register")
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    await verify_code(body.phone, body.code, "register")
    svc = UserService(db)
    user = await svc.register_by_phone(body.phone, invitation_code=body.invitation_code)
    # 注册成功后立即绑 Free 订阅（幂等；失败不阻塞登录）
    try:
        from app.services.saas_subscription import ensure_free_subscription
        await ensure_free_subscription(db, user.id)
    except Exception:
        import logging
        logging.getLogger(__name__).exception("ensure_free_subscription failed user=%s", user.id)
    # flush 已在 service 内完成；get_db() 在请求结束时会 commit 落盘
    return success(data=_issue_token(user).model_dump(), message="注册成功")


# ============ 手机号 + 密码登录 ============

@router.post("/login-by-phone-password")
async def login_by_phone_password(
    body: PhoneLoginRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    ip = _client_ip(request)
    await _guard_login_captcha(ip, body.phone, body.captcha_ticket)
    svc = UserService(db)
    try:
        user = await svc.authenticate_by_phone_password(body.phone, body.password)
    except AuthenticationError:
        await _incr_login_fail(ip, body.phone)
        raise
    await _reset_login_fail(ip, body.phone)
    return success(data=_issue_token(user).model_dump())


# ============ 手机号 + 验证码登录（免密） ============

@router.post("/login-by-sms")
async def login_by_sms(body: SmsLoginRequest, db: AsyncSession = Depends(get_db)):
    await verify_code(body.phone, body.code, "login")
    svc = UserService(db)
    existing = await svc.get_by_phone(body.phone)
    if existing is None:
        # 短信登录即注册：首次登录的手机号自动注册（邀请码同样生效）
        user = await svc.register_by_phone(body.phone, invitation_code=body.invitation_code)
        try:
            from app.services.saas_subscription import ensure_free_subscription
            await ensure_free_subscription(db, user.id)
        except Exception:
            import logging
            logging.getLogger(__name__).exception("ensure_free_subscription failed user=%s", user.id)
        registered = True
    else:
        user = await svc.authenticate_by_phone(body.phone)
        registered = False

    data = _issue_token(user).model_dump()
    data["registered"] = registered
    return success(data=data, message="注册成功并登录" if registered else "登录成功")


# ============ 重置密码 ============

@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
):
    await verify_code(body.phone, body.code, "reset_password")
    svc = UserService(db)
    user = await svc.reset_password_by_phone(body.phone, body.new_password)
    return success(message="密码重置成功", data={"user_id": user.id})


# ============ Token 刷新 / 登出 / 个人信息 ============

@router.post("/refresh")
async def refresh_token(body: RefreshRequest):
    try:
        payload = decode_token(body.refresh_token)
    except Exception:
        raise AuthenticationError("Refresh token 无效或已过期")

    if payload.get("type") != "refresh":
        raise AuthenticationError("无效的 token 类型")

    redis = get_redis()
    if await redis.get(f"token:blacklist:{body.refresh_token}"):
        raise TokenExpiredError("Refresh token 已失效")

    user_id = payload["sub"]
    access_token = create_access_token(user_id)
    new_refresh = create_refresh_token(user_id)

    return success(data={
        "access_token": access_token,
        "refresh_token": new_refresh,
        "token_type": "bearer",
        "expires_in": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    })


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    authorization: str = Header(...),
):
    token = authorization.replace("Bearer ", "")
    redis = get_redis()
    ttl = settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
    await redis.setex(f"token:blacklist:{token}", ttl, "1")
    return success(message="已退出登录")


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return success(data=UserResponse.model_validate(current_user).model_dump())


@router.put("/me")
async def update_me(
    body: UpdateMeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.nickname is not None:
        current_user.nickname = body.nickname
    if body.avatar is not None:
        current_user.avatar = body.avatar
    if body.language is not None:
        current_user.language = body.language

    await db.flush()
    await db.commit()  # 返回前提交，否则前端随后刷新用户信息读到旧数据
    await db.refresh(current_user)
    return success(data=UserResponse.model_validate(current_user).model_dump())


# ============ 设置 / 修改登录密码（已登录） ============

@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """已登录用户设置或修改登录密码。

    - 已绑定手机号：一律走「本人手机号 + 短信验证码」（reset_password），更安全；
      即使设过密码也不接受旧密码改密。
    - 未绑定手机号：校验 ``current_password`` 旧密码（邮箱注册用户必有密码）。
    """
    if current_user.phone:
        if not body.code:
            raise BadRequestError("请输入短信验证码")
        await verify_code(current_user.phone, body.code, "reset_password")
    else:
        if not body.current_password or not verify_password(
            body.current_password, current_user.password_hash
        ):
            raise AuthenticationError("当前密码错误")

    current_user.password_hash = hash_password(body.new_password)
    await db.flush()
    await db.commit()  # 返回前提交，否则前端随后刷新读到旧状态
    await db.refresh(current_user)
    return success(
        message="密码已更新",
        data=UserResponse.model_validate(current_user).model_dump(),
    )


# ============ 修改 / 绑定手机号（已登录） ============

@router.put("/me/phone")
async def update_my_phone(
    body: ChangePhoneRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.phone == body.phone:
        raise ConflictError("新手机号与当前手机号相同")

    svc = UserService(db)
    existing = await svc.get_by_phone(body.phone)
    if existing is not None and existing.id != current_user.id:
        raise ConflictError("该手机号已被其他账号使用")

    await verify_code(body.phone, body.code, "change_phone")

    current_user.phone = body.phone
    await db.flush()
    await db.commit()  # 返回前提交，否则前端随后刷新用户信息读到旧手机号
    await db.refresh(current_user)
    return success(message="手机号已更新", data=UserResponse.model_validate(current_user).model_dump())
