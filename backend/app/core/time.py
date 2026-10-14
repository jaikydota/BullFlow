"""统一时间处理（全系统单一来源）。

规范（详见各模块约定）：
- **存储**：DB 内所有时间戳一律 UTC，以 naive datetime 形式存入 DATETIME 列。
  写库时间统一走 `utcnow()`；DB 端 `func.now()` 也产 UTC（连接会话 time_zone=+00:00，见 core/database.py）。
- **序列化**：返回前端的时间一律带 `+00:00`（把 naive 视为 UTC），不要用裸 `.isoformat()`。
  Pydantic 响应模型继承 `UtcModel` 自动处理；裸 dict 接口用 `to_utc_iso()`。
- **前端**：把带时区的 ISO 串转浏览器本地显示。
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, PlainSerializer, SerializerFunctionWrapHandler, field_serializer


def utcnow() -> datetime:
    """当前 UTC 时间（naive，无 tzinfo）。

    替代已弃用的 `datetime.utcnow()`：行为一致（返回 naive UTC），但不触发 Py3.12 弃用告警。
    所有写库时间都应使用本函数，保证全系统统一存 UTC。
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_utc_iso(value: datetime | None) -> str | None:
    """把 naive datetime 视为 UTC，序列化为带 `+00:00` 的 ISO 字符串；None 透传。

    用于直接返回 dict（非 Pydantic 模型）的接口，避免裸 `.isoformat()` 丢时区
    导致前端按本地时间解析、产生 8 小时偏差。
    """
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _naive_datetime_to_utc_iso(value: datetime) -> str:
    """Pydantic 字段序列化器：naive datetime 视为 UTC，输出带 `+00:00` 的 ISO。"""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


# 字段级标注：`expires_at: UtcDateTime` 即可获得正确序列化（仅 json 模式生效）
UtcDateTime = Annotated[
    datetime, PlainSerializer(_naive_datetime_to_utc_iso, return_type=str, when_used="json")
]


class UtcModel(BaseModel):
    """响应模型基类：自动把所有 datetime 字段按 UTC 序列化（带 `+00:00`）。

    含时间字段的响应 schema 继承本类即可，无需逐字段标注 `UtcDateTime`，避免遗漏。
    同时开启 from_attributes，便于从 ORM 对象 `model_validate`。
    """

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("*", mode="wrap", when_used="json")
    def _serialize_datetimes(self, value: Any, handler: SerializerFunctionWrapHandler) -> Any:
        if isinstance(value, datetime):
            return _naive_datetime_to_utc_iso(value)
        return handler(value)
