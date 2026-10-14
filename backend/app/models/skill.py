from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDBin16, _generate_uuid7


class Skill(Base):
    """内容生成「skill 池」—— 预设提示词模板（无 user_id，全平台共享，后台管理）。

    用户在生成文章/图片/视频或对话时选一个 skill，把 `prompt` 注入生成：
    LLM 类（文章/对话）注入 system，图片/视频追加到 prompt。
    """

    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(
        UUIDBin16, primary_key=True, default=_generate_uuid7, comment="主键"
    )
    slug: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True, comment="业务唯一标识"
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, comment="skill 名称")
    description: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="一句话说明（展示用）"
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False, comment="skill 完整提示词")
    content_types: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="适用的生成类型子集：article / image / video / chat",
    )
    platforms: Mapped[list | None] = mapped_column(
        JSON(none_as_null=True), nullable=True,
        comment="适用平台 code 列表（空=通用）",
    )
    category: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="分组：humanize / platform / format 等"
    )
    icon: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="图标（lucide 名或 emoji）"
    )
    source_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="出处链接（可空）"
    )
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", name="skill_status"),
        nullable=False, server_default="active",
    )
    recommended: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="0", comment="是否推荐（用户端高亮展示）"
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", comment="展示排序，越小越前"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
