"""平台 → 上游 provider 路由。

国内平台走灵径(lapi)；海外平台走 Composio。新增海外平台只需在此登记 platform_code → toolkit。
provider 概念落在 MediaAccount.provider / PublishTask.provider 上，授权/发布按此分流。
"""
from __future__ import annotations

PROVIDER_LAPI = "lapi"
PROVIDER_COMPOSIO = "composio"

# platform_code（与灵径枚举同源，下游（如本仓库 backend）需保持一致）→ Composio toolkit slug（海外平台）
COMPOSIO_TOOLKIT: dict[str, str] = {
    "Twitter": "twitter",
    "LinkedIn": "linkedin",
    "Facebook": "facebook",
    "Instagram": "instagram",
    "TikTok": "tiktok",
    "Reddit": "reddit",
    "YouTube": "youtube",
}

COMPOSIO_PLATFORMS = frozenset(COMPOSIO_TOOLKIT.keys())


def provider_of(platform_code: str) -> str:
    """该平台的上游 provider：海外平台 → 'composio'，其余（国内）→ 'lapi'。"""
    return PROVIDER_COMPOSIO if platform_code in COMPOSIO_PLATFORMS else PROVIDER_LAPI


def toolkit_of(platform_code: str) -> str | None:
    """海外平台对应的 Composio toolkit slug；非海外平台返回 None。"""
    return COMPOSIO_TOOLKIT.get(platform_code)
