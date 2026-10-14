"""额度检查与消耗 service：积分扣减（consume_points）与额度超限异常（QuotaExceededError）。"""
from __future__ import annotations

import logging

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.models.saas import SaasSubscription
from app.services.saas_subscription import lazy_expire_if_due

logger = logging.getLogger(__name__)


class QuotaExceededError(AppException):
    """额度超限（HTTP 402-style，使用 40300 表示禁止）"""

    def __init__(self, message: str = "套餐额度已用完，请升级或购买增值包"):
        super().__init__(code=40300, message=message)


# ---- 点数 ----


async def consume_points(
    db: AsyncSession,
    user_id: str,
    delta: int,
    *,
    biz_type: str,
    biz_ref_type: str | None = None,
    biz_ref_id: str | None = None,
    model_id: str | None = None,
    unit_price: float | None = None,
    units: float | None = None,
    remark: str | None = None,
    reason: str = "",  # 兼容旧调用：传字符串作为 remark 兜底
    allow_partial: bool = False,
) -> SaasSubscription:
    """扣点：先扣套餐周期内积分（订阅日清零，优先消费），不足再扣永久增量包积分。

    成功后会在同一事务里写一条 CreditTransaction 流水；失败抛 QuotaExceededError。
    并发安全：原子 UPDATE 同时校验两个余额池。

    allow_partial：
    - False（默认，**预付费/可拒绝**场景）：余额不足直接抛 QuotaExceededError，一分不扣。
    - True（**后付费/事后扣费**场景，如对话/文章/图片/视频生成完才知道真实成本）：
      余额不足时**扣到 0**（不透支，已产出的内容不回退），按实际扣减金额记账。
      这样可避免"剩少量积分但单次成本更高 → 全有或全无导致永远扣不掉 → 无限白嫖"。
    """
    if delta <= 0:
        raise ValueError("delta must be positive")
    # 惰性到期：付费订阅过期则先即时降级为 Free，确保扣费走的是当前真实套餐额度
    sub = await lazy_expire_if_due(db, user_id)
    if sub is None:
        raise QuotaExceededError("未找到有效订阅")

    subscription_remaining = max(0, sub.points_quota - sub.points_used)
    addon_balance = sub.addon_points

    if delta <= subscription_remaining:
        from_sub = delta
        from_addon = 0
    elif delta <= subscription_remaining + addon_balance:
        from_sub = subscription_remaining
        from_addon = delta - subscription_remaining
    elif allow_partial:
        # 后付费且余额不足：两池全部扣到 0（不透支），缺口部分免单（仅日志记录）
        from_sub = subscription_remaining
        from_addon = addon_balance
    else:
        raise QuotaExceededError(
            f"积分不足：套餐剩余 {subscription_remaining} + 增量包 {addon_balance}，需 {delta}"
        )

    actual = from_sub + from_addon  # 实际扣减（allow_partial 不足时 < delta）
    if actual <= 0:
        # 余额本就为 0（通常已被上游预校验拦截）：不写 0 元流水，直接返回
        logger.warning(
            "consume_points: user=%s 余额为 0，跳过扣费（请求 %s，biz=%s）",
            user_id, delta, biz_type,
        )
        return sub
    if actual < delta:
        logger.warning(
            "consume_points: user=%s 余额不足按实扣（请求 %s，实扣 %s，缺口 %s 免单，biz=%s）",
            user_id, delta, actual, delta - actual, biz_type,
        )

    r = await db.execute(
        update(SaasSubscription)
        .where(
            SaasSubscription.id == sub.id,
            SaasSubscription.points_used + from_sub <= SaasSubscription.points_quota,
            SaasSubscription.addon_points >= from_addon,
        )
        .values(
            points_used=SaasSubscription.points_used + from_sub,
            addon_points=SaasSubscription.addon_points - from_addon,
        )
    )
    if r.rowcount == 0:
        raise QuotaExceededError("积分不足（并发更新失败）")
    await db.refresh(sub)

    # 流水：扣自哪个池由 from_sub / from_addon 占比决定
    if from_addon == 0:
        source = "subscription"
    elif from_sub == 0:
        source = "addon"
    else:
        source = "mixed"

    # 延迟导入避免循环（credit_ledger 不依赖 saas_quota）
    from app.services import credit_ledger
    await credit_ledger.record_debit(
        db,
        user_id=user_id,
        amount=actual,  # 记实际扣减额（allow_partial 不足时 < delta），保证账实一致
        source=source,
        biz_type=biz_type,
        biz_ref_type=biz_ref_type,
        biz_ref_id=biz_ref_id,
        model_id=model_id,
        unit_price=unit_price,
        units=units,
        balance_after_sub=sub.points_quota - sub.points_used,
        balance_after_addon=sub.addon_points,
        remark=remark or (reason or None),
    )

    logger.info(
        "consume_points: user=%s -%s (sub=%s addon=%s biz=%s ref=%s/%s) "
        "sub_remaining=%s addon_remaining=%s",
        user_id, actual, from_sub, from_addon, biz_type, biz_ref_type, biz_ref_id,
        sub.points_quota - sub.points_used, sub.addon_points,
    )
    return sub


# ---- 社媒账号数 ----
# 账号配额按「实时计数」校验（usage_aggregator.get_user_account_count），不维护计数器。绑定校验见：
#   - tlf.py probe_accounts（「我已扫码」主动入库）
#   - tlf_webhook_service.py（webhook 授权回调）
