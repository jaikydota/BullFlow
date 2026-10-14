"""统一异常 + 业务码体系。"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class AppException(Exception):
    def __init__(self, code: int = 50000, message: str = "服务器内部错误", data: Any = None):
        self.code = code
        self.message = message
        self.data = data
        super().__init__(message)


class BadRequestError(AppException):
    def __init__(self, message: str = "请求参数错误"):
        super().__init__(code=40000, message=message)


class AuthenticationError(AppException):
    def __init__(self, message: str = "认证失败"):
        super().__init__(code=40100, message=message)


class ForbiddenError(AppException):
    def __init__(self, message: str = "权限不足"):
        super().__init__(code=40300, message=message)


class NotFoundError(AppException):
    def __init__(self, message: str = "资源不存在"):
        super().__init__(code=40400, message=message)


class ConflictError(AppException):
    def __init__(self, message: str = "资源冲突"):
        super().__init__(code=40900, message=message)


class UpstreamError(AppException):
    """灵径 lapi.cc 上游返回错误。"""
    def __init__(self, message: str = "上游服务异常", data: Any = None):
        super().__init__(code=50200, message=message, data=data)


_CODE_TO_HTTP_STATUS = {
    40000: 400,
    40100: 401,
    40300: 403,
    40400: 404,
    40900: 409,
    50000: 500,
    50200: 502,
}


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    http_status = _CODE_TO_HTTP_STATUS.get(exc.code, 500)
    # 记日志便于查错：4xx 用 warning，5xx 用 error（含 path + 业务码 + message + data）
    log = logger.error if http_status >= 500 else logger.warning
    log(
        "[APP-ERR] %s %s → code=%s http=%s msg=%s data=%s",
        request.method, request.url.path, exc.code, http_status, exc.message, exc.data,
    )
    return JSONResponse(
        status_code=http_status,
        content={"code": exc.code, "message": exc.message, "data": exc.data},
    )
