from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.defaults.billing_defaults import BILLING_CONFIGURATION_DEFAULT
from app.admin.services import platform_settings_svc

from app.models.user import User

PERMISSIONS_CATALOG = [
    {"id": "user.view", "label": "查看用户", "module": "用户管理"},
    {"id": "user.create", "label": "创建用户", "module": "用户管理"},
    {"id": "user.edit", "label": "编辑用户", "module": "用户管理"},
    {"id": "user.delete", "label": "删除/禁用用户", "module": "用户管理"},
    {"id": "billing.view", "label": "查看收费配置", "module": "收费管理"},
    {"id": "billing.edit", "label": "修改收费配置", "module": "收费管理"},
    {"id": "log.view", "label": "查看操作日志", "module": "系统管理"},
    {"id": "setting.view", "label": "查看系统设置", "module": "系统管理"},
    {"id": "setting.edit", "label": "修改系统设置", "module": "系统管理"},
]

ROLE_DEFINITIONS = [
    {
        "id": "super_admin",
        "name": "超级管理员",
        "desc": "拥有系统所有权限，可管理其他管理员",
        "color": "bg-red-500/10 text-red-600 border-red-500/20",
        "editable": False,
        "permIds": [p["id"] for p in PERMISSIONS_CATALOG],
    },
    {
        "id": "admin",
        "name": "管理员",
        "desc": "可管理用户、审核内容、查看日志",
        "color": "bg-blue-500/10 text-blue-600 border-blue-500/20",
        "editable": True,
        "permIds": [
            "user.view",
            "user.create",
            "user.edit",
            "content.view",
            "content.approve",
            "content.delete",
            "log.view",
            "setting.view",
        ],
    },
    {
        "id": "sales",
        "name": "销售",
        "desc": "引流销售账号，绑定专属邀请码，归因注册用户（无后台管理权限）",
        "color": "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
        "editable": False,
        "permIds": [],
    },
    {
        "id": "finance",
        "name": "财务",
        "desc": "财务核销员，处理对公转账核销与开票（登录后台仅见订单管理 + 财务报表）",
        "color": "bg-purple-500/10 text-purple-600 border-purple-500/20",
        "editable": False,
        "permIds": [],
    },
    {
        "id": "user",
        "name": "普通用户",
        "desc": "仅使用业务功能，无管理权限",
        "color": "bg-gray-500/10 text-gray-600 border-gray-500/20",
        "editable": False,
        "permIds": [],
    },
]


async def roles_overview(db: AsyncSession) -> dict[str, Any]:
    r = await db.execute(select(User.role, func.count(User.id)).group_by(User.role))
    counts_map = {str(role): int(n or 0) for role, n in r.all()}

    roles_out = []
    for rd in ROLE_DEFINITIONS:
        rid = rd["id"]
        cnt = counts_map.get(rid, 0)
        roles_out.append(
            {
                **rd,
                "userCount": cnt,
            }
        )

    return {"permissions": PERMISSIONS_CATALOG, "roles": roles_out}


async def get_billing_config(db: AsyncSession) -> dict[str, Any]:
    all_kv = await platform_settings_svc.get_all_settings(db)
    cfg = all_kv.get("billing_configuration")
    if isinstance(cfg, dict):
        return cfg
    return BILLING_CONFIGURATION_DEFAULT


async def put_billing_config(
    db: AsyncSession,
    body: dict[str, Any],
    *,
    operator_id: str,
) -> dict[str, Any]:
    await platform_settings_svc.update_settings_partial(
        db, {"billing_configuration": body}, operator_id
    )
    return await get_billing_config(db)
