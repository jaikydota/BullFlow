"""Async Redis 客户端单例。用于 webhook 防重放 / auth-op 状态缓存 / token 缓存。"""
from __future__ import annotations

import redis.asyncio as aioredis

from tlf_app.core.config import settings

_client: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _client
    if _client is None:
        _client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return _client
