from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.core.time import UtcModel


class ArticleGenRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="文章生成提示词")
    provider: str | None = None
    model: str | None = None
    brand_info: str | None = None
    reference: dict[str, Any] | None = Field(
        None,
        description="参考内容配置 {mode: auto|custom|none, *_ids}；优先于 brand_info",
    )
    skill_id: str | None = Field(None, description="所选 skill 池预设 ID（注入提示词）")
    template_label: str | None = Field(None, description="所用模板名称（用于记录）")
    stream: bool = Field(True, description="是否流式返回")
    mixed: bool = Field(
        False, description="生成图文混编内容（正文内嵌配图）；为 True 时走异步生成，stream 失效"
    )


class ImageGenRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="生图提示词")
    provider: str = Field("azure", description="azure(GPT-Image-2) / doubao / tencent")
    size: str = Field("1024x1024", description="图片尺寸")
    image_url: str | None = Field(None, description="参考图 URL（图生图，单图，兼容旧调用）")
    image_urls: list[str] | None = Field(
        None, description="参考图 URL 列表（多图参考；优先于 image_url）。后端按各模型上限裁剪"
    )
    brand_info: str | None = Field(None, description="品牌信息，用于辅助构建提示词")
    reference: dict[str, Any] | None = Field(
        None, description="参考内容配置 {mode, *_ids}；优先于 brand_info"
    )
    skill_id: str | None = Field(None, description="所选 skill 池预设 ID（注入提示词）")
    template_label: str | None = Field(None, description="所用模板名称（用于记录）")
    title: str | None = None
    count: int = Field(1, ge=1, le=20, description="一次生成的图片张数（后端按 IMAGE_BATCH_MAX clamp）")
    as_dynamic: bool = Field(
        False, description="生成发布动态：多图 + 复用元数据文案，标记 layout=dynamic"
    )

    @model_validator(mode="after")
    def _validate_size_pixels(self) -> "ImageGenRequest":
        """Doubao Seedream 要求最少 3,686,400 像素，在此处提前拦截，避免调用 API 才报错。"""
        if self.provider != "doubao":
            return self
        try:
            w_str, h_str = self.size.split("x")
            pixels = int(w_str) * int(h_str)
        except (ValueError, AttributeError):
            raise ValueError(f"无效的尺寸格式 '{self.size}'，应为 WxH（例如 2560x1440）")
        if pixels < 3_686_400:
            raise ValueError(
                f"Doubao Seedream 要求尺寸至少 3,686,400 像素，"
                f"当前 {self.size} 仅 {pixels:,} 像素。"
                f"请选择 2560×1440 / 1440×2560 / 1920×1920 等有效尺寸。"
            )
        return self


class VideoGenRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="生视频提示词")
    provider: str = Field("doubao", description="doubao / tencent")
    resolution: str = Field("1080p", description="分辨率")
    # 上限 15s：Doubao Seedance / Tencent Kling 模型最大支持 15 秒，超出会在调用第三方时失败
    duration: int = Field(5, ge=1, le=15, description="时长（秒），支持 5/10/15")
    enable_audio: bool = Field(True, description="是否生成视频背景音/音效；默认勾选")
    image_url: str | None = Field(None, description="首帧参考图 URL（图生视频）")
    last_image_url: str | None = Field(None, description="尾帧参考图 URL（可选，须与首帧同时给）")
    brand_info: str | None = Field(None, description="品牌信息，用于辅助构建提示词")
    reference: dict[str, Any] | None = Field(
        None, description="参考内容配置 {mode, *_ids}；优先于 brand_info"
    )
    skill_id: str | None = Field(None, description="所选 skill 池预设 ID（注入提示词）")
    template_label: str | None = Field(None, description="所用模板名称（用于记录）")
    title: str | None = None


class GeneratedContentResponse(UtcModel):
    id: str
    user_id: str
    type: str
    title: str | None = None
    content: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    file_path: str | None = None
    media_urls: list[str] | None = None
    layout: str | None = None
    thumbnail_path: str | None = None
    prompt: str | None = None
    model_provider: str | None = None
    model_name: str | None = None
    parameters: Any = None
    status: str
    publish_status: str = "draft"
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _transform_paths(self) -> GeneratedContentResponse:
        from app.services.minio_service import path_to_url
        self.file_path = path_to_url(self.file_path)
        self.thumbnail_path = path_to_url(self.thumbnail_path)
        if self.media_urls:
            self.media_urls = [path_to_url(p) or p for p in self.media_urls]
        return self
