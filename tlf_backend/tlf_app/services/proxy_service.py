"""代理池分配服务。

- 绑定主体为 `LapiAccount.proxy_id`
- 调用入口：`ensure_account_proxy(db, lapi_account_id)`
- max_users 缺省走全局常量 DEFAULT_MAX_USERS
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import case, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from tlf_app.core.config import settings

from tlf_app.models.lapi_account import LapiAccount
from tlf_app.models.media_account import MediaAccount
from tlf_app.models.proxy import Proxy
from tlf_app.models.tenant_account_binding import TenantAccountBinding

logger = logging.getLogger(__name__)

DEFAULT_MAX_USERS = 50


def to_lapi_proxy_dict(proxy: Proxy) -> dict[str, Any]:
    """转换为灵径接口 body.proxy 所需的字段名。"""
    d: dict[str, Any] = {
        "serverAdd": proxy.server_add,
        "serverPort": proxy.server_port,
        "type": proxy.proxy_type,
        "name": proxy.name,
    }
    if proxy.user_name:
        d["userName"] = proxy.user_name
    if proxy.password:
        d["password"] = proxy.password
    return d


def _is_proxy_usable(proxy: Proxy) -> bool:
    if proxy.status != "active":
        return False
    if proxy.expires_at is not None and proxy.expires_at <= datetime.utcnow():
        return False
    # 连续探测确认不通的代理不再使用 → 触发账号自动换到健康代理（slow 仍可用，仅分配时降权）
    if getattr(proxy, "health", None) == "dead":
        return False
    return True


def proxy_blocked_for(proxy: Proxy, platform_code: str) -> bool:
    """该代理是否对某平台被屏蔽（如抖音封了此 IP）。代理整体仍 active，只对该平台不可用。"""
    pb = getattr(proxy, "platform_block", None) or {}
    entry = pb.get(platform_code)
    return bool(entry and entry.get("blocked"))


def blocked_platforms(proxy: Proxy) -> list[str]:
    """该代理被屏蔽的平台列表（供 admin 展示）。"""
    pb = getattr(proxy, "platform_block", None) or {}
    return [code for code, e in pb.items() if isinstance(e, dict) and e.get("blocked")]


async def available_regions(db: AsyncSession) -> list[str]:
    """下发给接入平台的「可选代理区域」列表：去重、按字典序。

    只统计「当前可用且填了 region」的代理：status=active、未过期、health!=dead（slow 仍下发，
    仅出口慢）、region 非空。未填 region 的代理不下发（其只用于无 region 的默认/旧逻辑分配）。
    """
    now = datetime.utcnow()
    rows = (await db.execute(
        select(Proxy.region)
        .where(Proxy.status == "active")
        .where((Proxy.expires_at.is_(None)) | (Proxy.expires_at > now))
        .where(Proxy.health != "dead")
        .where(Proxy.region.is_not(None))
        .where(Proxy.region != "")
        .group_by(Proxy.region)
        # 区域顺序：区域内最大 sort_order 降序（高排序代理所在区域靠前）→ 再按区域名
        .order_by(func.max(Proxy.sort_order).desc(), Proxy.region.asc())
    )).scalars().all()
    return [r for r in rows if r]


async def get_user_last_region(
    db: AsyncSession, app_id: str | None, external_user_id: str | None
) -> str | None:
    """取该终端用户「上次选择的代理区域」：其名下账号中最近一次设过 proxy_region 的值。

    用于扫码绑定不传 region 时默认沿用上次。无账号/历史从未选过 → None（由平台引导用户选）。
    """
    if not app_id or not external_user_id:
        return None
    row = (await db.execute(
        select(MediaAccount.proxy_region)
        .select_from(TenantAccountBinding)
        .join(MediaAccount, MediaAccount.account_id == TenantAccountBinding.account_id)
        .where(TenantAccountBinding.app_id == app_id)
        .where(TenantAccountBinding.external_user_id == external_user_id)
        .where(TenantAccountBinding.status == "active")
        .where(MediaAccount.proxy_region.is_not(None))
        .where(MediaAccount.proxy_region != "")
        .order_by(MediaAccount.last_authed_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    return row or None


async def _allocate_new_proxy(
    db: AsyncSession, platform_code: str, *, region: str | None = None, allow_overflow: bool = False
) -> Proxy | None:
    """从池中按负载均衡选一个可用代理。

    容量按**平台**计：一个代理对每个平台各可挂 max_users（默认 50）个账号。
    一个静态 IP 同时给抖音 50 个 + 小红书 50 个 ...，因为风控是各平台按自己 IP 策略独立判定，
    这样 IP 使用效率更高。
    选择策略：该平台在此代理上的账号数 ASC + created_at ASC。

    - `region` 非空：只在该 region 的代理里选（精确匹配 proxies.region，如『广东-深圳』）。
    - `allow_overflow=True`：region 内代理全部满容量时**突破上限**，选该 region 内负载最小的
      继续挂（用户已显式选定 region，宁可突破也留在本 region）。False 则全满返回 None。
    """
    now = datetime.utcnow()
    # 每个 proxy 上「该平台」已绑账号数
    cnt_subq = (
        select(LapiAccount.proxy_id, func.count(LapiAccount.id).label("acc_cnt"))
        .where(LapiAccount.proxy_id.is_not(None))
        .where(LapiAccount.platform_code == platform_code)
        .group_by(LapiAccount.proxy_id)
        .subquery()
    )
    stmt = (
        select(Proxy, func.coalesce(cnt_subq.c.acc_cnt, 0).label("acc_cnt"))
        .outerjoin(cnt_subq, cnt_subq.c.proxy_id == Proxy.id)
        .where(Proxy.status == "active")
        .where((Proxy.expires_at.is_(None)) | (Proxy.expires_at > now))
        .where(Proxy.health != "dead")  # 不通的代理不参与分配（账号自动落到健康代理）
        # 健康优先（ok/unknown 排在 slow 前）→ 再按该平台负载 → 再按创建时间
        .order_by(
            (Proxy.health == "slow").asc(),
            func.coalesce(cnt_subq.c.acc_cnt, 0).asc(),
            Proxy.created_at.asc(),
        )
    )
    if region:
        stmt = stmt.where(Proxy.region == region)
    rows = (await db.execute(stmt)).all()
    overflow_candidate: Proxy | None = None  # region 内全满时的兜底（负载最小，已按 order_by 排序）
    for proxy, cnt in rows:
        if proxy_blocked_for(proxy, platform_code):
            continue  # 该平台已屏蔽此代理（如抖音封 IP），不再分给该平台
        if overflow_candidate is None:
            overflow_candidate = proxy  # 记下第一个（=负载最小）健康未屏蔽代理
        cap = proxy.max_users if proxy.max_users is not None else DEFAULT_MAX_USERS
        if cnt < cap:
            return proxy
    # region 内全部满容量：用户已选定 region → 突破上限留在本 region（选负载最小那个）
    if allow_overflow and overflow_candidate is not None:
        logger.info("[proxy] region=%s 内代理均达容量上限，突破上限分配 proxy=%s(%s)",
                    region, overflow_candidate.id, overflow_candidate.name)
        return overflow_candidate
    return None


async def _sticky_proxy_for_user(
    db: AsyncSession, app_id: str | None, external_user_id: str | None,
    *, region: str | None = None, platform_code: str | None = None,
) -> Proxy | None:
    """代理 IP 粘性：返回该终端用户已有账号所在的可用代理（同一用户尽量一个 IP/地域）。

    取该用户(app_id+external_user_id)名下账号最多落在的那个代理（票数 desc，再按最近授权 desc），
    但受**单代理单平台上限** `PROXY_STICKY_MAX_PER_PLATFORM` 约束：若某代理上该用户**该平台**的
    账号已达上限，则跳过它、滚动到该用户在同区域的下一个 IP（降低同 IP 同平台扎堆的风控风险）。
    - 不同平台各自计数、互不影响：抖音在 IP-A 满 15 后滚到 IP-B，但小红书仍可继续落 IP-A。
    - 用户在同区域没有「未达上限」的已用 IP → 返回 None，由调用方 `_allocate_new_proxy` 负载均衡
      挑同区域另一个 IP（同区域全满才突破）。
    - `platform_code` 为空或上限=0 时**不限**（退回原「一个用户一个 IP」行为）。
    - `region` 非空时只认同 region 的粘性代理（用户改选了 region 就不该被拉回旧 region 的 IP）。
    """
    if not app_id or not external_user_id:
        return None
    cap = settings.PROXY_STICKY_MAX_PER_PLATFORM if platform_code else 0
    # 每代理：该用户账号总数 cnt（决定粘性优先级）+ 该用户「该平台」账号数 plat_cnt（决定是否达上限）
    plat_cnt_expr = func.sum(
        case((LapiAccount.platform_code == platform_code, 1), else_=0)
    ).label("plat_cnt") if platform_code else func.count(LapiAccount.id).label("plat_cnt")
    stmt = (
        select(LapiAccount.proxy_id, func.count(LapiAccount.id).label("cnt"), plat_cnt_expr,
               func.max(LapiAccount.last_authed_at).label("recent"))
        .select_from(TenantAccountBinding)
        .join(MediaAccount, MediaAccount.account_id == TenantAccountBinding.account_id)
        .join(LapiAccount, LapiAccount.lapi_account_id == MediaAccount.current_lapi_account_id)
        .where(TenantAccountBinding.app_id == app_id)
        .where(TenantAccountBinding.external_user_id == external_user_id)
        .where(TenantAccountBinding.status == "active")
        .where(LapiAccount.proxy_id.is_not(None))
        .group_by(LapiAccount.proxy_id)
        .order_by(func.count(LapiAccount.id).desc(), func.max(LapiAccount.last_authed_at).desc())
    )
    rows = (await db.execute(stmt)).all()
    for proxy_id, _cnt, plat_cnt, _recent in rows:
        # 该代理上「该平台」已达上限 → 跳过，滚动到该用户的下一个 IP
        if cap and int(plat_cnt or 0) >= cap:
            continue
        proxy = (await db.execute(select(Proxy).where(Proxy.id == proxy_id))).scalar_one_or_none()
        if proxy and _is_proxy_usable(proxy) and (not region or proxy.region == region):
            return proxy
    return None


async def pick_available_proxy(
    db: AsyncSession,
    platform_code: str,
    *,
    app_id: str | None = None,
    external_user_id: str | None = None,
    region: str | None = None,
) -> tuple[str, dict] | None:
    """授权阶段（账号尚不存在）用：挑一个代理，返回 (proxy_id, lapi_proxy_dict)。

    - `region` 非空（用户选定/继承的代理区域）：**优先在该 region 内分配**——先同 region 用户粘性，
      再同 region 负载均衡，region 内全满则突破上限留在本 region。仅当该 region 内一个可用代理都没有
      （全过期/dead/屏蔽）才回退全局旧逻辑。
    - `region` 为空：旧逻辑——先「用户粘性」（同终端用户已有账号的可用代理直接复用，一个用户一个 IP），
      无粘性命中（新用户/未传 external_user_id）才按平台负载均衡。
    不做绑定（账号还没创建）；授权成功的 webhook 里再把该 proxy_id 绑到新账号。池空返回 None。
    """
    proxy: Proxy | None = None
    if region:
        # 同 region 内：先粘性（用户在该 region 已有账号则复用同 IP），再负载均衡，全满则突破上限
        proxy = await _sticky_proxy_for_user(db, app_id, external_user_id, region=region, platform_code=platform_code)
        if proxy is not None and proxy_blocked_for(proxy, platform_code):
            proxy = None
        if proxy is not None:
            logger.info("[proxy] region=%s 用户粘性命中 app=%s user=%s → proxy=%s(%s)",
                        region, app_id, external_user_id, proxy.id, proxy.name)
        else:
            proxy = await _allocate_new_proxy(db, platform_code, region=region, allow_overflow=True)
        if proxy is None:
            logger.warning("[proxy] region=%s 内无可用代理，回退全局分配 platform=%s", region, platform_code)

    if proxy is None:
        # region 为空，或所选 region 内无任何可用代理 → 全局旧逻辑（粘性 → 负载均衡）
        proxy = await _sticky_proxy_for_user(db, app_id, external_user_id, platform_code=platform_code)
        if proxy is not None and proxy_blocked_for(proxy, platform_code):
            proxy = None  # 粘性代理对该平台被屏蔽 → 走负载均衡
        if proxy is not None:
            logger.info("[proxy] 用户粘性命中 app=%s user=%s → proxy=%s(%s)",
                        app_id, external_user_id, proxy.id, proxy.name)
        else:
            proxy = await _allocate_new_proxy(db, platform_code)
    if proxy is None:
        return None
    return str(proxy.id), to_lapi_proxy_dict(proxy)


async def _account_region(db: AsyncSession, account: LapiAccount) -> str | None:
    """取该会话所属稳定账号选定的代理区域（media.proxy_region）。"""
    if account.media_account_id is None:
        return None
    media = (await db.execute(
        select(MediaAccount).where(MediaAccount.id == account.media_account_id)
    )).scalar_one_or_none()
    return (media.proxy_region or None) if media is not None else None


async def _sticky_proxy_for_account(
    db: AsyncSession, account: LapiAccount, *, region: str | None = None
) -> Proxy | None:
    """按该账号所属终端用户做代理粘性（从 binding 反查 external_user_id）。region 非空时限同 region。"""
    if account.media_account_id is None:
        return None
    media = (await db.execute(
        select(MediaAccount).where(MediaAccount.id == account.media_account_id)
    )).scalar_one_or_none()
    if media is None:
        return None
    binding = (await db.execute(
        select(TenantAccountBinding)
        .where(TenantAccountBinding.account_id == media.account_id)
        .where(TenantAccountBinding.external_user_id.is_not(None))
        .where(TenantAccountBinding.status == "active")
        .order_by(TenantAccountBinding.bound_at.desc())
    )).scalars().first()
    if binding is None:
        return None
    return await _sticky_proxy_for_user(
        db, binding.app_id, binding.external_user_id, region=region, platform_code=account.platform_code,
    )


async def ensure_account_proxy(db: AsyncSession, lapi_account_id: str) -> dict | None:
    """为 lapi_account_id 确保有可用代理。返回灵径风格 proxy dict；池空返回 None。

    若该账号已绑代理且可用，直接复用；否则重分配：
    - 该账号选过代理区域（media.proxy_region）→ **优先在同 region 内**重分配（同 region 粘性 →
      同 region 负载均衡 → 同 region 全满突破上限）；
    - 同 region 内无可用代理 / 该账号未选 region → 回退旧逻辑（用户粘性 → 平台负载均衡）。
    """
    acc_stmt = select(LapiAccount).where(LapiAccount.lapi_account_id == lapi_account_id)
    account = (await db.execute(acc_stmt)).scalar_one_or_none()
    if account is None:
        return None

    if account.proxy_id:
        proxy_stmt = select(Proxy).where(Proxy.id == account.proxy_id)
        proxy = (await db.execute(proxy_stmt)).scalar_one_or_none()
        if proxy and _is_proxy_usable(proxy) and not proxy_blocked_for(proxy, account.platform_code):
            return to_lapi_proxy_dict(proxy)
        # 不可用 / 该平台被屏蔽 → 解绑，重分配
        logger.info("[proxy] %s 已绑代理 %s 不可用或对 %s 已屏蔽，重分配",
                    lapi_account_id, account.proxy_id, account.platform_code)
        account.proxy_id = None
        await db.flush()

    region = await _account_region(db, account)
    new_proxy: Proxy | None = None
    if region:
        # 故障转移优先同 region：同 region 粘性 → 同 region 负载均衡（全满突破上限）
        new_proxy = await _sticky_proxy_for_account(db, account, region=region)
        if new_proxy is not None and proxy_blocked_for(new_proxy, account.platform_code):
            new_proxy = None
        if new_proxy is None:
            new_proxy = await _allocate_new_proxy(
                db, account.platform_code, region=region, allow_overflow=True
            )
        if new_proxy is None:
            logger.warning("[proxy] region=%s 内无可用代理，回退全局分配 lapi_account_id=%s",
                           region, lapi_account_id)

    if new_proxy is None:
        # 未选 region，或同 region 无可用 → 旧逻辑：用户粘性 → 负载均衡
        new_proxy = await _sticky_proxy_for_account(db, account)
        if new_proxy is not None and proxy_blocked_for(new_proxy, account.platform_code):
            new_proxy = None  # 粘性代理对该平台被屏蔽，落到负载均衡（其会排除已屏蔽代理）
        if new_proxy is None:
            new_proxy = await _allocate_new_proxy(db, account.platform_code)
    if new_proxy is None:
        logger.warning("[proxy] 池中无可用代理 lapi_account_id=%s platform=%s",
                       lapi_account_id, account.platform_code)
        return None
    account.proxy_id = new_proxy.id
    await db.flush()
    return to_lapi_proxy_dict(new_proxy)


async def disable_proxy_for_account(db: AsyncSession, lapi_account_id: str, *, reason: str = "") -> str | None:
    """灵径报某账号所用代理异常（如 Socks5 认证失败）→ 禁用该代理 + 解绑其上所有会话。

    - 该代理在灵径侧不可用 → status=disabled（admin 级，巡检不再自动恢复）+ health=dead，
      记 notes 说明自动禁用原因；
    - 解绑该代理上**所有** LapiAccount（proxy_id=None）→ 各账号下次 `ensure_account_proxy`
      自动改分到其它健康代理（相关用户全部迁走）。
    返回被禁用的 proxy_id（无绑定代理则 None）。调用方负责 commit。
    """
    acc = (await db.execute(
        select(LapiAccount).where(LapiAccount.lapi_account_id == lapi_account_id)
    )).scalar_one_or_none()
    if acc is None or not acc.proxy_id:
        return None
    proxy_id = acc.proxy_id
    proxy = (await db.execute(select(Proxy).where(Proxy.id == proxy_id))).scalar_one_or_none()
    if proxy is not None and proxy.status == "active":
        proxy.status = "disabled"
        proxy.health = "dead"
        note = f"[auto-disabled] 灵径报代理异常自动禁用：{(reason or '')[:120]}"
        proxy.notes = note if not proxy.notes else f"{proxy.notes}\n{note}"
        logger.warning("[proxy] 灵径报代理异常，自动禁用 proxy=%s(%s)：%s", proxy_id, proxy.name, (reason or "")[:120])
    # 解绑该代理上所有会话 → 下次取代理时自动改分到健康代理
    bound = (await db.execute(
        select(LapiAccount).where(LapiAccount.proxy_id == proxy_id)
    )).scalars().all()
    for a in bound:
        a.proxy_id = None
    await db.flush()
    logger.info("[proxy] 已解绑代理 %s 上 %d 个账号（下次自动改分）", proxy_id, len(bound))
    return proxy_id


async def note_account_proxy_failure(db: AsyncSession, lapi_account_id: str, *, reason: str = "") -> bool:
    """灵径侧用该账号代理「发布该平台」失败一次（超时/网络异常）：按 **代理×平台** 累计；
    连续达 PROXY_UPSTREAM_FAIL_THRESHOLD 则**只屏蔽该代理对该平台**（不禁用整代理），
    并解绑该代理上**该平台**的账号（下次自动改分到别的代理）。其它平台不受影响。返回是否已触发屏蔽。

    动机：代理本身通、网速正常，只是某平台（如抖音）封了这个 IP——若禁用整代理会误杀其它平台。
    连接级错误（如 Socks5 认证失败）走 disable_proxy_for_account 整代理禁用，不走这里。
    """
    acc = (await db.execute(
        select(LapiAccount).where(LapiAccount.lapi_account_id == lapi_account_id)
    )).scalar_one_or_none()
    if acc is None or not acc.proxy_id:
        return False
    proxy = (await db.execute(select(Proxy).where(Proxy.id == acc.proxy_id))).scalar_one_or_none()
    if proxy is None or proxy.status != "active":
        return False
    plat = acc.platform_code
    threshold = settings.PROXY_UPSTREAM_FAIL_THRESHOLD
    proxy.upstream_fail_count = (proxy.upstream_fail_count or 0) + 1  # 全局信息计数
    pb = dict(proxy.platform_block or {})
    entry = dict(pb.get(plat) or {})
    if entry.get("blocked"):
        return True  # 该平台已屏蔽，无需重复处理
    entry["fail"] = int(entry.get("fail") or 0) + 1
    blocked_now = entry["fail"] >= threshold
    if blocked_now:
        entry["blocked"] = True
        entry["reason"] = (reason or "")[:200]
    pb[plat] = entry
    proxy.platform_block = pb
    flag_modified(proxy, "platform_block")
    await db.flush()
    logger.warning(
        "[proxy] 灵径侧用代理 %s(%s) 发布【%s】失败累计 %d/%d%s：%s",
        proxy.id, proxy.name, plat, entry["fail"], threshold,
        "（已屏蔽该平台）" if blocked_now else "", (reason or "")[:100],
    )
    if blocked_now:
        # 只解绑该代理上「该平台」的账号 → 下次取代理自动换到别的代理；其它平台账号不动
        bound = (await db.execute(
            select(LapiAccount).where(LapiAccount.proxy_id == proxy.id, LapiAccount.platform_code == plat)
        )).scalars().all()
        for a in bound:
            a.proxy_id = None
        await db.flush()
        logger.warning(
            "[proxy] 代理 %s 对平台【%s】屏蔽，已解绑其上 %d 个 %s 账号（代理对其它平台仍可用）",
            proxy.id, plat, len(bound), plat,
        )
    return blocked_now


async def unblock_proxy_platform(db: AsyncSession, proxy_id: str, platform_code: str) -> bool:
    """admin 解除「代理×平台」屏蔽（清除该平台的屏蔽 + 计数）。该平台账号下次可重新分到此代理。"""
    proxy = (await db.execute(select(Proxy).where(Proxy.id == proxy_id))).scalar_one_or_none()
    if proxy is None:
        return False
    pb = dict(proxy.platform_block or {})
    if platform_code not in pb:
        return False
    pb.pop(platform_code, None)
    proxy.platform_block = pb
    flag_modified(proxy, "platform_block")
    await db.flush()
    logger.info("[proxy] 已解除代理 %s 对平台 %s 的屏蔽", proxy_id, platform_code)
    return True


async def reset_account_proxy_failures(db: AsyncSession, lapi_account_id: str) -> None:
    """灵径侧用该账号代理「发布该平台」成功 → 清零该(代理×平台)的失败计数（未屏蔽时保持连续语义）。"""
    acc = (await db.execute(
        select(LapiAccount).where(LapiAccount.lapi_account_id == lapi_account_id)
    )).scalar_one_or_none()
    if acc is None or not acc.proxy_id:
        return
    proxy = (await db.execute(select(Proxy).where(Proxy.id == acc.proxy_id))).scalar_one_or_none()
    if proxy is None:
        return
    pb = dict(proxy.platform_block or {})
    entry = pb.get(acc.platform_code)
    # 仅清零「未屏蔽」平台的瞬时失败计数；已屏蔽的保持（其账号已迁走，无需复位）
    if isinstance(entry, dict) and not entry.get("blocked") and (entry.get("fail") or 0) > 0:
        entry = dict(entry)
        entry["fail"] = 0
        pb[acc.platform_code] = entry
        proxy.platform_block = pb
        flag_modified(proxy, "platform_block")
        await db.flush()


async def release_proxy_for_account(db: AsyncSession, lapi_account_id: str) -> None:
    """账号删除时解绑代理（不删除代理本身）。"""
    acc_stmt = select(LapiAccount).where(LapiAccount.lapi_account_id == lapi_account_id)
    account = (await db.execute(acc_stmt)).scalar_one_or_none()
    if account and account.proxy_id is not None:
        account.proxy_id = None
        await db.flush()
