"""SDK 指标接口：触发采集 / 查询历史。对外用稳定 acc_xxx；上游调用用当前灵径会话。"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.database import get_db
from tlf_app.core.dependencies import get_current_app
from tlf_app.core.exceptions import ForbiddenError, NotFoundError
from tlf_app.models.account_metric import AccountMetric
from tlf_app.models.developer_app import DeveloperApp
from tlf_app.models.media_account import MediaAccount
from tlf_app.models.tenant_account_binding import TenantAccountBinding
from tlf_app.schemas.common import ok
from tlf_app.schemas.sdk import MetricResponse, RiskConfirmRequest
from tlf_app.services import lapi_client
from tlf_app.services.account_resolver import resolve_media_account
from tlf_app.services.lapi_account_op import lapi_account_op
from tlf_app.services.proxy_service import ensure_account_proxy

router = APIRouter()


async def _ensure_tenant_owns(db: AsyncSession, app_id: str, token: str) -> MediaAccount:
    """解析 token（acc_xxx 或老灵径 id）→ media，并校验 active 绑定到当前租户。"""
    media = await resolve_media_account(db, token)
    if media is None:
        raise NotFoundError("账号不存在")
    binding = (await db.execute(
        select(TenantAccountBinding)
        .where(TenantAccountBinding.app_id == app_id)
        .where(TenantAccountBinding.account_id == media.account_id)
        .where(TenantAccountBinding.status == "active")
    )).scalar_one_or_none()
    if binding is None:
        raise ForbiddenError("该账号未绑定到当前租户")
    return media


def _touch_used(media: MediaAccount) -> None:
    """打「使用」活跃戳（取分类/风控操作 = 租户在主动用该账号），供不活跃自动回收判定。

    注意两类**自动化**操作不打此戳，否则定时任务会让账号永不回收、回收机制形同虚设：
    - 登录态轮询检查（accounts sync）
    - 触发指标采集（trigger_metric）——下游（如本仓库 backend）普遍有「每日全量刷指标」定时任务
    随端点收尾 commit 持久化。
    """
    media.last_used_at = datetime.utcnow()


@router.post("/metrics/accounts/{account_id}/refresh")
async def trigger_metric(
    account_id: str,
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
):
    media = await _ensure_tenant_owns(db, current_app.id, account_id)
    # 刻意不打 _touch_used：下游普遍有「每日全量刷指标」定时任务，若算「使用」则所有账号被每日续命，
    # 不活跃回收机制形同虚设（同理登录态轮询也不算使用）
    if not media.current_lapi_account_id:
        raise NotFoundError("账号无可用底层会话，请重新授权")
    proxy = await ensure_account_proxy(db, media.current_lapi_account_id)
    cb = {"app_id": current_app.app_id, "lapi_account_id": media.current_lapi_account_id}
    async with lapi_account_op(db, media.current_lapi_account_id, proxy_op=True):
        await lapi_client.trigger_account_overview(media.current_lapi_account_id, callback_data=cb, proxy=proxy)
    return ok({"triggered": True})


@router.get("/accounts/{account_id}/categories")
async def get_account_categories(
    account_id: str,
    publish_kind: str = Query(..., pattern=r"^(video|article|dynamic)$"),
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
):
    """获取该账号在某发布类型下的内容分类树（部分平台发布必填，如哔哩哔哩视频）。

    账号须已绑定当前租户。返回 [{yixiaoerId, yixiaoerName, raw, child:[...]}]。
    """
    media = await _ensure_tenant_owns(db, current_app.id, account_id)
    _touch_used(media)
    if not media.current_lapi_account_id:
        raise NotFoundError("账号无可用底层会话，请重新授权")
    # 登录失效→置 expired；代理异常→禁用代理+解绑重分（统一在 lapi_account_op 处理）
    async with lapi_account_op(db, media.current_lapi_account_id):
        cats = await lapi_client.get_publish_categories(media.current_lapi_account_id, publish_kind)
    return ok({"categories": cats})


# ============ 抖音发布风控解除（账号级，按 x-account-id；走账号 sticky 代理） ============

@router.get("/accounts/{account_id}/risk-status")
async def get_account_risk_status(
    account_id: str,
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
):
    """获取该账号的发布风控状态（支持抖音）。返回 {risk_status, check_methods}。"""
    media = await _ensure_tenant_owns(db, current_app.id, account_id)
    _touch_used(media)
    if not media.current_lapi_account_id:
        raise NotFoundError("账号无可用底层会话，请重新授权")
    proxy = await ensure_account_proxy(db, media.current_lapi_account_id)
    async with lapi_account_op(db, media.current_lapi_account_id, proxy_op=True):
        data = await lapi_client.get_publish_risk_status(media.current_lapi_account_id, proxy=proxy)
    return ok(data)


@router.post("/accounts/{account_id}/risk-sms")
async def send_account_risk_sms(
    account_id: str,
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
):
    """发送风控验证短信到账号绑定手机。返回 {mobile}（掩码）。"""
    media = await _ensure_tenant_owns(db, current_app.id, account_id)
    _touch_used(media)
    if not media.current_lapi_account_id:
        raise NotFoundError("账号无可用底层会话，请重新授权")
    proxy = await ensure_account_proxy(db, media.current_lapi_account_id)
    async with lapi_account_op(db, media.current_lapi_account_id, proxy_op=True):
        data = await lapi_client.send_risk_sms(media.current_lapi_account_id, proxy=proxy)
    return ok(data)


@router.post("/accounts/{account_id}/risk-confirm")
async def confirm_account_risk(
    account_id: str,
    body: RiskConfirmRequest,
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
):
    """解除该账号的发布风控。method=password 用登录密码；method=smscode 用短信验证码。

    🔴 password 仅本次请求透传给上游，**不落库、日志已脱敏**。
    """
    media = await _ensure_tenant_owns(db, current_app.id, account_id)
    _touch_used(media)
    if not media.current_lapi_account_id:
        raise NotFoundError("账号无可用底层会话，请重新授权")
    proxy = await ensure_account_proxy(db, media.current_lapi_account_id)
    async with lapi_account_op(db, media.current_lapi_account_id, proxy_op=True):
        data = await lapi_client.confirm_risk(
            media.current_lapi_account_id,
            method=body.method, password=body.password, code_number=body.code, proxy=proxy,
        )
    return ok(data)


@router.get("/metrics/accounts/{account_id}", response_model=list[MetricResponse])
async def list_metrics(
    account_id: str,
    current_app: DeveloperApp = Depends(get_current_app),
    db: AsyncSession = Depends(get_db),
    days: int = Query(30, ge=1, le=180),
):
    media = await _ensure_tenant_owns(db, current_app.id, account_id)
    rows = (await db.execute(
        select(AccountMetric)
        .where(AccountMetric.lapi_account_id == media.account_id)
        .order_by(AccountMetric.snapshot_date.desc())
        .limit(days)
    )).scalars().all()
    return [MetricResponse.model_validate(r) for r in rows]
