"""Video generation dispatch service – routes to Doubao or Tencent."""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generated_content import GeneratedContent
from app.services.minio_service import MinIOService

logger = logging.getLogger(__name__)


async def generate_video(
    prompt: str,
    user_id: str,
    db: AsyncSession,
    *,
    provider: str = "doubao",
    resolution: str = "1080p",
    duration: int = 5,
    image_url: str | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    """
    Generate a video via the specified provider, download the result to MinIO,
    and create a GeneratedContent record.
    """
    record = GeneratedContent(
        user_id=user_id,
        type="video",
        title=title or prompt[:100],
        prompt=prompt,
        model_provider=provider,
        parameters={"resolution": resolution, "duration": duration, "image_url": image_url},
        status="generating",
    )
    db.add(record)
    await db.flush()

    try:
        if provider == "tencent":
            from app.services.tencent_vod_client import generate_video as tc_gen
            remote_url = await tc_gen(
                prompt, resolution=resolution.upper(), duration=duration, image_url=image_url
            )
        else:
            from app.services.doubao_client import generate_video as db_gen
            remote_url = await db_gen(
                prompt, resolution=resolution, duration=duration, image_url=image_url
            )

        minio_svc = MinIOService()
        file_path = await minio_svc.download_and_store(remote_url, "generated/videos", user_id)

        record.file_path = file_path
        record.status = "completed"
        await db.flush()

        return {
            "id": record.id,
            "file_path": file_path,
            "remote_url": remote_url,
            "status": "completed",
        }

    except Exception as e:
        logger.exception("Video generation failed")
        record.status = "failed"
        record.error_message = str(e)[:2000]
        await db.flush()
        raise
