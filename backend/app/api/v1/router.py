from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    audios,
    auth,
    billing,
    brands,
    captcha,
    cases,
    chat,
    companies,
    dashboard,
    customers,
    documents,
    evaluation,
    feedbacks,
    generation,
    images,
    knowledge,
    tlf,
    tlf_webhook,
    notices,
    notifications,
    products,
    schedules,
    search,
    skills,
    subscription,
    system,
    tasks,
    traffic_secrets,
    uploads,
    users,
    videos,
    webhooks,
    referral,
    analytics,
)
from app.admin.router import api_router as admin_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(system.router)
api_router.include_router(auth.router)
api_router.include_router(captcha.router)
api_router.include_router(dashboard.router)
api_router.include_router(users.router)
api_router.include_router(companies.router)
api_router.include_router(brands.router)
api_router.include_router(products.router)
api_router.include_router(customers.router)
api_router.include_router(cases.router)
api_router.include_router(documents.router)
api_router.include_router(tasks.router)
api_router.include_router(images.router)
api_router.include_router(videos.router)
api_router.include_router(audios.router)
api_router.include_router(knowledge.router)
api_router.include_router(search.router)
api_router.include_router(skills.router)
api_router.include_router(chat.router)
api_router.include_router(schedules.router)   # schedules 必须在 generation 前注册，避免 /{id} 路由吞掉 /schedules
api_router.include_router(generation.router)
api_router.include_router(tlf.router)
api_router.include_router(tlf_webhook.router)
api_router.include_router(uploads.router)
api_router.include_router(evaluation.router)
api_router.include_router(billing.router)
api_router.include_router(subscription.router)
api_router.include_router(webhooks.router)
api_router.include_router(traffic_secrets.router)
api_router.include_router(notices.router)
api_router.include_router(notifications.router)
api_router.include_router(feedbacks.router)
api_router.include_router(referral.router)
api_router.include_router(analytics.router)

# 管理后台：/api/v1/admin/*，鉴权见 app.admin.dependencies
api_router.include_router(admin_router)
