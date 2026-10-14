from __future__ import annotations

from fastapi import APIRouter

from app.admin.api import analytics, audit_logs, auth, billing, dashboard, feedback, finance
from app.admin.api import finance_team
from app.admin.api import notification_channels as notification_channels_router
from app.admin.api import platform_settings as platform_settings_router
from app.admin.api import roles, sales
from app.admin.api import broadcasts, invoices, saas_catalog, saas_orders, skills, traffic_secrets, uploads, users
from app.admin.api import tracking

api_router = APIRouter(prefix="/admin")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(roles.router)
api_router.include_router(dashboard.router)
api_router.include_router(analytics.router)
api_router.include_router(tracking.router)
api_router.include_router(billing.router)
api_router.include_router(saas_catalog.router)
api_router.include_router(saas_catalog.addons_router)
api_router.include_router(saas_orders.router)
api_router.include_router(invoices.router)
api_router.include_router(finance.router)
api_router.include_router(finance_team.router)
api_router.include_router(sales.router)
api_router.include_router(notification_channels_router.router)
api_router.include_router(platform_settings_router.router)
api_router.include_router(audit_logs.router)
api_router.include_router(uploads.router)
api_router.include_router(traffic_secrets.router)
api_router.include_router(broadcasts.router)
api_router.include_router(feedback.router)
api_router.include_router(skills.router)
