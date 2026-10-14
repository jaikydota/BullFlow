"""手机号归一化：与 C 端一致，中国大陆手机号存为 '86'+11 位（不含 +）。"""

from __future__ import annotations


def normalize_cn_phone(raw: str | None) -> str | None:
    """把输入手机号归一化为存储格式。

    - 11 位且以 1 开头的国内手机号 → '86' + 11 位（与 C 端 cnPhoneToE164 一致）；
    - 已是 '86' + 11 位 → 原样；
    - 其它（含国家码的国际号等）→ 去掉非数字后返回，空则返回原值。
    """
    if not raw:
        return raw
    s = raw.strip()
    digits = "".join(ch for ch in s if ch.isdigit())
    if len(digits) == 11 and digits.startswith("1"):
        return "86" + digits
    return digits or s


def phone_match_candidates(raw: str) -> set[str]:
    """登录匹配用：覆盖「11 位」与「86+11 位」两种存储形态。"""
    s = raw.strip()
    digits = "".join(ch for ch in s if ch.isdigit())
    out: set[str] = {s}
    if digits:
        out.add(digits)
        if len(digits) == 11 and digits.startswith("1"):
            out.add("86" + digits)
        if len(digits) == 13 and digits.startswith("86"):
            out.add(digits[2:])
    return {c for c in out if c}
