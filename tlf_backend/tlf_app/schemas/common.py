"""通用响应包装 `{code, message, data}`。"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any, Generic, TypeVar

from pydantic import BaseModel, PlainSerializer


def _to_utc_iso(v: datetime | None) -> str | None:
    """naive datetime 视为 UTC 并序列化为带时区的 ISO 串（…+00:00）。

    本服务用 datetime.utcnow() 存的是不带时区的 UTC，直接序列化缺时区标记，
    前端 new Date() 会按本地时区解析 → 显示慢 8 小时。统一补 UTC 时区修正。
    """
    if v is None:
        return None
    if v.tzinfo is None:
        v = v.replace(tzinfo=timezone.utc)
    return v.isoformat()


# 用于所有「存储为 naive UTC、需回前端展示」的时间字段
UtcDateTime = Annotated[datetime, PlainSerializer(_to_utc_iso, return_type=str, when_used="always")]

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T] = []
    total: int = 0
    page: int = 1
    page_size: int = 20


def ok(data: Any = None) -> dict:
    return {"code": 0, "message": "ok", "data": data}
