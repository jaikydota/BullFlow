"""代理连通性健康检查（周期探测 + 不健康自动换）。

- 周期任务（每 PROXY_HEALTH_CHECK_INTERVAL 秒）探测所有 active 代理：
  ① TCP 连接 server_add:server_port → 是否可达；
  ② 经代理 GET 轻量目标（PROXY_HEALTH_TARGET）→ 出口是否通 + 出口延迟。
- 结果写回 Proxy.health / last_check_at / last_latency_ms / fail_count。
- 连续失败达 PROXY_DEAD_FAIL_THRESHOLD 次才标 dead（防网络抖动误杀）；出口 > PROXY_SLOW_MS 标 slow。
- dead 由 proxy_service._is_proxy_usable 视为不可用 → 账号下次取代理时自动换到健康代理。

注：探测从本服务器发起，测的是「本服务器 → 代理」。TCP 不通 = 端点宕了（对谁都不通），dead 判定可靠；
出口延迟与上游(灵径)服务器实际感受可能有差异，slow 仅近似。
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.config import settings
from tlf_app.core.database import async_session_factory
from tlf_app.models.proxy import Proxy

logger = logging.getLogger(__name__)


async def _tcp_reachable(host: str, port: int, timeout: float) -> tuple[bool, int]:
    started = time.monotonic()
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=timeout)
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:  # noqa: BLE001
            pass
        return True, int((time.monotonic() - started) * 1000)
    except Exception:  # noqa: BLE001
        return False, int((time.monotonic() - started) * 1000)


def _proxy_url(p: Proxy) -> str:
    scheme = "socks5" if p.proxy_type == "socks5" else "http"
    auth = f"{p.user_name}:{p.password or ''}@" if p.user_name else ""  # 密码仅用于连接，不打印
    return f"{scheme}://{auth}{p.server_add}:{p.server_port}"


async def _egress_latency(p: Proxy, timeout: float) -> tuple[str, int | None, str]:
    """经代理访问目标。返回 (结果, 延迟ms|None, 备注)；结果 ∈ ok / slow / fail / tcp_only。"""
    try:
        import httpx
    except Exception:  # noqa: BLE001
        return "tcp_only", None, "httpx 未安装"
    url = _proxy_url(p)
    started = time.monotonic()
    try:
        try:
            client = httpx.AsyncClient(proxy=url, timeout=timeout)
        except TypeError:
            client = httpx.AsyncClient(proxies=url, timeout=timeout)  # type: ignore[call-arg]
        async with client:
            resp = await client.get(settings.PROXY_HEALTH_TARGET)
        ms = int((time.monotonic() - started) * 1000)
        mark = "ok" if ms <= settings.PROXY_SLOW_MS else "slow"
        return mark, ms, f"HTTP {resp.status_code}"
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        # socks5 需 socksio；缺依赖时退化为「TCP-only」，不据此判 dead
        if "socks" in msg.lower() and ("socksio" in msg.lower() or "install" in msg.lower()):
            return "tcp_only", None, "缺 socks 依赖，仅按 TCP 判活"
        return "fail", None, f"{type(exc).__name__}: {msg[:80]}"


async def _probe(p: Proxy) -> tuple[str, int | None, str]:
    """探测单个代理，返回 (result, latency_ms|None, note)。result ∈ ok / slow / fail / tcp_only。

    egress 失败时再 TCP 重试一次确认，减少瞬时抖动误判。
    """
    timeout = settings.PROXY_HEALTH_TIMEOUT
    reachable, conn_ms = await _tcp_reachable(p.server_add, int(p.server_port), timeout)
    if not reachable:
        # 二次确认
        reachable, conn_ms = await _tcp_reachable(p.server_add, int(p.server_port), timeout)
        if not reachable:
            return "fail", None, "TCP 不可达"
    result, ms, note = await _egress_latency(p, timeout)
    if result == "tcp_only":
        # 没法测出口（无 socks 依赖）→ TCP 通即视为 ok，延迟记 TCP 连接耗时
        return "ok", conn_ms, note
    return result, ms, note


async def _apply_result(p: Proxy, result: str, ms: int | None, note: str) -> None:
    p.last_check_at = datetime.utcnow()
    if result == "fail":
        p.fail_count = (p.fail_count or 0) + 1
        p.last_latency_ms = None
        if p.fail_count >= settings.PROXY_DEAD_FAIL_THRESHOLD:
            if p.health != "dead":
                logger.warning("[proxy-health] %s(%s) 连续失败 %d 次 → 标 dead（%s）",
                               p.name, f"{p.server_add}:{p.server_port}", p.fail_count, note)
            p.health = "dead"
        # 未达阈值：保留原 health，仅累计 fail_count（防抖动）
    else:  # ok / slow
        if p.health == "dead":
            logger.info("[proxy-health] %s(%s) 恢复 → %s", p.name, f"{p.server_add}:{p.server_port}", result)
        p.fail_count = 0
        p.health = result
        p.last_latency_ms = ms


async def run_health_check(db: AsyncSession) -> dict:
    """探测所有 active 代理并更新健康字段。返回统计 dict。"""
    proxies = (await db.execute(select(Proxy).where(Proxy.status == "active"))).scalars().all()
    if not proxies:
        return {"total": 0, "ok": 0, "slow": 0, "dead": 0}
    sem = asyncio.Semaphore(max(1, settings.PROXY_HEALTH_CONCURRENCY))

    async def _one(p: Proxy) -> None:
        async with sem:
            try:
                result, ms, note = await _probe(p)
            except Exception as exc:  # noqa: BLE001
                result, ms, note = "fail", None, f"探测异常 {exc}"
        await _apply_result(p, result, ms, note)

    await asyncio.gather(*[_one(p) for p in proxies])
    await db.commit()
    stat = {"total": len(proxies), "ok": 0, "slow": 0, "dead": 0}
    for p in proxies:
        if p.health in stat:
            stat[p.health] += 1
    logger.info("[proxy-health] 巡检完成 %s", stat)
    return stat


async def health_check_loop() -> None:
    """常驻周期任务：每 PROXY_HEALTH_CHECK_INTERVAL 秒巡检一次。由 app lifespan 启动。"""
    interval = max(60, settings.PROXY_HEALTH_CHECK_INTERVAL)
    logger.info("[proxy-health] 周期巡检已启动，间隔 %ds，slow 阈值 %dms，dead 阈值 %d 次",
                interval, settings.PROXY_SLOW_MS, settings.PROXY_DEAD_FAIL_THRESHOLD)
    while True:
        try:
            async with async_session_factory() as db:
                await run_health_check(db)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("[proxy-health] 巡检异常：%s", exc)
        await asyncio.sleep(interval)
