# -*- coding: utf-8 -*-
"""Composio 接入自检：列出当前 API key 可见的 auth config，并校验显式登记的 ac_id 是否可达。

用途：海外平台授权失败时先跑这个定位问题。最常见的坑是 **project 不匹配**——
Composio 的 API key 是 project 级，在 A 项目建的 auth config，用 B 项目的 key 查是 404，
表现为「dashboard 里明明建好了，网关却说找不到 / 仍去建托管配置」。

用法（在 tlf_backend 目录下）：
    python scripts/check_composio.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tlf_app.core.config import settings  # noqa: E402
from tlf_app.services.platform_registry import COMPOSIO_TOOLKIT  # noqa: E402


def main() -> int:
    if not settings.COMPOSIO_API_KEY:
        print("[x] 未配置 COMPOSIO_API_KEY")
        return 1
    # SDK 会读 os.environ 的 COMPOSIO_BASE_URL 覆盖内置 host，留空才走正确的 backend.composio.dev
    if not settings.COMPOSIO_BASE_URL:
        os.environ.pop("COMPOSIO_BASE_URL", None)

    from composio import Composio

    client = Composio(api_key=settings.COMPOSIO_API_KEY)

    print("=== 当前 API key 可见的 auth config ===")
    visible: dict[str, str] = {}
    try:
        resp = client.auth_configs.list()
        for item in (getattr(resp, "items", None) or []):
            toolkit = getattr(item, "toolkit", None)
            slug = (getattr(toolkit, "slug", None) or "?").lower()
            ac_id = getattr(item, "id", None)
            visible[slug] = ac_id
            print(f"  {slug:<12} {ac_id}")
        if not visible:
            print("  (空)")
    except Exception as exc:  # noqa: BLE001
        print(f"  [x] 列举失败：{exc}")
        return 1

    print()
    print("=== COMPOSIO_AUTH_CONFIG_IDS 显式登记项校验 ===")
    configured = settings.composio_auth_config_map()
    if not configured:
        print("  (未登记)")
    for toolkit, ac_id in configured.items():
        try:
            client.auth_configs.get(ac_id)
            print(f"  [ok] {toolkit:<12} {ac_id}")
        except Exception as exc:  # noqa: BLE001
            hint = ""
            if "not found" in str(exc).lower() or "404" in str(exc):
                hint = "  ← 该 id 不在当前 API key 的 project 下，请在同一 project 重建，或换用该 project 的 key"
            print(f"  [x]  {toolkit:<12} {ac_id}  {exc.__class__.__name__}{hint}")

    print()
    print("=== 各海外平台授权可用性 ===")
    for platform_code, toolkit in sorted(COMPOSIO_TOOLKIT.items()):
        if toolkit in configured:
            state = f"自建，ac={configured[toolkit]}"
        elif toolkit in visible:
            state = f"已有配置，ac={visible[toolkit]}"
        else:
            state = "无配置（授权时会尝试新建托管配置，无托管凭证的平台会失败）"
        print(f"  {platform_code:<10} -> {toolkit:<12} {state}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
