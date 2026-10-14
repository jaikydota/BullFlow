"""通联支付 RSA 签名 / 验签工具。

通联文档要求：
- 签名算法按 signtype 字段决定：
    * signtype=RSA  → SHA1WithRSA（老商户）
    * signtype=RSA2 → SHA256WithRSA（新商户，2020+ 大多数）
- 待签串：剔除空值字段、sign、signtype 后，按 key 升序拼接 `k1=v1&k2=v2`（不做 url-encode）
- 签名后 base64 编码
- 商户私钥用于上送签名；通联平台公钥用于验证异步回调
"""
from __future__ import annotations

import base64
import logging
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

logger = logging.getLogger(__name__)

# 通联拼接串只排除 sign 字段；signtype **要参与签名**（见 doc/2318 收银宝安全规范原文示例）
_EXCLUDED_FIELDS = {"sign"}


def _hash_alg(sign_type: str) -> hashes.HashAlgorithm:
    """signtype → cryptography 哈希实例。"""
    st = (sign_type or "RSA").upper()
    if st == "RSA2":
        return hashes.SHA256()
    return hashes.SHA1()


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def build_sign_payload(params: Mapping[str, Any]) -> str:
    """按通联规则拼接待签字符串。"""
    pairs: list[tuple[str, str]] = []
    for k, v in params.items():
        if k in _EXCLUDED_FIELDS:
            continue
        s = _stringify(v)
        if s == "":  # 剔除空值字段
            continue
        pairs.append((k, s))
    pairs.sort(key=lambda kv: kv[0])
    return "&".join(f"{k}={v}" for k, v in pairs)


def _load_private_key(pem_or_b64: str) -> rsa.RSAPrivateKey:
    """支持两种格式：完整 PEM（含 BEGIN/END）或单行 base64（PKCS#8 DER）。"""
    text = (pem_or_b64 or "").strip()
    if not text:
        raise ValueError("ALLINPAY_PRIVATE_KEY is empty")
    if "BEGIN" in text:
        pem_bytes = text.encode("utf-8")
    else:
        # 单行 base64 视为 PKCS#8 DER
        single = "".join(text.split())
        pem_bytes = (
            b"-----BEGIN PRIVATE KEY-----\n"
            + "\n".join(single[i : i + 64] for i in range(0, len(single), 64)).encode()
            + b"\n-----END PRIVATE KEY-----\n"
        )
    key = serialization.load_pem_private_key(pem_bytes, password=None)
    if not isinstance(key, rsa.RSAPrivateKey):
        raise ValueError("ALLINPAY_PRIVATE_KEY is not an RSA private key")
    return key


def _load_public_key(pem_or_b64: str) -> rsa.RSAPublicKey:
    text = (pem_or_b64 or "").strip()
    if not text:
        raise ValueError("ALLINPAY_PUBLIC_KEY is empty")
    if "BEGIN" in text:
        pem_bytes = text.encode("utf-8")
    else:
        single = "".join(text.split())
        pem_bytes = (
            b"-----BEGIN PUBLIC KEY-----\n"
            + "\n".join(single[i : i + 64] for i in range(0, len(single), 64)).encode()
            + b"\n-----END PUBLIC KEY-----\n"
        )
    key = serialization.load_pem_public_key(pem_bytes)
    if not isinstance(key, rsa.RSAPublicKey):
        raise ValueError("ALLINPAY_PUBLIC_KEY is not an RSA public key")
    return key


def build_sign(
    params: Mapping[str, Any],
    private_key_pem: str,
    sign_type: str = "RSA",
) -> str:
    """用商户私钥对 params 做 RSA 签名，返回 base64。

    sign_type=RSA   → SHA1WithRSA
    sign_type=RSA2  → SHA256WithRSA
    """
    payload = build_sign_payload(params)
    key = _load_private_key(private_key_pem)
    sig = key.sign(payload.encode("utf-8"), padding.PKCS1v15(), _hash_alg(sign_type))
    return base64.b64encode(sig).decode("ascii")


def verify_sign(
    params: Mapping[str, Any],
    sign_b64: str,
    public_key_pem: str,
    sign_type: str = "RSA",
) -> bool:
    """用通联公钥验证回调签名。sign_type 与 build_sign 对应。"""
    if not sign_b64:
        return False
    payload = build_sign_payload(params)
    try:
        key = _load_public_key(public_key_pem)
        key.verify(
            base64.b64decode(sign_b64),
            payload.encode("utf-8"),
            padding.PKCS1v15(),
            _hash_alg(sign_type),
        )
        return True
    except (InvalidSignature, ValueError) as e:
        logger.warning("[ALLINPAY-SIGN] verify failed: %s | payload=%s", e, payload[:200])
        return False
