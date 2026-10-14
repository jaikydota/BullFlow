"""推量发后端密码学/签名工具。

- JWT：tlf 自有密钥，自己签发自己校验
- 用户密码 bcrypt（hash_password / verify_password）
- HMAC：用于 webhook 签名（接收灵径 + 转发到子租户）
- app_key / webhook_secret：随机 + bcrypt 哈希存储
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt

from tlf_app.core.config import settings

_BCRYPT_MAX_BYTES = 72


def _password_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


# ── 用户密码（AdminUser.password_hash）──

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_password_bytes(plain), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_password_bytes(plain), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ── 子租户密钥（app_key / webhook_secret）──

def hash_secret(plain: str) -> str:
    """对 app_key 等敏感凭据做 bcrypt 哈希（仅展示一次明文）。"""
    return bcrypt.hashpw(_password_bytes(plain), bcrypt.gensalt()).decode("utf-8")


def verify_secret(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_password_bytes(plain), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def generate_app_id() -> str:
    """生成对外可见的子租户标识，形如 `app_xxxxxxxxxxxxxxxx` (16 hex)。"""
    return "app_" + secrets.token_hex(8)


def generate_app_key() -> str:
    """生成开发者 API key（明文仅创建/重置时展示一次），形如 `tlf_sk_<43字符 base64url>`。"""
    return "tlf_sk_" + secrets.token_urlsafe(32)


def generate_webhook_secret() -> str:
    """生成 webhook HMAC secret，64 字符十六进制。"""
    return secrets.token_hex(32)


# ── JWT ──

def create_access_token(subject: str, extra: dict | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict = {"sub": subject, "exp": expire, "type": "access"}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])


# ── HMAC（webhook 签名）──

def hmac_sha256_hex(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def verify_webhook_signature(
    raw_body: bytes,
    timestamp: str,
    signature: str,
    secret: str,
) -> bool:
    """校验灵径风格 webhook 签名：HMAC-SHA256({timestamp}.{raw_body})。"""
    if not signature:
        return False
    sig = signature[len("sha256="):] if signature.startswith("sha256=") else signature
    msg = f"{timestamp}.".encode("utf-8") + raw_body
    expected = hmac_sha256_hex(secret, msg)
    return hmac.compare_digest(expected, sig)
