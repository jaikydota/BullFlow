from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user
from app.admin.schemas.common import success
from app.admin.schemas.saas_admin import AdminAddonPayload, AdminPlanPayload
from app.admin.services import saas_ops

from app.models.user import User

router = APIRouter(prefix="/plans", tags=["套餐管理"])


@router.get("")
async def get_plans(_a: User = Depends(get_current_admin_user), db: AsyncSession = Depends(get_db)):
    return success(data={"plans": await saas_ops.list_plans(db)})


@router.post("")
async def post_plan(
    body: AdminPlanPayload,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data={"plan": await saas_ops.upsert_plan(db, body, operator_id=str(admin.id))})


@router.put("/{slug:path}")
async def put_plan(
    slug: str,
    body: AdminPlanPayload,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if body.slug != slug:
        body = AdminPlanPayload(**{**body.model_dump(), "slug": slug})
    return success(data={"plan": await saas_ops.upsert_plan(db, body, operator_id=str(admin.id))})


@router.post("/{slug:path}/sync-quota")
async def sync_plan_quota_api(
    slug: str,
    mode: str = Query("upgrade_only", pattern=r"^(upgrade_only|align)$"),
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """把套餐当前额度同步到该套餐所有 active 订阅。mode=upgrade_only(只升不降)/align(强制对齐)。"""
    return success(
        data=await saas_ops.sync_plan_quota(db, slug, mode=mode, operator_id=str(admin.id))
    )


@router.delete("/{slug:path}")
async def delete_plan(
    slug: str,
    target_slug: str = Query(..., description="使用该套餐的用户转换到的目标套餐 slug"),
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """删除套餐；使用该套餐的用户将被转换到 target_slug 套餐。Free 套餐不可删除。"""
    return success(
        data=await saas_ops.delete_plan(
            db, slug, target_slug=target_slug, operator_id=str(admin.id)
        )
    )


addons_router = APIRouter(prefix="/addons", tags=["增值服务"])


@addons_router.get("")
async def get_addons(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    addon_type: str | None = Query(
        None,
        pattern=r"^(points|storage|domestic_account|overseas_account)$",
        description="按类型过滤；不传则返回全部",
    ),
):
    return success(
        data={"services": await saas_ops.list_addons(db, addon_type=addon_type)}
    )


@addons_router.post("")
async def post_addon(
    body: AdminAddonPayload,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data={"service": await saas_ops.upsert_addon(db, body, operator_id=str(admin.id))})


@addons_router.put("/{slug:path}")
async def put_addon(
    slug: str,
    body: AdminAddonPayload,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if body.slug != slug:
        body = AdminAddonPayload(**{**body.model_dump(), "slug": slug})
    return success(
        data={"service": await saas_ops.upsert_addon(db, body, operator_id=str(admin.id))}
    )


@addons_router.delete("/{slug:path}")
async def delete_addon(
    slug: str,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """删除增值服务 / 加包（直接硬删除，不影响历史订单与积分流水）。"""
    return success(data=await saas_ops.delete_addon(db, slug, operator_id=str(admin.id)))
