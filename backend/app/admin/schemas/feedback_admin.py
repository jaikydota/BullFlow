from __future__ import annotations

from pydantic import BaseModel, Field


class FeedbackAdminOut(BaseModel):
    """后台反馈列表 / 详情条目。"""

    id: str
    category: str
    content: str
    images: list[str]
    contact: str | None = None
    status: str
    reply: str | None = None
    repliedAt: str | None = None
    createdAt: str | None = None
    # 提交用户信息
    userId: str
    userName: str | None = None
    userPhoneTail: str | None = None
    userEmail: str | None = None

    model_config = {"from_attributes": False}


class FeedbackPatch(BaseModel):
    """更新反馈处理状态 / 回复。"""

    status: str | None = Field(None, pattern=r"^(pending|resolved)$")
    reply: str | None = Field(None, max_length=5000)
