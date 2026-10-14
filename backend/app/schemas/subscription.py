"""订阅状态 / 额度使用 schemas。"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.schemas.common import UtcDateTime


class QuotaUsage(BaseModel):
    quota: int
    used: int
    remaining: int
    percent: float  # 0 ~ 100


class SubscriptionOut(BaseModel):
    plan_slug: str
    plan_name: str
    period: Literal["month", "quarter", "year"]
    status: Literal["active", "expired", "cancelled"]
    started_at: UtcDateTime
    expires_at: UtcDateTime
    remaining_days: int
    features: list[str] = []
    points: QuotaUsage
    # 永久有效的增量包积分余额（不随订阅周期清零）
    addon_points: int = 0
    # 注：存储计的是字节数 used / GB quota；前端按 GB 展示
    storage_bytes_used: int
    storage_gb_quota: int
    storage_percent: float
    domestic_accounts: QuotaUsage
    overseas_accounts: QuotaUsage
    # 永久加包额度明细（存储 GB / 国内账号 / 国外账号）。上面各 quota 已含加包，这里单列供前端提示「含加包 X」
    addon_storage_gb: int = 0
    addon_domestic_accounts: int = 0
    addon_overseas_accounts: int = 0
