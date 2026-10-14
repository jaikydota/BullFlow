"""Image generation dispatch service – routes to Doubao or Tencent."""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generated_content import GeneratedContent
from app.services.minio_service import MinIOService

logger = logging.getLogger(__name__)


def _build_effective_prompt(prompt: str, brand_info: str | None) -> str:
    """将品牌信息拼接到生图提示词中，帮助模型生成符合品牌调性的图片。"""
    if not brand_info or not brand_info.strip():
        return prompt
    return f"{prompt}\n\n[品牌参考信息]\n{brand_info.strip()}"


async def generate_image(
    prompt: str,
    user_id: str,
    db: AsyncSession,
    *,
    provider: str = "doubao",
    size: str = "1920x1920",
    image_url: str | None = None,
    brand_info: str | None = None,
    template_label: str | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    """
    Generate an image via the specified provider, download the result to MinIO,
    and create a GeneratedContent record.

    品牌信息 (brand_info) 会被追加到提示词中，帮助模型生成符合品牌调性的图片。
    """
    effective_prompt = _build_effective_prompt(prompt, brand_info)

    record = GeneratedContent(
        user_id=user_id,
        type="image",
        title=title or prompt[:100],
        prompt=prompt,
        model_provider=provider,
        parameters={"size": size, "image_url": image_url, "brand_info": brand_info, "template_label": template_label},
        status="generating",
    )
    db.add(record)
    await db.flush()

    try:
        _refs = [image_url] if image_url else None
        if provider == "tencent":
            from app.services.tencent_vod_client import generate_image as tc_gen
            remote_url = await tc_gen(effective_prompt, size=size, image_urls=_refs)
        else:
            from app.services.doubao_client import generate_image as db_gen
            remote_url = await db_gen(effective_prompt, size=size, image_urls=_refs)

        minio_svc = MinIOService()
        file_path = await minio_svc.download_and_store(remote_url, "generated/images", user_id)

        record.file_path = file_path
        try:
            img_bytes = await minio_svc.get_object_bytes(file_path)
            from app.services.video_service import extract_image_thumbnail
            thumb_bytes = await extract_image_thumbnail(img_bytes)
            record.thumbnail_path = await minio_svc.upload_bytes(
                thumb_bytes, "generated/thumbnails", user_id, "jpg", "image/jpeg"
            )
        except Exception as thumb_err:
            logger.warning("Image thumbnail skipped | record may still complete: %s", thumb_err)

        record.status = "completed"
        await db.flush()

        # 将 MinIO 路径转为公开可访问 URL，与 GeneratedContentResponse 保持一致
        from app.services.minio_service import path_to_url
        public_url = path_to_url(file_path)
        public_thumb = path_to_url(record.thumbnail_path)

        return {
            "id": record.id,
            "file_path": public_url,
            "thumbnail_path": public_thumb,
            "remote_url": remote_url,
            "status": "completed",
        }

    except Exception as e:
        logger.exception("Image generation failed")
        record.status = "failed"
        record.error_message = str(e)[:2000]
        await db.flush()
        raise
