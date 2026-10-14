"""admin: 子租户 CRUD。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tlf_app.core.database import get_db
from tlf_app.core.dependencies import AdminClaims, get_current_admin
from tlf_app.core.exceptions import ConflictError, NotFoundError
from tlf_app.core.security import (
    generate_app_id,
    generate_app_key,
    generate_webhook_secret,
    hash_secret,
)
from tlf_app.models.developer_app import DeveloperApp
from tlf_app.schemas.common import ok
from tlf_app.schemas.tenant import (
    TenantCreateRequest,
    TenantCreateResponse,
    TenantResponse,
    TenantUpdateRequest,
)

router = APIRouter()


@router.post("/tenants", response_model=TenantCreateResponse)
async def create_tenant(
    body: TenantCreateRequest,
    admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    # 防同名重复（友好提示，但不强制唯一）
    app_id_value = generate_app_id()
    app_key_plain = generate_app_key()
    webhook_secret = generate_webhook_secret()
    app = DeveloperApp(
        name=body.name,
        app_id=app_id_value,
        app_key_hash=hash_secret(app_key_plain),
        webhook_url=body.webhook_url,
        webhook_secret=webhook_secret,
        status="active",
        description=body.description,
        created_by_admin_id=admin.id,
    )
    db.add(app)
    await db.commit()
    await db.refresh(app)
    resp = TenantCreateResponse.model_validate(app)
    resp.app_key_plaintext = app_key_plain
    resp.webhook_secret_plaintext = webhook_secret
    return resp


@router.get("/tenants", response_model=list[TenantResponse])
async def list_tenants(
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(DeveloperApp).order_by(DeveloperApp.created_at.desc())
    )).scalars().all()
    return [TenantResponse.model_validate(r) for r in rows]


@router.get("/tenants/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: str,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    app = (await db.execute(select(DeveloperApp).where(DeveloperApp.id == tenant_id))).scalar_one_or_none()
    if app is None:
        raise NotFoundError("租户不存在")
    return TenantResponse.model_validate(app)


@router.patch("/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: str,
    body: TenantUpdateRequest,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    app = (await db.execute(select(DeveloperApp).where(DeveloperApp.id == tenant_id))).scalar_one_or_none()
    if app is None:
        raise NotFoundError("租户不存在")
    if body.name is not None:
        app.name = body.name
    if body.webhook_url is not None:
        app.webhook_url = body.webhook_url
    if body.status is not None:
        app.status = body.status
    if body.description is not None:
        app.description = body.description
    # commit 保证响应前落库（前端保存后立即 reload）；refresh 取回 updated_at
    # 等过期字段，避免 model_validate 懒加载触发 MissingGreenlet。
    await db.commit()
    await db.refresh(app)
    return TenantResponse.model_validate(app)


@router.post("/tenants/{tenant_id}/reset-app-key", response_model=TenantCreateResponse)
async def reset_app_key(
    tenant_id: str,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    app = (await db.execute(select(DeveloperApp).where(DeveloperApp.id == tenant_id))).scalar_one_or_none()
    if app is None:
        raise NotFoundError("租户不存在")
    plain = generate_app_key()
    app.app_key_hash = hash_secret(plain)
    await db.commit()
    await db.refresh(app)
    resp = TenantCreateResponse.model_validate(app)
    resp.app_key_plaintext = plain
    resp.webhook_secret_plaintext = app.webhook_secret
    return resp


@router.post("/tenants/{tenant_id}/reset-webhook-secret", response_model=TenantCreateResponse)
async def reset_webhook_secret(
    tenant_id: str,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    app = (await db.execute(select(DeveloperApp).where(DeveloperApp.id == tenant_id))).scalar_one_or_none()
    if app is None:
        raise NotFoundError("租户不存在")
    new_secret = generate_webhook_secret()
    app.webhook_secret = new_secret
    await db.commit()
    await db.refresh(app)
    resp = TenantCreateResponse.model_validate(app)
    resp.app_key_plaintext = "***"  # 不重发 app_key
    resp.webhook_secret_plaintext = new_secret
    return resp


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: str,
    _admin: AdminClaims = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """软删除 (status=disabled)。强删请先级联清 binding。"""
    app = (await db.execute(select(DeveloperApp).where(DeveloperApp.id == tenant_id))).scalar_one_or_none()
    if app is None:
        raise NotFoundError("租户不存在")
    app.status = "disabled"
    await db.commit()
    return ok({"disabled": True})
