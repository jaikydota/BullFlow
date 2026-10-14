"""Redis token-bucket rate limiter middleware."""
from __future__ import annotations

import logging
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

DEFAULT_RATE = 60      # requests per window
DEFAULT_WINDOW = 60    # seconds


# 这些公共端点用更严格但独立的限流桶（防暴力破解），跟普通请求隔离
LOGIN_PATHS = (
    "/api/v1/auth/login",
    "/api/v1/auth/login-phone",
    "/api/v1/auth/login-sms",
    "/api/v1/auth/register",
    "/api/v1/auth/send-sms-code",
    "/api/v1/auth/reset-password",
    "/api/v1/captcha/slider",
    "/api/v1/captcha/verify",
    "/api/v1/admin/auth/login",  # 管理后台登录
)

# 埋点上报：高频 + 批量，用独立宽松桶（仍限制防刷，但不挤占普通业务的 60/min 配额）
ANALYTICS_PREFIX = "/api/v1/analytics/"

# 健康检查 / API 文档跳过限流
SKIP_PATHS = (
    "/api/v1/system/health",
    "/docs",
    "/redoc",
    "/openapi.json",
)


def _extract_client_ip(request: Request) -> str:
    """优先从反代头取真实客户端 IP，回退 socket peer。

    部署常见拓扑：浏览器 → 外部 Nginx (X-Forwarded-For) → frontend 容器 nginx
    (proxy_set_header X-Real-IP) → backend。不取头部时 request.client.host
    始终是上游 nginx 的容器内部 IP（127.0.0.1 / 172.x.x.x），所有真实用户
    被聚合成同一个限流桶。
    """
    # X-Forwarded-For 可能是多级链路 "client, proxy1, proxy2"，取第一个
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    xri = request.headers.get("x-real-ip")
    if xri:
        return xri.strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Per-IP token-bucket rate limiter backed by Redis.

    - 普通请求：rate / window 由构造参数控制（默认 60/60s）
    - 登录类公共端点：独立桶 + 更严格阈值（每 IP 每分钟 10 次），防暴力破解
    """

    def __init__(self, app, *, rate: int = DEFAULT_RATE, window: int = DEFAULT_WINDOW):
        super().__init__(app)
        self.rate = rate
        self.window = window
        # 登录类专用配额（每 IP 每分钟）
        self.login_rate = 10
        self.login_window = 60

    async def _check_and_incr(
        self,
        key: str,
        rate: int,
        window: int,
    ) -> tuple[bool, int]:
        """返回 (是否触发限流, 当前计数)。Redis 异常时全部放行。"""
        try:
            from app.core.redis import get_redis

            redis = get_redis()
            current = await redis.get(key)
            if current is None:
                await redis.set(key, 1, ex=window)
                return False, 1
            cnt = int(current)
            if cnt >= rate:
                return True, cnt
            await redis.incr(key)
            return False, cnt + 1
        except Exception:
            return False, 0

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        if path in SKIP_PATHS:
            return await call_next(request)

        # 开发模式（APP_DEBUG=true）整个限流跳过：dev 通过 Vite proxy/直连时
        # client.host 永远是 127.0.0.1，且 Vite 不传 X-Forwarded-For，所有
        # 请求会聚合到同一桶，频繁开发刷新很容易触发 429。
        from app.core.config import settings

        if settings.APP_DEBUG:
            return await call_next(request)

        client_ip = _extract_client_ip(request)

        # 兜底：拿到的还是 loopback/私网（说明反代没传真实 IP 头），同样跳过
        # 避免所有用户共桶。这条主要给"未正确配置 X-Forwarded-For 的部署"做保护。
        if client_ip in ("127.0.0.1", "::1", "localhost", "unknown"):
            return await call_next(request)

        # 选桶：登录类公共端点用独立桶；埋点用独立宽松桶
        if path in LOGIN_PATHS:
            key = f"ratelimit:auth:{client_ip}"
            rate, window = self.login_rate, self.login_window
        elif path.startswith(ANALYTICS_PREFIX):
            key = f"ratelimit:analytics:{client_ip}"
            rate, window = 300, 60
        else:
            key = f"ratelimit:{client_ip}"
            rate, window = self.rate, self.window

        blocked, _cnt = await self._check_and_incr(key, rate, window)
        if blocked:
            logger.warning(
                "[RateLimit] blocked ip=%s path=%s key=%s rate=%d/%ds",
                client_ip, path, key, rate, window,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "code": 42900,
                    "message": f"请求过于频繁，请 {window} 秒后再试",
                    "data": None,
                },
                headers={"Retry-After": str(window)},
            )

        return await call_next(request)
