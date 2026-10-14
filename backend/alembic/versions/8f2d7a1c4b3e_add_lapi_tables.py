"""add_lapi_tables

Revision ID: 8f2d7a1c4b3e
Revises: d1e2f3a4b5c6
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8f2d7a1c4b3e'
down_revision: Union[str, None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'lapi_accounts',
        sa.Column('id', sa.BINARY(16), primary_key=True, comment='主键，UUID v7（时序 ID）'),
        sa.Column('user_id', sa.BINARY(16), nullable=False, comment='所属用户 ID，多租户隔离键'),
        sa.Column('lapi_account_id', sa.String(64), nullable=False, comment='灵径平台返回的账号 ID（data.id）'),
        sa.Column('platform_code', sa.String(32), nullable=False, comment='平台代码（DouYin / Xhs / ...）'),
        sa.Column('platform_user_id', sa.String(128), nullable=False, comment='社媒平台原生用户 ID'),
        sa.Column('platform_user_name', sa.String(200), nullable=True, comment='社媒平台展示名'),
        sa.Column('platform_avatar', sa.String(500), nullable=True, comment='头像 URL'),
        sa.Column(
            'status',
            sa.Enum('active', 'expired', 'revoked', name='lapi_account_status'),
            nullable=False, server_default='active',
            comment='账号状态：active=可用 / expired=登录态过期 / revoked=已撤销',
        ),
        sa.Column('last_authed_at', sa.DateTime(), nullable=True, comment='最近一次授权成功时间'),
        sa.Column('last_sync_at', sa.DateTime(), nullable=True, comment='最近一次主动同步状态时间'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False, comment='创建时间'),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False, comment='最后更新时间'),
    )
    op.create_index('ix_lapi_accounts_user_id', 'lapi_accounts', ['user_id'])
    op.create_index('ix_lapi_accounts_lapi_account_id', 'lapi_accounts', ['lapi_account_id'])
    op.create_unique_constraint(
        'uq_lapi_account_user_plat',
        'lapi_accounts',
        ['user_id', 'platform_code', 'platform_user_id'],
    )

    op.create_table(
        'lapi_distribution_tasks',
        sa.Column('id', sa.BINARY(16), primary_key=True, comment='主键，UUID v7'),
        sa.Column('user_id', sa.BINARY(16), nullable=False, comment='所属用户 ID'),
        sa.Column('content_id', sa.String(36), nullable=True, comment='关联 GeneratedContent.id'),
        sa.Column('content_snapshot', sa.JSON(none_as_null=True), nullable=True, comment='内容快照'),
        sa.Column('lapi_operation_id', sa.String(64), nullable=True, comment='灵径 operationId'),
        sa.Column('platform_code', sa.String(32), nullable=False, comment='平台代码'),
        sa.Column('target_account_ids', sa.JSON(none_as_null=True), nullable=False, comment='目标账号本地 ID 数组'),
        sa.Column('account_snapshot', sa.JSON(none_as_null=True), nullable=True, comment='账号快照'),
        sa.Column(
            'status',
            sa.Enum('pending', 'publishing', 'success', 'partial', 'failed', 'cancelled', name='lapi_dist_status'),
            nullable=False, server_default='pending',
        ),
        sa.Column('total_count', sa.Integer(), server_default='0'),
        sa.Column('success_count', sa.Integer(), server_default='0'),
        sa.Column('failed_count', sa.Integer(), server_default='0'),
        sa.Column('result_summary', sa.JSON(none_as_null=True), nullable=True, comment='每账号结果'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_lapi_dist_user_id', 'lapi_distribution_tasks', ['user_id'])
    op.create_index('ix_lapi_dist_operation_id', 'lapi_distribution_tasks', ['lapi_operation_id'])

    op.create_table(
        'lapi_account_metrics',
        sa.Column('id', sa.BINARY(16), primary_key=True, comment='主键，UUID v7'),
        sa.Column('user_id', sa.BINARY(16), nullable=False, comment='所属用户 ID'),
        sa.Column('lapi_account_id', sa.BINARY(16), nullable=False, comment='LapiAccount.id'),
        sa.Column('snapshot_date', sa.Date(), nullable=False, comment='快照日期'),
        sa.Column('followers', sa.BigInteger(), server_default='0'),
        sa.Column('works_count', sa.BigInteger(), server_default='0'),
        sa.Column('total_likes', sa.BigInteger(), server_default='0'),
        sa.Column('total_views', sa.BigInteger(), server_default='0'),
        sa.Column('raw', sa.JSON(none_as_null=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_lapi_metric_user_id', 'lapi_account_metrics', ['user_id'])
    op.create_index('ix_lapi_metric_account_id', 'lapi_account_metrics', ['lapi_account_id'])
    op.create_unique_constraint(
        'uq_lapi_metric_acct_date',
        'lapi_account_metrics',
        ['lapi_account_id', 'snapshot_date'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_lapi_metric_acct_date', 'lapi_account_metrics', type_='unique')
    op.drop_index('ix_lapi_metric_account_id', table_name='lapi_account_metrics')
    op.drop_index('ix_lapi_metric_user_id', table_name='lapi_account_metrics')
    op.drop_table('lapi_account_metrics')

    op.drop_index('ix_lapi_dist_operation_id', table_name='lapi_distribution_tasks')
    op.drop_index('ix_lapi_dist_user_id', table_name='lapi_distribution_tasks')
    op.drop_table('lapi_distribution_tasks')

    op.drop_constraint('uq_lapi_account_user_plat', 'lapi_accounts', type_='unique')
    op.drop_index('ix_lapi_accounts_lapi_account_id', table_name='lapi_accounts')
    op.drop_index('ix_lapi_accounts_user_id', table_name='lapi_accounts')
    op.drop_table('lapi_accounts')
