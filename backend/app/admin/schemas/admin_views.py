from __future__ import annotations

from pydantic import BaseModel, Field


class AdminUserListItem(BaseModel):
    id: str
    email: str
    phone: str | None = None
    nickname: str | None = None
    role: str
    status: str
    created_at: object | None = None
    # 以下套餐摘要字段非 ORM 列，由 endpoint 用当前 active 订阅在 model_dump 后合并填充
    plan_slug: str | None = None
    plan_name: str | None = None
    plan_status: str | None = None
    plan_expires_at: object | None = None
    points_remaining: int | None = None
    points_quota: int | None = None
    addon_points: int | None = None

    model_config = {"from_attributes": True}


class DashboardSummary(BaseModel):
    """后台仪表盘 KPI 汇总（admin_frontend 仪表盘使用）。"""

    tenant_total: int = Field(0, description="当前以 users 表中 role=user 数量近似租户主账号数")
    new_tenants_this_month: int = 0
    revenue_this_month_cents: int = 0
    pending_orders: int = 0
    stub: bool = Field(True, description="是否为占位数据；仪表盘接口返回真实统计时为 false")
