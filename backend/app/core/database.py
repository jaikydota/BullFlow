from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

engine = create_async_engine(
    settings.MYSQL_URL,
    # 关闭 SQLAlchemy SQL echo，避免控制台输出冗余 SQL 语句
    echo=False,
    # pool_pre_ping 在每次 checkout 前发 SELECT 1，高并发时会放大延迟。
    # 改用 pool_recycle 定期丢弃闲置连接，避免 MySQL wait_timeout 断连，
    # 同时不在请求路径上增加额外 RTT。
    pool_pre_ping=False,
    pool_recycle=1800,   # 30 分钟未使用的连接主动回收
    pool_size=20,
    max_overflow=10,
)


# 全系统统一存 UTC：把每条连接的会话时区设为 +00:00，使 func.now()/CURRENT_TIMESTAMP
# （created_at/updated_at 的 server_default）产出 UTC，与代码侧 utcnow() 写入的业务字段一致。
# 容器 TZ 仍是 Asia/Shanghai，这里通过会话 tz 与之解耦。
# 注：所有时间列均为 DATETIME（无 TIMESTAMP），该设置只影响 NOW() 取值，不会重解释已存值。
@event.listens_for(engine.sync_engine, "connect")
def _set_session_utc(dbapi_connection, connection_record):  # noqa: ANN001, ARG001
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("SET time_zone = '+00:00'")
    finally:
        cursor.close()

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
