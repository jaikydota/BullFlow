"""海外社媒平台集合（走推量发网关的 Composio 上游，计入套餐「海外账号」配额）。

须与 tlf_backend `services/platform_registry.py` 的 COMPOSIO_PLATFORMS 同源；
前端对应 `frontend/src/utils/tlfPlatforms.ts` 的 OVERSEA_PLATFORMS。
Twitter/TikTok 当前需自建 OAuth 暂未放出，但仍归类海外（配额口径一致）。
"""
from __future__ import annotations

OVERSEA_PLATFORM_CODES: frozenset[str] = frozenset({
    "Twitter", "LinkedIn", "Facebook", "Instagram", "TikTok", "Reddit", "YouTube",
})


def is_oversea_platform(platform_code: str | None) -> bool:
    return bool(platform_code) and platform_code in OVERSEA_PLATFORM_CODES
