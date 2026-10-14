"""media account layer: 稳定账号抽象层（acc_xxx）

Revision ID: 0004_media_account
Revises: 0003_extend_proxies
Create Date: 2026-06-06 10:00:00.000000

引入对外稳定账号 id（MediaAccount.account_id / acc_xxx）。一个物理号
(platform_code, platform_user_id) = 一条 media；现有 lapi_accounts 降级为「灵径会话」
并回填 media_account_id；tenant_account_bindings 增 account_id 并按它鉴权；
account_metrics.lapi_account_id 由灵径会话 id 重映射为 acc_xxx。

迁移**不调灵径**（只建本地映射）；存量灵径重复会话的实际 revoke 由后续扫码/admin 处理。
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_media_account"
down_revision: Union[str, Sequence[str], None] = "0003_extend_proxies"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) media_accounts 表
    op.create_table(
        "media_accounts",
        sa.Column("id", sa.BINARY(16), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"),
                  server_onupdate=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("account_id", sa.String(40), nullable=False, unique=True),
        sa.Column("platform_code", sa.String(32), nullable=False),
        sa.Column("platform_user_id", sa.String(128), nullable=False),
        sa.Column("platform_user_name", sa.String(200), nullable=True),
        sa.Column("platform_avatar", sa.String(500), nullable=True),
        sa.Column("status", sa.Enum("active", "expired", "revoked", name="media_account_status"),
                  nullable=False, server_default="active"),
        sa.Column("current_lapi_account_id", sa.String(64), nullable=True),
        sa.Column("last_authed_at", sa.DateTime(), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("platform_code", "platform_user_id", name="uq_media_platform_user"),
    )
    op.create_index("ix_media_accounts_account_id", "media_accounts", ["account_id"])
    op.create_index("ix_media_accounts_platform_code", "media_accounts", ["platform_code"])
    op.create_index("ix_media_accounts_current_lapi_account_id", "media_accounts", ["current_lapi_account_id"])

    # 2) lapi_accounts.media_account_id
    op.add_column("lapi_accounts", sa.Column("media_account_id", sa.BINARY(16), nullable=True))
    op.create_index("ix_lapi_accounts_media_account_id", "lapi_accounts", ["media_account_id"])
    op.create_foreign_key(
        "fk_lapi_accounts_media_account", "lapi_accounts", "media_accounts",
        ["media_account_id"], ["id"], ondelete="SET NULL",
    )

    # 3) tenant_account_bindings.account_id + 放开 lapi_account_id 可空
    op.add_column("tenant_account_bindings", sa.Column("account_id", sa.String(40), nullable=True))
    op.create_index("ix_tenant_account_bindings_account_id", "tenant_account_bindings", ["account_id"])
    op.alter_column("tenant_account_bindings", "lapi_account_id",
                    existing_type=sa.String(64), nullable=True)

    # 4) 数据回填
    conn = op.get_bind()
    sessions = conn.execute(sa.text(
        "SELECT id, lapi_account_id, platform_code, platform_user_id, platform_user_name, "
        "platform_avatar, status, last_authed_at, last_sync_at, created_at FROM lapi_accounts"
    )).fetchall()

    groups: dict[tuple[str, str], list] = {}
    for r in sessions:
        groups.setdefault((r.platform_code, r.platform_user_id), []).append(r)

    lapi_to_account: dict[str, str] = {}  # 灵径会话 id -> acc_xxx
    for (pc, puid), grp in groups.items():
        actives = [s for s in grp if s.status == "active"]
        pool = actives or grp
        survivor = max(pool, key=lambda s: s.created_at or datetime.min)
        media_id = uuid.uuid4().bytes
        account_id = "acc_" + uuid.uuid4().hex
        st = survivor.status if survivor.status in ("active", "expired", "revoked") else "active"
        conn.execute(sa.text(
            "INSERT INTO media_accounts "
            "(id, account_id, platform_code, platform_user_id, platform_user_name, platform_avatar, "
            " status, current_lapi_account_id, last_authed_at, last_sync_at) "
            "VALUES (:id,:aid,:pc,:puid,:name,:avatar,:st,:cur,:la,:ls)"
        ), {
            "id": media_id, "aid": account_id, "pc": pc, "puid": puid,
            "name": survivor.platform_user_name, "avatar": survivor.platform_avatar,
            "st": st, "cur": survivor.lapi_account_id,
            "la": survivor.last_authed_at, "ls": survivor.last_sync_at,
        })
        for s in grp:
            conn.execute(sa.text("UPDATE lapi_accounts SET media_account_id=:m WHERE id=:sid"),
                         {"m": media_id, "sid": s.id})
            if s.lapi_account_id:
                lapi_to_account[s.lapi_account_id] = account_id

    # bindings：按会话 id 反查 acc_xxx；同 (app, acc) 多条折叠为一条
    bindings = conn.execute(sa.text(
        "SELECT id, app_id, lapi_account_id, status FROM tenant_account_bindings"
    )).fetchall()
    seen: dict[tuple, object] = {}
    for b in bindings:
        acc = lapi_to_account.get(b.lapi_account_id)
        if acc is None:
            continue
        key = (bytes(b.app_id), acc)
        if key in seen:
            conn.execute(sa.text("DELETE FROM tenant_account_bindings WHERE id=:id"), {"id": b.id})
            continue
        seen[key] = b.id
        conn.execute(sa.text("UPDATE tenant_account_bindings SET account_id=:acc WHERE id=:id"),
                     {"acc": acc, "id": b.id})

    # account_metrics：lapi_account_id（灵径会话 id）-> acc_xxx；同 (acc,date) 折叠
    metrics = conn.execute(sa.text(
        "SELECT id, lapi_account_id, snapshot_date FROM account_metrics"
    )).fetchall()
    seen_metric: set[tuple] = set()
    for m in metrics:
        acc = lapi_to_account.get(m.lapi_account_id)
        if acc is None:
            continue
        mkey = (acc, m.snapshot_date)
        if mkey in seen_metric:
            conn.execute(sa.text("DELETE FROM account_metrics WHERE id=:id"), {"id": m.id})
            continue
        seen_metric.add(mkey)
        conn.execute(sa.text("UPDATE account_metrics SET lapi_account_id=:acc WHERE id=:id"),
                     {"acc": acc, "id": m.id})

    # 5) (app_id, account_id) 唯一约束
    op.create_unique_constraint(
        "uq_tenant_binding_app_account", "tenant_account_bindings", ["app_id", "account_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_tenant_binding_app_account", "tenant_account_bindings", type_="unique")
    op.drop_index("ix_tenant_account_bindings_account_id", table_name="tenant_account_bindings")
    op.drop_column("tenant_account_bindings", "account_id")
    op.alter_column("tenant_account_bindings", "lapi_account_id",
                    existing_type=sa.String(64), nullable=False)

    op.drop_constraint("fk_lapi_accounts_media_account", "lapi_accounts", type_="foreignkey")
    op.drop_index("ix_lapi_accounts_media_account_id", table_name="lapi_accounts")
    op.drop_column("lapi_accounts", "media_account_id")

    op.drop_index("ix_media_accounts_current_lapi_account_id", table_name="media_accounts")
    op.drop_index("ix_media_accounts_platform_code", table_name="media_accounts")
    op.drop_index("ix_media_accounts_account_id", table_name="media_accounts")
    op.drop_table("media_accounts")
