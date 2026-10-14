from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


class AppException(Exception):
    """Base application exception with error code."""

    def __init__(self, code: int = 50000, message: str = "服务器内部错误", data: Any = None):
        self.code = code
        self.message = message
        self.data = data
        super().__init__(message)


# ---- 40xxx Client errors ----

class BadRequestError(AppException):
    def __init__(self, message: str = "请求参数错误", data: Any = None):
        super().__init__(code=40000, message=message, data=data)


class AuthenticationError(AppException):
    def __init__(self, message: str = "认证失败"):
        super().__init__(code=40100, message=message)


class TokenExpiredError(AppException):
    def __init__(self, message: str = "Token 已过期"):
        super().__init__(code=40101, message=message)


class ForbiddenError(AppException):
    def __init__(self, message: str = "权限不足"):
        super().__init__(code=40300, message=message)


class NotFoundError(AppException):
    def __init__(self, message: str = "资源不存在"):
        super().__init__(code=40400, message=message)


class ConflictError(AppException):
    def __init__(self, message: str = "资源冲突"):
        super().__init__(code=40900, message=message)


class TooManyRequestsError(AppException):
    def __init__(self, message: str = "请求过于频繁，请稍后再试", data: Any = None):
        super().__init__(code=42900, message=message, data=data)


class CaptchaRequiredError(AppException):
    """需要先完成人机验证（前端据此 code 弹出滑块验证后重试）。"""

    def __init__(self, message: str = "请完成人机验证", data: Any = None):
        super().__init__(code=42901, message=message, data=data)


# ---- HTTP status code mapping ----

_CODE_TO_HTTP_STATUS = {
    40000: 400,
    40100: 401,
    40101: 401,
    40300: 403,
    40301: 409,  # 账号登录态失效，需重新扫码授权（客户端可操作，非服务端错误）
    40400: 404,
    40900: 409,
    42900: 429,
    42901: 403,  # 需人机验证（客户端可操作）
    50000: 500,
    50301: 503,
}


async def app_exception_handler(_request: Request, exc: AppException) -> JSONResponse:
    http_status = _CODE_TO_HTTP_STATUS.get(exc.code, 500)
    return JSONResponse(
        status_code=http_status,
        content={"code": exc.code, "message": exc.message, "data": exc.data},
    )
