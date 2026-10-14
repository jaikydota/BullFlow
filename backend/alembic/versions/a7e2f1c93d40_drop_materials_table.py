"""drop_materials_table

媒体下的"素材"功能整体下线（图片库 / 视频库 / 音频库 / 文档已覆盖全部用户场景），
彻底删除 materials 表及其用户隔离索引。

Revision ID: a7e2f1c93d40
Revises: f1a3d6c0892e
Create Date: 2026-05-23 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

import app.models.base


revision: str = "a7e2f1c93d40"
down_revision: Union[str, None] = "f1a3d6c0892e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index(op.f("ix_materials_user_id"), table_name="materials")
    op.drop_table("materials")


def downgrade() -> None:
    # 回滚：按 b9f0ed565fb1_init.py 中的原始定义重建表（不恢复数据）
    op.create_table(
        "materials",
        sa.Column("name", sa.String(length=255), nullable=False, comment="素材名称"),
        sa.Column(
            "type",
            sa.Enum("image", "video", "document", "audio", "other", name="material_type"),
            nullable=False,
            comment="素材类型（image=图片，video=视频，document=文档，audio=音频，other=其他）",
        ),
        sa.Column("file_path", sa.String(length=1000), nullable=False, comment="存储路径（对象存储 key 或本地相对路径）"),
        sa.Column("thumbnail_path", sa.String(length=1000), nullable=True, comment="缩略图路径"),
        sa.Column("file_size", sa.BigInteger(), nullable=True, comment="文件大小（字节）"),
        sa.Column("description", sa.Text(), nullable=True, comment="素材描述"),
        sa.Column("category", sa.String(length=100), nullable=True, comment="素材分类"),
        sa.Column("tags", sa.JSON(none_as_null=True), nullable=True, comment="自定义标签列表"),
        sa.Column(
            "metadata",
            sa.JSON(none_as_null=True),
            nullable=True,
            comment="扩展元数据（JSON，如尺寸、时长等；预留字段，当前未使用）",
        ),
        sa.Column("id", app.models.base.UUIDBin16(length=16), nullable=False, comment="主键，UUID v7（时序 ID）"),
        sa.Column(
            "user_id",
            app.models.base.UUIDBin16(length=16),
            nullable=False,
            comment="所属用户 ID，多租户隔离键",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
            comment="创建时间",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
            comment="最后更新时间",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_materials_user_id"), "materials", ["user_id"], unique=False)
