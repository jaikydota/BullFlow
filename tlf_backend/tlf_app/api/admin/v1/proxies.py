"""admin: 代理池 CRUD + 批量导入。

代理占用按 lapi_account 计数（tlf 没有 User 表）。
全局默认 max_users 走 services.proxy_service.DEFAULT_MAX_USERS（50）。
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.database import get_db
from tlf_app.core.dependencies import AdminClaims, get_current_admin
from tlf_app.core.exceptions import NotFoundError
from tlf_app.models.lapi_account import LapiAccount
from tlf_app.models.proxy import Proxy
from tlf_app.schemas.admin import (
    ProxyBulkImportRequest,
    ProxyCreateRequest,
    ProxyPatchRequest,
    ProxyResponse,
)
from tlf_app.schemas.common import Page, ok
from tlf_app.services.proxy_service import DEFAULT_MAX_USERS, blocked_platforms, unblock_proxy_platform

router = APIRouter()


async def _counts_by_proxy(db: AsyncSession) -> dict[str, int]:
    rows = await db.execute(
        select(LapiAccount.proxy_id, func.count(LapiAccount.id))
        .where(LapiAccount.proxy_id.is_not(None))
        .group_by(LapiAccount.proxy_id)
    )
    return {str(pid): int(cnt) for pid, cnt in rows.all()}


def _to_response(proxy: Proxy, *, current_count: int) -> ProxyResponse:
    resp = ProxyResponse.model_validate(proxy)
    resp.current_account_count = current_count
    resp.effective_max_users = (
        proxy.max_users if proxy.max_users is not None else DEFAULT_MAX_USERS
    )
    resp.blocked_platforms = blocked_platforms(proxy)
    return resp


async def _release_accounts_of_proxy(db: AsyncSession, proxy_id: str) -> int:
    bound = (await db.execute(
        select(LapiAccount).where(LapiAccount.proxy_id == proxy_id)
    )).scalars().all()
    for acc in bound:
        acc.proxy_id = None
    return len(bound)


# ── 列表 / 详情 / 新建 / 改 / 删 ──

@router.get("/proxies", response_model=Page[ProxyResponse])
async def list_proxies(
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 20,
    status: str | None = Query(None, description="active/expired/disabled"),
    region: str | None = Query(None),
    search: str | None = Query(None, description="按节点名或 IP 模糊匹配"),
):
    base = select(Proxy)
    cnt_stmt = select(func.count(Proxy.id))
    if status:
        base = base.where(Proxy.status == status)
        cnt_stmt = cnt_stmt.where(Proxy.status == status)
    if region:
        base = base.where(Proxy.region == region)
        cnt_stmt = cnt_stmt.where(Proxy.region == region)
    if search:
        like = f"%{search}%"
        cond = or_(Proxy.name.ilike(like), Proxy.server_add.ilike(like))
        base = base.where(cond)
        cnt_stmt = cnt_stmt.where(cond)

    total = int((await db.execute(cnt_stmt)).scalar() or 0)
    rows = (await db.execute(
        base.order_by(desc(Proxy.sort_order), desc(Proxy.created_at))
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    counts = await _counts_by_proxy(db)
    items = [_to_response(p, current_count=counts.get(str(p.id), 0)) for p in rows]
    return Page[ProxyResponse](items=items, total=total, page=page, page_size=page_size)


@router.post("/proxies/health-check")
async def trigger_health_check(
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """立即对所有 active 代理跑一次连通性巡检（同步），返回统计。"""
    from tlf_app.services.proxy_health import run_health_check
    stat = await run_health_check(db)
    return ok(stat)


@router.get("/proxies/regions/summary")
async def proxies_region_summary(
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """按区域(region)汇总：每个区域的代理总数 / 可用数(=SDK 下发口径) / 已绑账号数。

    `usable` 与 SDK `GET /sdk/v1/proxy/regions` 下发口径一致：active + 未过期 + health!=dead。
    region 为空的代理归入 `region=null`（未分区，仅用于不指定区域的默认分配，不对平台下发）。
    """
    now = datetime.utcnow()
    usable_case = case(
        (
            and_(
                Proxy.status == "active",
                or_(Proxy.expires_at.is_(None), Proxy.expires_at > now),
                Proxy.health != "dead",
            ),
            1,
        ),
        else_=0,
    )
    rows = (await db.execute(
        select(
            Proxy.region, func.count(Proxy.id),
            func.coalesce(func.sum(usable_case), 0),
            func.coalesce(func.max(Proxy.sort_order), 0),
        )
        .group_by(Proxy.region)
    )).all()
    acc_rows = (await db.execute(
        select(Proxy.region, func.count(LapiAccount.id))
        .join(LapiAccount, LapiAccount.proxy_id == Proxy.id)
        .group_by(Proxy.region)
    )).all()
    acc_map = {region: int(cnt) for region, cnt in acc_rows}
    items = [
        {
            "region": region,
            "total": int(total),
            "usable": int(usable or 0),
            "account_count": acc_map.get(region, 0),
            "sort_order": int(max_sort or 0),
        }
        for region, total, usable, max_sort in rows
    ]
    # 与下发一致：区域内最大 sort_order 降序 → 区域名；未分区(null)置末
    items.sort(key=lambda x: (x["region"] is None, -x["sort_order"], x["region"] or ""))
    return ok({"items": items})


@router.post("/proxies/{proxy_id}/unblock-platform")
async def unblock_proxy_platform_endpoint(
    proxy_id: str,
    body: dict,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """解除某代理对某平台的屏蔽（如抖音之前封了此 IP，现已恢复）。body: {platform_code}。"""
    platform_code = (body or {}).get("platform_code")
    if not platform_code:
        raise NotFoundError("缺 platform_code")
    ok_done = await unblock_proxy_platform(db, proxy_id, platform_code)
    await db.commit()
    return ok({"unblocked": ok_done, "platform_code": platform_code})


@router.get("/proxies/{proxy_id}", response_model=ProxyResponse)
async def get_proxy(
    proxy_id: str,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    proxy = (await db.execute(select(Proxy).where(Proxy.id == proxy_id))).scalar_one_or_none()
    if proxy is None:
        raise NotFoundError("代理不存在")
    counts = await _counts_by_proxy(db)
    return _to_response(proxy, current_count=counts.get(str(proxy.id), 0))


@router.get("/proxies/{proxy_id}/platform-usage")
async def proxy_platform_usage(
    proxy_id: str,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """该代理按平台的账号绑定分布。容量按平台计，每平台上限 = effective_max_users。"""
    proxy = (await db.execute(select(Proxy).where(Proxy.id == proxy_id))).scalar_one_or_none()
    if proxy is None:
        raise NotFoundError("代理不存在")
    cap = proxy.max_users if proxy.max_users is not None else DEFAULT_MAX_USERS
    rows = (await db.execute(
        select(LapiAccount.platform_code, func.count(LapiAccount.id))
        .where(LapiAccount.proxy_id == proxy_id)
        .group_by(LapiAccount.platform_code)
        .order_by(func.count(LapiAccount.id).desc())
    )).all()
    items = [
        {"platform_code": pc, "count": int(cnt), "cap": cap, "full": int(cnt) >= cap}
        for pc, cnt in rows
    ]
    return ok({
        "proxy_id": proxy_id,
        "cap_per_platform": cap,
        "total": sum(i["count"] for i in items),
        "items": items,
    })


@router.post("/proxies", response_model=ProxyResponse)
async def create_proxy(
    body: ProxyCreateRequest,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    proxy = Proxy(
        name=body.name,
        region=body.region,
        server_add=body.server_add,
        server_port=body.server_port,
        proxy_type=body.proxy_type,
        user_name=body.user_name,
        password=body.password,
        max_users=body.max_users,
        expires_at=body.expires_at,
        status=body.status or "active",
        sort_order=body.sort_order or 0,
        order_no=body.order_no,
        notes=body.notes,
    )
    db.add(proxy)
    await db.commit()
    await db.refresh(proxy)
    return _to_response(proxy, current_count=0)


@router.patch("/proxies/{proxy_id}", response_model=ProxyResponse)
async def patch_proxy(
    proxy_id: str,
    body: ProxyPatchRequest,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    proxy = (await db.execute(select(Proxy).where(Proxy.id == proxy_id))).scalar_one_or_none()
    if proxy is None:
        raise NotFoundError("代理不存在")

    payload = body.model_dump(exclude_unset=True)
    # password = "" 视为「不修改」（不要把已有密码清成空）
    if payload.get("password") == "":
        payload.pop("password")
    for k, v in payload.items():
        setattr(proxy, k, v)
    await db.flush()

    # status -> disabled / expired：释放绑定账号
    if body.status in ("disabled", "expired"):
        await _release_accounts_of_proxy(db, proxy.id)

    # 显式 commit：get_db 的 commit 在依赖 teardown（响应已发出后）才执行，
    # 前端保存后立刻 reload 会抢在 commit 前读到旧值 → “没刷新”。
    # 这里提交后再 refresh，保证响应发出前已落库，且 updated_at 等字段取回当前 session。
    await db.commit()
    await db.refresh(proxy)
    counts = await _counts_by_proxy(db)
    return _to_response(proxy, current_count=counts.get(str(proxy.id), 0))


@router.delete("/proxies/{proxy_id}")
async def delete_proxy(
    proxy_id: str,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    proxy = (await db.execute(select(Proxy).where(Proxy.id == proxy_id))).scalar_one_or_none()
    if proxy is None:
        raise NotFoundError("代理不存在")
    released = await _release_accounts_of_proxy(db, proxy.id)
    await db.delete(proxy)
    await db.commit()
    return ok({"deleted": True, "released_accounts": released})


# ── 批量导入 ──

@router.post("/proxies/bulk")
async def bulk_import(
    body: ProxyBulkImportRequest,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """批量导入代理。`shared` 字段会补充到 `rows` 里没填的字段。

    返回：{ items: [...], count: N }
    """
    shared = body.shared.model_dump(exclude_unset=True) if body.shared else {}
    created: list[Proxy] = []
    for row in body.rows:
        merged = {
            "name": row.name,
            "region": row.region or shared.get("region"),
            "server_add": row.server_add,
            "server_port": row.server_port,
            "proxy_type": shared.get("proxy_type") or "socks5",
            "user_name": row.user_name or shared.get("user_name"),
            "password": row.password or shared.get("password"),
            "max_users": shared.get("max_users"),
            "expires_at": shared.get("expires_at"),
            "sort_order": shared.get("sort_order") or 0,
            "order_no": shared.get("order_no"),
            "notes": shared.get("notes"),
            "status": "active",
        }
        proxy = Proxy(**merged)
        db.add(proxy)
        created.append(proxy)
    await db.commit()
    for p in created:
        await db.refresh(p)
    items = [_to_response(p, current_count=0) for p in created]
    return ok({"items": [i.model_dump(mode="json") for i in items], "count": len(items)})


# ── 维护：把过期代理标 expired + 释放账号 ──

@router.post("/proxies/_expire-overdue")
async def expire_overdue(
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """把所有 expires_at < now 但 status=active 的代理标 expired，并释放绑定账号。

    可手动触发或后续接定时任务；route 层 ensure_account_proxy 也会兜底跳过过期代理。
    """
    now = datetime.utcnow()
    rows = (await db.execute(
        select(Proxy).where(
            Proxy.status == "active",
            Proxy.expires_at.is_not(None),
            Proxy.expires_at <= now,
        )
    )).scalars().all()
    released_total = 0
    for p in rows:
        p.status = "expired"
        released_total += await _release_accounts_of_proxy(db, p.id)
    await db.commit()
    return ok({"expired_count": len(rows), "released_accounts": released_total})
