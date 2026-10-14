from __future__ import annotations

from typing import Any

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_platform import AdminAuditLog


async def append_audit_log(
    db: AsyncSession,
    *,
    operator_id: str,
    action: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    detail: Any | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> None:
    """追加审计；失败时仅回滚审计写入（savepoint），不阻塞主业务（如建号、改单）。

    未执行 `backend` Alembic 导致无 `admin_audit_logs` 表时，此处会静默跳过，
    避免整笔事务回滚导致 POST /admin/users 等接口 500。
    """
    try:
        async with db.begin_nested():
            db.add(
                AdminAuditLog(
                    operator_id=operator_id,
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    detail=detail,
                    ip=ip,
                    user_agent=user_agent,
                )
            )
            await db.flush()
    except SQLAlchemyError:
        return
