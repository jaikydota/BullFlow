"""add analytics events and daily stats tables

Revision ID: aab6e00fe1d9
Revises: d7e1f4a92c5b
Create Date: 2026-07-01 12:11:46.316063

说明：autogenerate 会把历史模型与库的无关漂移（comment / 索引改名 / server_default）
一并写入，已手工清理，本迁移**只新建**埋点两表；主键/user_id 用 BINARY(16)
（DDL 等价 ORM 的 UUIDBin16），避免引入类型装饰器 import。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'aab6e00fe1d9'
down_revision: Union[str, None] = 'd7e1f4a92c5b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # —— 每日聚合表 ——
    op.create_table(
        'analytics_daily_stats',
        sa.Column('id', sa.BINARY(16), nullable=False, comment='主键'),
        sa.Column('stat_date', sa.Date(), nullable=False, comment='统计日期（北京自然日）'),
        sa.Column('visit_users', sa.Integer(), server_default='0', nullable=False, comment='访问人数（distinct visitor）'),
        sa.Column('visit_pv', sa.Integer(), server_default='0', nullable=False, comment='页面访问量 PV'),
        sa.Column('register_users', sa.Integer(), server_default='0', nullable=False, comment='注册人数'),
        sa.Column('login_users', sa.Integer(), server_default='0', nullable=False, comment='登录人数（distinct user）'),
        sa.Column('create_project_count', sa.Integer(), server_default='0', nullable=False, comment='创建项目数'),
        sa.Column('generation_count', sa.Integer(), server_default='0', nullable=False, comment='生成开始次数'),
        sa.Column('generation_success_count', sa.Integer(), server_default='0', nullable=False, comment='生成成功次数'),
        sa.Column('generation_failed_count', sa.Integer(), server_default='0', nullable=False, comment='生成失败次数'),
        sa.Column('export_count', sa.Integer(), server_default='0', nullable=False, comment='导出开始次数'),
        sa.Column('export_success_count', sa.Integer(), server_default='0', nullable=False, comment='导出成功次数'),
        sa.Column('export_failed_count', sa.Integer(), server_default='0', nullable=False, comment='导出失败次数'),
        sa.Column('pricing_visit_users', sa.Integer(), server_default='0', nullable=False, comment='套餐页访问人数'),
        sa.Column('plan_select_users', sa.Integer(), server_default='0', nullable=False, comment='套餐选择人数'),
        sa.Column('pay_start_users', sa.Integer(), server_default='0', nullable=False, comment='支付发起人数'),
        sa.Column('pay_success_users', sa.Integer(), server_default='0', nullable=False, comment='支付成功人数'),
        sa.Column('pay_failed_count', sa.Integer(), server_default='0', nullable=False, comment='支付失败次数'),
        sa.Column('revenue_cents', sa.BigInteger(), server_default='0', nullable=False, comment='收入（分，来自真实订单表）'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_analytics_daily_stats_stat_date'), 'analytics_daily_stats', ['stat_date'], unique=True)

    # —— 原始事件表 ——
    op.create_table(
        'analytics_events',
        sa.Column('id', sa.BINARY(16), nullable=False, comment='主键 UUIDv7（时序）'),
        sa.Column('event_name', sa.String(length=64), nullable=False, comment='事件名（见 core/analytics_events.py）'),
        sa.Column('user_id', sa.BINARY(16), nullable=True, comment='登录用户 ID；匿名访客为空'),
        sa.Column('visitor_id', sa.String(length=64), nullable=False, comment='匿名访客 ID（前端生成，持久化于 localStorage）'),
        sa.Column('session_id', sa.String(length=64), nullable=True, comment='会话 ID（可选）'),
        sa.Column('page_url', sa.String(length=1024), nullable=True, comment='页面地址'),
        sa.Column('referrer', sa.String(length=1024), nullable=True, comment='来源地址'),
        sa.Column('properties', sa.JSON(), nullable=True, comment='事件详情（type / plan_slug / amount / error 等）'),
        sa.Column('ip', sa.String(length=64), nullable=True, comment='客户端 IP'),
        sa.Column('user_agent', sa.String(length=512), nullable=True, comment='User-Agent'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False, comment='发生时间（UTC）'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_analytics_events_created_at'), 'analytics_events', ['created_at'], unique=False)
    op.create_index(op.f('ix_analytics_events_event_name'), 'analytics_events', ['event_name'], unique=False)
    op.create_index('ix_analytics_events_name_time', 'analytics_events', ['event_name', 'created_at'], unique=False)
    op.create_index(op.f('ix_analytics_events_user_id'), 'analytics_events', ['user_id'], unique=False)
    op.create_index(op.f('ix_analytics_events_visitor_id'), 'analytics_events', ['visitor_id'], unique=False)


def downgrade() -> None:
    op.drop_table('analytics_events')
    op.drop_table('analytics_daily_stats')
