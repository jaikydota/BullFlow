"""读 platform_settings.billing_configuration 并计算各业务的积分扣费。

**单位约定**：`unitPrice` 直接是 **积分**（不是元）。后台 admin 输入的就是
"扣多少积分/单位"，前后端一致。

设计要点：
- 30 秒进程级缓存，避免每次扣费都查 DB；写操作（admin 改价）会触发短暂缓存延迟
- 所有 credits_for_xxx 函数返回 int，至少 1 积分
- 找不到模型 / 规格时回退到基准 unitPrice + warn log，不中断业务
"""
from __future__ import annotations

import logging
import math
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_platform import PlatformSetting

logger = logging.getLogger(__name__)

_CACHE_TTL_SECS = 30.0
_cache: dict[str, Any] = {"value": None, "expires_at": 0.0}


_PLATFORM_KEY = "billing_configuration"


def _now() -> float:
    return time.time()


async def get_billing_config(db: AsyncSession, *, force: bool = False) -> dict[str, Any]:
    """带 30s 缓存的 billing_configuration 读取。force=True 强刷。"""
    if not force and _cache["value"] is not None and _now() < _cache["expires_at"]:
        return _cache["value"]
    r = await db.execute(
        select(PlatformSetting.value).where(PlatformSetting.key == _PLATFORM_KEY)
    )
    value = r.scalar_one_or_none()
    cfg = value if isinstance(value, dict) else {}
    _cache["value"] = cfg
    _cache["expires_at"] = _now() + _CACHE_TTL_SECS
    return cfg


def _find_model(cfg: dict[str, Any], model_id: str | None) -> dict[str, Any] | None:
    if not model_id:
        return None
    for m in cfg.get("models") or []:
        if str(m.get("id")) == model_id:
            return m
    return None


def _matrix_multiplier(model: dict[str, Any], key: str | None) -> float:
    """从 model.pricingMatrix.items 找到匹配 key 的 multiplier；找不到返回 1.0。"""
    if not key:
        return 1.0
    matrix = model.get("pricingMatrix") or {}
    for item in matrix.get("items") or []:
        if str(item.get("key", "")).lower() == key.lower():
            try:
                return float(item.get("multiplier", 1.0))
            except (TypeError, ValueError):
                return 1.0
    logger.warning(
        "billing_config: model=%s 未配规格 key=%s，回退倍率 1.0",
        model.get("id"), key,
    )
    return 1.0


def _to_credits(amount: float) -> int:
    """向上取整，最低 1 积分。"""
    if amount <= 0:
        return 1
    return max(1, math.ceil(amount))


async def credits_for_text(
    db: AsyncSession,
    *,
    tokens: int,
    model_id: str | None,
) -> tuple[int, dict[str, Any]]:
    """text 计费：ceil(tokens / 1000 × unitPrice)。unitPrice 为 积分/1K tokens。"""
    cfg = await get_billing_config(db)
    m = _find_model(cfg, model_id)
    unit_price = float((m or {}).get("unitPrice", 0)) if m else 0.0
    units = max(1, int(tokens)) / 1000.0
    cost = unit_price * units
    return _to_credits(cost), {
        "model_id": model_id,
        "unit_price": unit_price,
        "units": float(tokens),
    }


async def credits_for_image(
    db: AsyncSession,
    *,
    model_id: str | None,
    size: str | None,
) -> tuple[int, dict[str, Any]]:
    """image 计费：ceil(unitPrice × multiplier(size))。unitPrice 为 积分/张。"""
    cfg = await get_billing_config(db)
    m = _find_model(cfg, model_id) or {}
    unit_price = float(m.get("unitPrice", 0))
    multiplier = _matrix_multiplier(m, size)
    cost = unit_price * multiplier
    return _to_credits(cost), {
        "model_id": model_id,
        "unit_price": unit_price * multiplier,  # 实际单价（含倍率）
        "units": 1.0,
    }


async def credits_for_video(
    db: AsyncSession,
    *,
    model_id: str | None,
    resolution: str | None,
    seconds: float,
) -> tuple[int, dict[str, Any]]:
    """video 计费：ceil(unitPrice × multiplier(res) × seconds)。unitPrice 为 积分/秒。"""
    cfg = await get_billing_config(db)
    m = _find_model(cfg, model_id) or {}
    unit_price = float(m.get("unitPrice", 0))
    multiplier = _matrix_multiplier(m, resolution)
    sec = max(1.0, float(seconds or 1.0))
    cost = unit_price * multiplier * sec
    return _to_credits(cost), {
        "model_id": model_id,
        "unit_price": unit_price * multiplier,  # 积分/秒（含分辨率倍率）
        "units": sec,
    }


async def credits_for_distribution(
    db: AsyncSession,
    *,
    account_count: int,
) -> tuple[int, dict[str, Any]]:
    """分发计费：account_count × distribution（distribution 为 积分/账号）。"""
    cfg = await get_billing_config(db)
    unit_credits = float(cfg.get("distribution", 1))
    n = max(1, int(account_count))
    credits = _to_credits(unit_credits * n)
    return credits, {
        "model_id": None,
        "unit_price": unit_credits,
        "units": float(n),
    }
