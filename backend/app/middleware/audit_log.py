"""Audit logging middleware for tracking key operations."""
from __future__ import annotations

import logging
import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("audit")

AUDIT_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class AuditLogMiddleware(BaseHTTPMiddleware):
    """
    Logs mutating API requests (POST/PUT/PATCH/DELETE) with:
    - timestamp, method, path, user_id (from JWT), status_code, duration
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method not in AUDIT_METHODS:
            return await call_next(request)

        start = time.time()
        response = await call_next(request)
        duration_ms = round((time.time() - start) * 1000, 2)

        user_id = _extract_user_id(request)
        logger.info(
            "AUDIT | %s %s | user=%s | status=%d | %sms",
            request.method,
            request.url.path,
            user_id or "anonymous",
            response.status_code,
            duration_ms,
        )
        return response


def _extract_user_id(request: Request) -> str | None:
    """Try to extract user_id from JWT in Authorization header without full validation."""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:]
    try:
        import base64
        import json
        parts = token.split(".")
        if len(parts) < 2:
            return None
        payload_b64 = parts[1] + "=" * (4 - len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        return payload.get("sub")
    except Exception:
        return None
