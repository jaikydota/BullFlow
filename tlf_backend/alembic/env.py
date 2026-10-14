"""Alembic env (推量发后端) —— 同步驱动跑迁移，运行时仍用 async。"""
from __future__ import annotations

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

from tlf_app.core.config import settings
from tlf_app.models import Base  # noqa: F401  确保所有模型 import

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# alembic 用同步 pymysql 驱动（仅迁移时）
sync_url = settings.MYSQL_URL.replace("mysql+asyncmy://", "mysql+pymysql://")
config.set_main_option("sqlalchemy.url", sync_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=sync_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
