"""init tlf schema (7 tables)

Revision ID: 0001_init_tlf
Revises:
Create Date: 2026-05-28 12:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_init_tlf"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── developer_apps ──
    op.create_table(
        "developer_apps",
        sa.Column("id", sa.BINARY(16), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"),
                  server_onupdate=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("app_id", sa.String(64), nullable=False, unique=True),
        sa.Column("app_key_hash", sa.String(128), nullable=False),
        sa.Column("webhook_url", sa.String(500), nullable=True),
        sa.Column("webhook_secret", sa.String(128), nullable=False),
        sa.Column("status", sa.Enum("active", "disabled", name="developer_app_status"),
                  nullable=False, server_default="active"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by_admin_id", sa.String(64), nullable=True),
    )

    # ── proxies ──
    op.create_table(
        "proxies",
        sa.Column("id", sa.BINARY(16), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"),
                  server_onupdate=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("region", sa.String(64), nullable=True),
        sa.Column("server_add", sa.String(255), nullable=False),
        sa.Column("server_port", sa.Integer(), nullable=False),
        sa.Column("proxy_type", sa.Enum("socks5", "http", name="proxy_type"),
                  nullable=False, server_default="socks5"),
        sa.Column("user_name", sa.String(120), nullable=True),
        sa.Column("password", sa.String(255), nullable=True),
        sa.Column("max_users", sa.Integer(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.Enum("active", "expired", "disabled", name="proxy_status"),
                  nullable=False, server_default="active"),
    )

    # ── lapi_accounts ──
    op.create_table(
        "lapi_accounts",
        sa.Column("id", sa.BINARY(16), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"),
                  server_onupdate=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("lapi_account_id", sa.String(64), nullable=False, unique=True),
        sa.Column("platform_code", sa.String(32), nullable=False),
        sa.Column("platform_user_id", sa.String(128), nullable=False),
        sa.Column("platform_user_name", sa.String(200), nullable=True),
        sa.Column("platform_avatar", sa.String(500), nullable=True),
        sa.Column("status", sa.Enum("active", "expired", "revoked", "orphaned", name="lapi_account_status"),
                  nullable=False, server_default="active"),
        sa.Column("proxy_id", sa.BINARY(16), sa.ForeignKey("proxies.id", ondelete="SET NULL"), nullable=True),
        sa.Column("last_authed_at", sa.DateTime(), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_lapi_accounts_lapi_account_id", "lapi_accounts", ["lapi_account_id"])
    op.create_index("ix_lapi_accounts_platform_code", "lapi_accounts", ["platform_code"])
    op.create_index("ix_lapi_accounts_proxy_id", "lapi_accounts", ["proxy_id"])

    # ── tenant_account_bindings ──
    op.create_table(
        "tenant_account_bindings",
        sa.Column("id", sa.BINARY(16), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"),
                  server_onupdate=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("app_id", sa.BINARY(16), sa.ForeignKey("developer_apps.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lapi_account_id", sa.String(64), nullable=False),
        sa.Column("custom_label", sa.String(120), nullable=True),
        sa.Column("status", sa.Enum("active", "unbound", name="binding_status"),
                  nullable=False, server_default="active"),
        sa.Column("binding_metadata", sa.JSON(), nullable=True),
        sa.Column("bound_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("app_id", "lapi_account_id", name="uq_tenant_binding_app_lapi"),
    )
    op.create_index("ix_tenant_account_bindings_app_id", "tenant_account_bindings", ["app_id"])
    op.create_index("ix_tenant_account_bindings_lapi_account_id", "tenant_account_bindings", ["lapi_account_id"])

    # ── publish_tasks ──
    op.create_table(
        "publish_tasks",
        sa.Column("id", sa.BINARY(16), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"),
                  server_onupdate=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("app_id", sa.BINARY(16), sa.ForeignKey("developer_apps.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_content_id", sa.String(64), nullable=True),
        sa.Column("content_payload", sa.JSON(), nullable=True),
        sa.Column("lapi_operation_id", sa.String(64), nullable=True),
        sa.Column("platform_code", sa.String(32), nullable=False),
        sa.Column("target_lapi_account_ids", sa.JSON(), nullable=False),
        sa.Column("account_snapshot", sa.JSON(), nullable=True),
        sa.Column("status", sa.Enum("pending", "publishing", "success", "partial", "failed", "cancelled",
                                    name="publish_task_status"),
                  nullable=False, server_default="pending"),
        sa.Column("total_count", sa.Integer(), server_default="0"),
        sa.Column("success_count", sa.Integer(), server_default="0"),
        sa.Column("failed_count", sa.Integer(), server_default="0"),
        sa.Column("result_summary", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("pre_pub_time", sa.BigInteger(), nullable=True),
    )
    op.create_index("ix_publish_tasks_app_id", "publish_tasks", ["app_id"])
    op.create_index("ix_publish_tasks_lapi_operation_id", "publish_tasks", ["lapi_operation_id"])

    # ── account_metrics ──
    op.create_table(
        "account_metrics",
        sa.Column("id", sa.BINARY(16), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"),
                  server_onupdate=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("lapi_account_id", sa.String(64), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("followers", sa.BigInteger(), server_default="0"),
        sa.Column("works_count", sa.BigInteger(), server_default="0"),
        sa.Column("total_likes", sa.BigInteger(), server_default="0"),
        sa.Column("total_views", sa.BigInteger(), server_default="0"),
        sa.Column("raw", sa.JSON(), nullable=True),
        sa.UniqueConstraint("lapi_account_id", "snapshot_date", name="uq_metric_account_date"),
    )
    op.create_index("ix_account_metrics_lapi_account_id", "account_metrics", ["lapi_account_id"])

    # ── webhook_events ──
    op.create_table(
        "webhook_events",
        sa.Column("id", sa.BINARY(16), primary_key=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"),
                  server_onupdate=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("app_id", sa.BINARY(16), sa.ForeignKey("developer_apps.id", ondelete="SET NULL"), nullable=True),
        sa.Column("lapi_event_type", sa.String(32), nullable=False),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("raw_body_text", sa.Text(), nullable=True),
        sa.Column("signature_ok", sa.Integer(), server_default="0", nullable=False),
        sa.Column("forward_status", sa.Enum("pending", "ok", "failed", "dead", "skipped",
                                            name="webhook_forward_status"),
                  nullable=False, server_default="pending"),
        sa.Column("forward_attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("forwarded_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
    )
    op.create_index("ix_webhook_events_app_id", "webhook_events", ["app_id"])
    op.create_index("ix_webhook_events_lapi_event_type", "webhook_events", ["lapi_event_type"])
    op.create_index("ix_webhook_events_forward_status", "webhook_events", ["forward_status"])


def downgrade() -> None:
    op.drop_table("webhook_events")
    op.drop_table("account_metrics")
    op.drop_table("publish_tasks")
    op.drop_table("tenant_account_bindings")
    op.drop_table("lapi_accounts")
    op.drop_table("proxies")
    op.drop_table("developer_apps")
    sa.Enum(name="webhook_forward_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="publish_task_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="binding_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="lapi_account_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="proxy_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="proxy_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="developer_app_status").drop(op.get_bind(), checkfirst=True)
