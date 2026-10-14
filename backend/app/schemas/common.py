from __future__ import annotations

import math
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

# 时间序列化助手统一来源：app/core/time.py（此处重导出，保持旧 import 路径可用）
from app.core.time import UtcDateTime, UtcModel  # noqa: F401

T = TypeVar("T")


class PageParams(BaseModel):
    page: int = Field(1, ge=1, description="页码")
    page_size: int = Field(20, ge=1, le=100, description="每页条数")


class PaginatedData(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int

    @classmethod
    def create(cls, *, items: list[T], total: int, page: int, page_size: int) -> PaginatedData[T]:
        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            pages=math.ceil(total / page_size) if page_size else 0,
        )


def success(data: Any = None, message: str = "ok") -> dict:
    return {"code": 0, "message": message, "data": data}


def error(code: int = 50000, message: str = "服务器内部错误", data: Any = None) -> dict:
    return {"code": code, "message": message, "data": data}
