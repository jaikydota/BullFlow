"""代理连通性实测（一次性诊断脚本）。

对 proxies 表里每个 active 代理：
1) TCP 连接 server_add:server_port，测「是否可达 + 连接延迟」；
2) 若可达且 httpx 支持该代理类型，经代理 GET 一个轻量目标（默认 https://www.baidu.com），
   测「出口是否通 + 出口延迟」。

不打印任何密码。用法：python scripts/check_proxies.py [--target https://www.baidu.com] [--timeout 8]
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select  # noqa: E402

from tlf_app.core.database import async_session_factory  # noqa: E402
from tlf_app.models.proxy import Proxy  # noqa: E402


async def _tcp_probe(host: str, port: int, timeout: float) -> tuple[bool, int, str]:
    started = time.monotonic()
    try:
        fut = asyncio.open_connection(host, port)
        reader, writer = await asyncio.wait_for(fut, timeout=timeout)
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        return True, int((time.monotonic() - started) * 1000), ""
    except asyncio.TimeoutError:
        return False, int((time.monotonic() - started) * 1000), "timeout"
    except Exception as exc:  # noqa: BLE001
        return False, int((time.monotonic() - started) * 1000), f"{type(exc).__name__}: {exc}"


def _proxy_url(p: Proxy) -> str:
    scheme = "socks5" if p.proxy_type == "socks5" else "http"
    auth = ""
    if p.user_name:
        # 密码仅用于构造连接，不打印
        auth = f"{p.user_name}:{p.password or ''}@"
    return f"{scheme}://{auth}{p.server_add}:{p.server_port}"


async def _egress_probe(p: Proxy, target: str, timeout: float) -> tuple[str, int, str]:
    """经代理访问目标，返回 (结果标记, 延迟ms, 备注)。结果标记: ok / slow / fail / skip。"""
    try:
        import httpx
    except Exception:
        return "skip", 0, "httpx 未安装"
    url = _proxy_url(p)
    started = time.monotonic()
    try:
        # httpx 0.26+ 用 proxy=，旧版用 proxies=
        try:
            client = httpx.AsyncClient(proxy=url, timeout=timeout)
        except TypeError:
            client = httpx.AsyncClient(proxies=url, timeout=timeout)  # type: ignore[call-arg]
        async with client:
            resp = await client.get(target)
        ms = int((time.monotonic() - started) * 1000)
        mark = "ok" if ms <= 5000 else "slow"
        return mark, ms, f"HTTP {resp.status_code}"
    except Exception as exc:  # noqa: BLE001
        ms = int((time.monotonic() - started) * 1000)
        msg = str(exc)
        if "socks" in msg.lower():
            return "skip", ms, "缺 socks 依赖（pip install httpx[socks]）"
        return "fail", ms, f"{type(exc).__name__}: {msg[:80]}"


async def _run(target: str, timeout: float) -> None:
    async with async_session_factory() as db:
        rows = (await db.execute(
            select(Proxy).where(Proxy.status == "active").order_by(Proxy.created_at.asc())
        )).scalars().all()

    print(f"[check] active 代理 {len(rows)} 个；目标={target}，超时={timeout}s\n")
    print(f"{'名称':<16} {'类型':<7} {'地址:端口':<26} {'TCP':<6} {'连接ms':<7} {'出口':<6} {'出口ms':<7} 备注")
    print("-" * 100)
    for p in rows:
        reachable, conn_ms, conn_err = await _tcp_probe(p.server_add, int(p.server_port), timeout)
        if reachable:
            mark, eg_ms, note = await _egress_probe(p, target, timeout)
        else:
            mark, eg_ms, note = "-", 0, conn_err
        tcp_s = "OK" if reachable else "DEAD"
        name = (p.name or "")[:15]
        addr = f"{p.server_add}:{p.server_port}"[:25]
        print(f"{name:<16} {p.proxy_type:<7} {addr:<26} {tcp_s:<6} {conn_ms:<7} {mark:<6} {eg_ms:<7} {note}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default="https://www.baidu.com")
    ap.add_argument("--timeout", type=float, default=8.0)
    args = ap.parse_args()
    asyncio.run(_run(args.target, args.timeout))


if __name__ == "__main__":
    main()
