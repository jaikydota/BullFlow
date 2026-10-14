from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user, get_current_super_admin
from app.admin.schemas.billing_admin import (
    AiModelCreate,
    AiModelPatch,
    AiModelUpdate,
    DistributionBody,
    ProfitRatioBody,
    RobotConfig,
)
from app.admin.schemas.common import success
from app.admin.services import billing_admin, console_meta

from app.models.user import User

router = APIRouter(prefix="/billing", tags=["收费管理"])


@router.get("/config")
async def get_billing_config(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return success(data={"config": await console_meta.get_billing_config(db)})


@router.put("/config")
async def put_billing_config(
    body: dict[str, Any],
    sa: User = Depends(get_current_super_admin),
    db: AsyncSession = Depends(get_db),
):
    return success(
        data={"config": await console_meta.put_billing_config(db, body, operator_id=str(sa.id))}
    )


@router.get("/models")
async def list_models(
    q: str | None = Query(None, description="按名称/提供商/ID 模糊匹配"),
    type: str | None = Query(None, alias="type", description="text/image/video/multimodal"),
    enabled: bool | None = Query(None),
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    items, total = await billing_admin.list_models(db, q=q, model_type=type, enabled=enabled)
    return success(
        data={
            "items": [m.model_dump(mode="json") for m in items],
            "total": total,
        }
    )


@router.get("/models/{model_id}")
async def get_model(
    model_id: str,
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    m = await billing_admin.get_model(db, model_id)
    return success(data={"model": m.model_dump(mode="json")})


@router.post("/models")
async def create_model(
    body: AiModelCreate,
    sa: User = Depends(get_current_super_admin),
    db: AsyncSession = Depends(get_db),
):
    m = await billing_admin.create_model(db, body, operator_id=str(sa.id))
    return success(data={"model": m.model_dump(mode="json")})


@router.put("/models/{model_id}")
async def put_model(
    model_id: str,
    body: AiModelUpdate,
    sa: User = Depends(get_current_super_admin),
    db: AsyncSession = Depends(get_db),
):
    m = await billing_admin.update_model(db, model_id, body, operator_id=str(sa.id))
    return success(data={"model": m.model_dump(mode="json")})


@router.patch("/models/{model_id}")
async def patch_model(
    model_id: str,
    body: AiModelPatch,
    sa: User = Depends(get_current_super_admin),
    db: AsyncSession = Depends(get_db),
):
    m = await billing_admin.patch_model(db, model_id, body, operator_id=str(sa.id))
    return success(data={"model": m.model_dump(mode="json")})


@router.delete("/models/{model_id}")
async def delete_model(
    model_id: str,
    sa: User = Depends(get_current_super_admin),
    db: AsyncSession = Depends(get_db),
):
    out = await billing_admin.delete_model(db, model_id, operator_id=str(sa.id))
    return success(data=out)


@router.put("/distribution")
async def put_distribution(
    body: DistributionBody,
    sa: User = Depends(get_current_super_admin),
    db: AsyncSession = Depends(get_db),
):
    out = await billing_admin.put_distribution(db, body, operator_id=str(sa.id))
    return success(data=out)


@router.put("/robot")
async def put_robot(
    body: RobotConfig,
    sa: User = Depends(get_current_super_admin),
    db: AsyncSession = Depends(get_db),
):
    out = await billing_admin.put_robot(db, body, operator_id=str(sa.id))
    return success(data={"robot": out})


@router.put("/profit-ratio")
async def put_profit_ratio(
    body: ProfitRatioBody,
    sa: User = Depends(get_current_super_admin),
    db: AsyncSession = Depends(get_db),
):
    out = await billing_admin.put_profit_ratio(db, body, operator_id=str(sa.id))
    return success(data=out)
