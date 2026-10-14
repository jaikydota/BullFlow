"""请求级日志关联：给每个入站请求 / 后台任务分配一个短 request-id，注入到日志行。

便于「查询错误」：grep 一个 rid 即可串起该次请求的入站行、灵径请求/响应行、webhook 处理行、响应行。
未在请求上下文中的日志 rid 显示为 `-`。
"""
from __future__ import annotations

import contextvars
import logging
import uuid

_request_id: contextvars.ContextVar[str] = contextvars.ContextVar("tlf_request_id", default="-")


def set_request_id(rid: str | None = None) -> str:
    """设置当前上下文的 request-id；不传则生成一个 8 位短 id。返回最终 id。"""
    rid = (rid or uuid.uuid4().hex[:8]).strip() or uuid.uuid4().hex[:8]
    _request_id.set(rid[:32])
    return _request_id.get()


class RequestIdFilter(logging.Filter):
    """给每条日志记录补上 rid 字段（缺省 `-`），供 format 串 `[%(rid)s]` 使用。"""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        if not hasattr(record, "rid"):
            record.rid = _request_id.get()
        return True


LOG_FORMAT = "%(asctime)s %(levelname)s [%(name)s] [%(rid)s] %(message)s"


def install_request_id_logging() -> None:
    """把 RequestIdFilter + 带 rid 的 Formatter 装到 root 日志处理器上（幂等）。"""
    fmt = logging.Formatter(LOG_FORMAT)
    flt = RequestIdFilter()
    root = logging.getLogger()
    for h in root.handlers:
        h.setFormatter(fmt)
        # 避免重复添加同类 filter
        if not any(isinstance(f, RequestIdFilter) for f in h.filters):
            h.addFilter(flt)
