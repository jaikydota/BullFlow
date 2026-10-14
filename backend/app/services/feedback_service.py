from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.feedback import Feedback
from app.services.base_service import BaseCRUDService


class FeedbackService(BaseCRUDService[Feedback]):
    """用户反馈服务（多租户隔离，用户仅能读写自己的反馈）。"""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Feedback)
