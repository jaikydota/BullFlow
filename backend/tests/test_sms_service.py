"""梦网 SMS 平台鉴权算法单元测试

参考梦网国际短信平台 API 说明 V5.18.1 §3.1 给出的样例：
    账号: J10003
    密码: 111111
    固定字符串: 00000000
    时间戳: 0803192020

    SHA256 加密前: J1000300000000111111080 3192020
    SHA256 加密后: 027f1d602d974a8071d84985b19320977b17f80ac9424f9b724793cd30887c83
"""
from __future__ import annotations

from app.services.sms_service import _sign, render_template


def test_sign_matches_pdf_example():
    """PDF §3.1 鉴权样例必须精确匹配。"""
    expected = "027f1d602d974a8071d84985b19320977b17f80ac9424f9b724793cd30887c83"
    actual = _sign("J10003", "111111", "0803192020")
    assert actual == expected, f"鉴权算法实现错误：expected={expected} actual={actual}"


def test_sign_uppercases_userid():
    """userid 大小写不敏感，函数内部应转大写。"""
    assert _sign("j10003", "111111", "0803192020") == _sign("J10003", "111111", "0803192020")


def test_render_template_register(monkeypatch):
    """注册模板应含签名 + 验证码。"""
    from app.core import config as cfg_mod
    monkeypatch.setattr(cfg_mod.settings, "SMS_SIGNATURE", "【中巨量科技】")
    text = render_template("register", "123456")
    assert text.startswith("【中巨量科技】")
    assert "123456" in text
    assert "注册" in text


def test_render_template_login(monkeypatch):
    from app.core import config as cfg_mod
    monkeypatch.setattr(cfg_mod.settings, "SMS_SIGNATURE", "【示例签名】")
    text = render_template("login", "654321")
    assert text.startswith("【示例签名】")
    assert "654321" in text
    assert "登录" in text


def test_render_template_reset(monkeypatch):
    from app.core import config as cfg_mod
    monkeypatch.setattr(cfg_mod.settings, "SMS_SIGNATURE", "【中巨量科技】")
    text = render_template("reset_password", "987654")
    assert text.startswith("【中巨量科技】")
    assert "987654" in text
    assert "重置" in text
