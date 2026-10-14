"""generation_schedules 生成设置改为统一 gen_config JSON

Revision ID: e5a7c9f1b3d6
Revises: d4f6a8c0e2b7
Create Date: 2026-06-25

自动任务「生成设置」改为复用三个生成页的配置面板，统一存进一个 gen_config JSON。
丢弃旧的扁平列：prompt / platform / template_label / provider / model / brand_info / parameters。

注：升级会清空 generation_schedules 表（旧扁平列无法迁移为 gen_config），避免遗留 gen_config=NULL 的孤儿行；升级后需重新创建自动任务规则。
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5a7c9f1b3d6"
down_revision: Union[str, None] = "d4f6a8c0e2b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 清空旧规则，避免遗留 gen_config=NULL 的行无法执行
    op.execute("DELETE FROM generation_schedules")
    op.add_column(
        "generation_schedules",
        sa.Column("gen_config", sa.JSON(none_as_null=True), nullable=True, comment="生成配置 JSON（对齐三个生成页请求体）"),
    )
    for col in ("prompt", "platform", "template_label", "provider", "model", "brand_info", "parameters"):
        op.drop_column("generation_schedules", col)


def downgrade() -> None:
    op.add_column("generation_schedules", sa.Column("prompt", sa.Text(), nullable=False))
    op.add_column("generation_schedules", sa.Column("platform", sa.String(50), nullable=True))
    op.add_column("generation_schedules", sa.Column("template_label", sa.String(200), nullable=True))
    op.add_column("generation_schedules", sa.Column("provider", sa.String(50), nullable=True))
    op.add_column("generation_schedules", sa.Column("model", sa.String(100), nullable=True))
    op.add_column("generation_schedules", sa.Column("brand_info", sa.Text(), nullable=True))
    op.add_column("generation_schedules", sa.Column("parameters", sa.JSON(none_as_null=True), nullable=True))
    op.drop_column("generation_schedules", "gen_config")
