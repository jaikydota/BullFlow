from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.admin.dependencies import get_current_admin_user
from app.admin.schemas.common import success
from app.admin.schemas.notification_channels import NotificationChannelsBody, NotificationChannelTestBody
from app.admin.services import notification_channels_svc

from app.models.user import User

router = APIRouter(prefix="/notification-channels", tags=["通知渠道"])


@router.get("")
async def get_notification_channels(
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    m = await notification_channels_svc.get_channels_model(db)
    return success(data={"channels": m.model_dump(mode="json", by_alias=True)})


@router.put("")
async def put_notification_channels(
    body: NotificationChannelsBody,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    m = await notification_channels_svc.put_channels(db, body, str(admin.id))
    return success(data={"channels": m.model_dump(mode="json", by_alias=True)})


@router.post("/test")
async def test_notification_channel(
    body: NotificationChannelTestBody,
    _a: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    out = await notification_channels_svc.run_channel_test(db, body)
    return success(data=out)
