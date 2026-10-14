"""推量发 API 顶层路由（由 main.py 挂在 /api 前缀下）。

挂载完整 URL：
- /api/sdk/v1/*      —— 对外开发者 SDK
- /api/admin/v1/*    —— 后台管理
- /api/webhooks/*    —— 接收灵径回调
"""
from __future__ import annotations

from fastapi import APIRouter

from tlf_app.api.sdk.v1 import accounts as sdk_accounts
from tlf_app.api.sdk.v1 import auth as sdk_auth
from tlf_app.api.sdk.v1 import metrics as sdk_metrics
from tlf_app.api.sdk.v1 import publish as sdk_publish
from tlf_app.api.admin.v1 import accounts as admin_accounts
from tlf_app.api.admin.v1 import auth as admin_auth
from tlf_app.api.admin.v1 import proxies as admin_proxies
from tlf_app.api.admin.v1 import tenants as admin_tenants
from tlf_app.api.admin.v1 import tasks as admin_tasks
from tlf_app.api.admin.v1 import platforms as admin_platforms
from tlf_app.api.admin.v1 import webhook_events as admin_webhook_events
from tlf_app.api.webhooks import composio as webhook_composio
from tlf_app.api.webhooks import lapi as webhook_lapi

api_router = APIRouter()

# SDK 路由（Bearer app_key）
api_router.include_router(sdk_auth.router, prefix="/sdk/v1", tags=["sdk-auth"])
api_router.include_router(sdk_accounts.router, prefix="/sdk/v1", tags=["sdk-accounts"])
api_router.include_router(sdk_publish.router, prefix="/sdk/v1", tags=["sdk-publish"])
api_router.include_router(sdk_metrics.router, prefix="/sdk/v1", tags=["sdk-metrics"])

# Admin 路由（本地 JWT；admin_auth 提供登录/me/改密）
api_router.include_router(admin_auth.router, prefix="/admin/v1", tags=["admin-auth"])
api_router.include_router(admin_tenants.router, prefix="/admin/v1", tags=["admin-tenants"])
api_router.include_router(admin_accounts.router, prefix="/admin/v1", tags=["admin-accounts"])
api_router.include_router(admin_proxies.router, prefix="/admin/v1", tags=["admin-proxies"])
api_router.include_router(admin_tasks.router, prefix="/admin/v1", tags=["admin-tasks"])
api_router.include_router(admin_platforms.router, prefix="/admin/v1", tags=["admin-platforms"])
api_router.include_router(admin_webhook_events.router, prefix="/admin/v1", tags=["admin-webhook-events"])

# Webhook
api_router.include_router(webhook_lapi.router, prefix="/webhooks", tags=["webhooks"])
api_router.include_router(webhook_composio.router, prefix="/webhooks", tags=["webhooks"])
