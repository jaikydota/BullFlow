"""推量发后端入口。

部署形态：
- 容器内监听 8041
- 线上：独立域名 tlf-365.chuhaibang.com → <宿主机>:8040（tlf-frontend nginx）→ /api/* 反代到 tlf-backend:8041
- 路由树：
    /api/sdk/v1/*       —— 对外开发者 SDK（Bearer app_key）
    /api/admin/v1/*     —— 后台管理（本地 JWT 校验）
    /api/webhooks/lapi  —— 接收灵径 webhook

首次启动会自动 seed 第一个 super_admin（admin_users 表为空时），
默认凭据来自 .env 的 TLF_ADMIN_INIT_EMAIL / TLF_ADMIN_INIT_PASSWORD。
"""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from tlf_app.api.router import api_router
from tlf_app.core.config import settings
from tlf_app.core.database import async_session_factory
from tlf_app.core.exceptions import AppException, app_exception_handler
from tlf_app.core.log_context import LOG_FORMAT, install_request_id_logging, set_request_id

# 确保 tlf_app 的 INFO 日志（含灵径接口请求/响应明细）在 uvicorn 下可见。
# uvicorn 默认不给 root logger 配 handler，应用 logger.info 会被吞，这里兜底配置一次。
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
logging.getLogger("tlf_app").setLevel(logging.INFO)
# 给 root handler 装上 request-id filter + 带 [rid] 的格式（便于按请求串联排查）
install_request_id_logging()

logger = logging.getLogger(__name__)

# 不打访问日志的低价值路径（健康检查 / 预检）
_SKIP_ACCESS_LOG = {"/health", "/api/health"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("tlf_app 启动；mysql=%s", settings.MYSQL_DATABASE)
    # Seed 首个 super_admin（幂等）
    async with async_session_factory() as session:
        try:
            from tlf_app.services.admin_auth import seed_initial_admin
            created = await seed_initial_admin(session)
            await session.commit()
            if created:
                logger.warning(
                    "首次启动 seed admin: %s / 密码取自 TLF_ADMIN_INIT_PASSWORD",
                    settings.TLF_ADMIN_INIT_EMAIL,
                )
        except Exception as exc:
            await session.rollback()
            logger.exception("seed admin 失败：%s", exc)

    # 代理连通性周期巡检（不健康自动换）
    health_task = None
    if settings.PROXY_HEALTH_CHECK_ENABLED:
        import asyncio
        from tlf_app.services.proxy_health import health_check_loop
        health_task = asyncio.create_task(health_check_loop())

    # 不活跃账号自动回收（灵径按天扣费，长期不用的自动 revoke 止损；0=禁用）
    reaper_task = None
    if settings.INACTIVE_ACCOUNT_REVOKE_DAYS > 0:
        import asyncio
        from tlf_app.services.inactive_reaper import reaper_loop
        reaper_task = asyncio.create_task(reaper_loop())

    yield

    for t in (health_task, reaper_task):
        if t is not None:
            t.cancel()
            try:
                await t
            except Exception:  # noqa: BLE001
                pass
    logger.info("tlf_app 退出")


app = FastAPI(
    title="推量发 (TuiLiangFa) Gateway",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_origin_regex=settings.cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def access_log_middleware(request: Request, call_next):
    """入站请求访问日志：每请求一对 →/← 行（方法/路径/状态/耗时），并给本请求分配 rid 串联后续日志。

    rid 优先取上游传入的 X-Request-Id（便于跨服务串联），否则自动生成；回写到响应头。
    """
    rid = set_request_id(request.headers.get("X-Request-Id"))
    path = request.url.path
    if request.method == "OPTIONS" or path in _SKIP_ACCESS_LOG:
        return await call_next(request)
    started = time.monotonic()
    logger.info("[HTTP] → %s %s", request.method, path)
    try:
        resp = await call_next(request)
    except Exception:
        elapsed = int((time.monotonic() - started) * 1000)
        logger.exception("[HTTP] ✗ %s %s 未处理异常 %dms", request.method, path, elapsed)
        raise
    elapsed = int((time.monotonic() - started) * 1000)
    log = logger.warning if resp.status_code >= 400 else logger.info
    log("[HTTP] ← %s %s %s %dms", request.method, path, resp.status_code, elapsed)
    resp.headers["X-Request-Id"] = rid
    return resp


app.add_exception_handler(AppException, app_exception_handler)
app.include_router(api_router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "tlf_backend (推量发)"}
