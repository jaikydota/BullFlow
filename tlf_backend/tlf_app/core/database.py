from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from tlf_app.core.config import settings

engine = create_async_engine(
    settings.MYSQL_URL,
    echo=False,
    pool_pre_ping=False,
    pool_recycle=1800,
    pool_size=10,
    max_overflow=5,
)

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
