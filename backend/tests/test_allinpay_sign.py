"""通联签名工具单元测试。

主要验证：
- 待签字符串的拼接规则（按 key 升序、排除 sign/signtype/空值）
- 签名 / 验签往返
- 不同私钥 / 篡改后验签失败
"""
from __future__ import annotations

import base64

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.utils.allinpay_sign import build_sign, build_sign_payload, verify_sign


@pytest.fixture(scope="module")
def keypair() -> tuple[str, str]:
    """生成一对 RSA 2048 测试密钥（PKCS#8 PEM）。"""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    pub_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return priv_pem, pub_pem


def test_payload_excludes_sign_keeps_signtype():
    """通联规范：sign 排除；signtype 本身要参与签名；空值字段不参与（doc/2318）。"""
    params = {
        "b": "2",
        "a": "1",
        "sign": "should-not-included",
        "signtype": "RSA",
        "empty": "",
        "none_val": None,
    }
    payload = build_sign_payload(params)
    assert payload == "a=1&b=2&signtype=RSA"


def test_payload_matches_official_doc_example():
    """通联文档 doc/2318 给出的示例待签串，验证我们拼接规则一致。"""
    params = {
        "appid": "00000051",
        "cusid": "990581007426001",
        "randomstr": "82712208",
        "signtype": "RSA",
        "trxid": "112094120001088317",
        "version": "11",
    }
    expected = (
        "appid=00000051&cusid=990581007426001&randomstr=82712208"
        "&signtype=RSA&trxid=112094120001088317&version=11"
    )
    assert build_sign_payload(params) == expected


def test_payload_sorted_ascending():
    params = {"trxamt": "100", "appid": "X", "cusid": "C", "reqsn": "R"}
    payload = build_sign_payload(params)
    # 按 key 升序：appid < cusid < reqsn < trxamt
    assert payload == "appid=X&cusid=C&reqsn=R&trxamt=100"


def test_sign_and_verify_roundtrip(keypair: tuple[str, str]):
    priv, pub = keypair
    params = {
        "cusid": "000000000000000",
        "appid": "00000000",
        "trxamt": "1",
        "paytype": "A01",
        "reqsn": "ORD20260520000001",
        "body": "Pro 月付订阅",
        "signtype": "RSA",
    }
    sig = build_sign(params, priv)
    # 模拟把 sign 也带回（应被验签流程剔除）
    params_with_sign = {**params, "sign": sig}
    assert verify_sign(params_with_sign, sig, pub) is True


def test_rsa2_sha256_roundtrip(keypair: tuple[str, str]):
    """signtype=RSA2 → SHA256WithRSA，签验一致。"""
    priv, pub = keypair
    params = {"cusid": "C", "trxamt": "100", "reqsn": "R"}
    sig = build_sign(params, priv, sign_type="RSA2")
    assert verify_sign(params, sig, pub, sign_type="RSA2") is True
    # 用 RSA (SHA1) 验 RSA2 (SHA256) 签名应当失败
    assert verify_sign(params, sig, pub, sign_type="RSA") is False


def test_verify_rejects_tampered_amount(keypair: tuple[str, str]):
    priv, pub = keypair
    params = {"cusid": "C", "trxamt": "100", "reqsn": "R1"}
    sig = build_sign(params, priv)
    tampered = {**params, "trxamt": "200"}
    assert verify_sign(tampered, sig, pub) is False


def test_verify_rejects_wrong_key():
    key1 = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    key2 = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv1 = key1.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    pub2 = key2.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    params = {"cusid": "C", "trxamt": "10", "reqsn": "R"}
    sig = build_sign(params, priv1)
    assert verify_sign(params, sig, pub2) is False


def test_supports_single_line_base64(keypair: tuple[str, str]):
    """私钥/公钥也接受去掉 BEGIN/END 后的单行 base64。"""
    priv_pem, pub_pem = keypair
    # 提取 PEM 主体
    def strip(p: str) -> str:
        lines = [ln for ln in p.strip().splitlines() if not ln.startswith("-----")]
        return "".join(lines)
    priv_b64 = strip(priv_pem)
    pub_b64 = strip(pub_pem)
    params = {"a": "1", "b": "2"}
    sig = build_sign(params, priv_b64)
    assert verify_sign(params, sig, pub_b64) is True
