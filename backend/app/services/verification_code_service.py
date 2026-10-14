"""短信验证码生成与校验（Redis 存储 + 多维限流）

Redis 键约定：
  sms:code:{purpose}:{phone}       验证码本体（TTL = SMS_VERIFY_CODE_TTL）
  sms:rate:60s:phone:{phone}       同号 60s 内发送次数
  sms:rate:hour:phone:{phone}      同号 1h 内发送次数
  sms:rate:day:phone:{phone}       同号 24h 内发送次数
  sms:rate:hour:ip:{ip}            同 IP 1h 内发送次数
  sms:fail:{purpose}:{phone}       验证失败计数（达到上限锁定）
  sms:lock:{purpose}:{phone}       锁定标记（TTL = SMS_VERIFY_LOCK_SECONDS）

purpose ∈ register / login / reset_password / change_phone
"""
from __future__ import annotations

import logging
import secrets
from typing import Literal

from app.core.config import settings
from app.core.exceptions import BadRequestError, TooManyRequestsError
from app.core.redis import get_redis
from app.services.sms_service import send_verification_code


logger = logging.getLogger(__name__)

Purpose = Literal["register", "login", "reset_password", "change_phone"]
ALLOWED_PURPOSES: tuple[str, ...] = ("register", "login", "reset_password", "change_phone")


def _gen_code() -> str:
    """6 位数字验证码"""
    return f"{secrets.randbelow(1000000):06d}"


async def _check_and_incr_rate_limits(phone: str, ip: str | None) -> None:
    """检查并递增多维度限流计数器。超出任一阈值即抛 TooManyRequestsError。"""
    redis = get_redis()
    keys_specs = [
        (f"sms:rate:60s:phone:{phone}", 60, settings.SMS_RATE_PHONE_60S, "操作过于频繁，请 60 秒后再试"),
        (f"sms:rate:hour:phone:{phone}", 3600, settings.SMS_RATE_PHONE_HOUR, "该手机号请求次数过多，请稍后再试"),
        (f"sms:rate:day:phone:{phone}", 86400, settings.SMS_RATE_PHONE_DAY, "该手机号今日发送次数已达上限"),
    ]
    if ip:
        keys_specs.append(
            (f"sms:rate:hour:ip:{ip}", 3600, settings.SMS_RATE_IP_HOUR, "当前 IP 请求次数过多，请稍后再试")
        )

    # 1) 先全部检查（任一超限直接拒绝），不递增
    for key, _ttl, limit, msg in keys_specs:
        current = await redis.get(key)
        if current is not None and int(current) >= limit:
            raise TooManyRequestsError(msg)

    # 2) 全部通过后再递增
    for key, ttl, _limit, _msg in keys_specs:
        current = await redis.get(key)
        if current is None:
            await redis.set(key, 1, ex=ttl)
        else:
            await redis.incr(key)


async def generate_and_send_code(phone: str, purpose: str, ip: str | None = None) -> None:
    """生成并发送验证码，已含限流。

    Args:
        phone: E.164 不含 + 的手机号（如 8613800138000）
        purpose: register / login / reset_password
        ip: 客户端 IP（用于 IP 维度限流）
    """
    if purpose not in ALLOWED_PURPOSES:
        raise BadRequestError(f"无效的验证码用途：{purpose}")

    await _check_and_incr_rate_limits(phone, ip)

    code = _gen_code()
    redis = get_redis()
    key = f"sms:code:{purpose}:{phone}"
    await redis.set(key, code, ex=settings.SMS_VERIFY_CODE_TTL)

    # 同时清掉之前的失败计数与锁
    await redis.delete(f"sms:fail:{purpose}:{phone}")
    await redis.delete(f"sms:lock:{purpose}:{phone}")

    logger.info("[SMS-CODE] 生成验证码 phone=%s purpose=%s code=%s (TTL=%ds)",
                phone, purpose, code, settings.SMS_VERIFY_CODE_TTL)
    if not settings.SMS_ENABLED:
        logger.info("[SMS-DEV] phone=%s purpose=%s code=%s （开发模式不实际发送）", phone, purpose, code)

    await send_verification_code(phone, code, purpose)


async def verify_code(phone: str, code: str, purpose: str, *, consume: bool = True) -> None:
    """校验验证码。

    Args:
        consume: True 时校验成功后立即删除；False 时仅校验（用于 register 场景两步式）

    成功无返回；失败抛 BadRequestError / TooManyRequestsError。
    """
    if purpose not in ALLOWED_PURPOSES:
        raise BadRequestError(f"无效的验证码用途：{purpose}")
    if not code or not code.isdigit() or len(code) != 6:
        raise BadRequestError("验证码格式错误")

    redis = get_redis()

    # 先看是否被锁定
    lock_key = f"sms:lock:{purpose}:{phone}"
    if await redis.get(lock_key):
        raise TooManyRequestsError("验证码错误次数过多，请稍后再试")

    code_key = f"sms:code:{purpose}:{phone}"
    saved = await redis.get(code_key)
    if not saved:
        raise BadRequestError("验证码已过期，请重新获取")

    if saved != code:
        fail_key = f"sms:fail:{purpose}:{phone}"
        # 失败计数（TTL 跟随验证码 TTL）
        fails = await redis.incr(fail_key)
        if fails == 1:
            await redis.expire(fail_key, settings.SMS_VERIFY_CODE_TTL)
        if fails >= settings.SMS_VERIFY_MAX_FAIL:
            await redis.set(lock_key, 1, ex=settings.SMS_VERIFY_LOCK_SECONDS)
            await redis.delete(code_key)
            await redis.delete(fail_key)
            raise TooManyRequestsError("验证码错误次数过多，账号已被临时锁定")
        raise BadRequestError("验证码错误")

    if consume:
        await redis.delete(code_key)
        await redis.delete(f"sms:fail:{purpose}:{phone}")
