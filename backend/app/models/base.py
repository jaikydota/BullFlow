from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BINARY, DateTime, TypeDecorator, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from uuid_utils import uuid7


class UUIDBin16(TypeDecorator):
    """Store UUID as BINARY(16) in MySQL, expose as str in Python."""

    impl = BINARY(16)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value.bytes
        return uuid.UUID(value).bytes

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return str(uuid.UUID(bytes=value))


def _generate_uuid7() -> str:
    return str(uuid7())


class Base(DeclarativeBase):
    pass


class BaseMixin:
    """All business tables inherit this mixin for multi-tenant isolation."""

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键，UUID v7（时序 ID）"
    )
    user_id: Mapped[str] = mapped_column(
        UUIDBin16, nullable=False, index=True, comment="所属用户 ID，多租户隔离键"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), comment="最后更新时间"
    )
