from __future__ import annotations

from fastapi import APIRouter, Depends, UploadFile, File

from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import success
from app.services.minio_service import MinIOService

router = APIRouter(prefix="/uploads", tags=["文件上传"])

ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """上传图片到 MinIO profile/ 目录（已配置公开读），返回永久可访问的公开 URL。
    适用于品牌 Logo、产品封面等需要持久化展示的图片。
    """
    if file.content_type not in ALLOWED_IMAGE_MIME:
        from app.core.exceptions import BadRequestError
        raise BadRequestError("仅支持 JPEG / PNG / GIF / WebP / SVG 格式")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_IMAGE_SIZE:
        from app.core.exceptions import BadRequestError
        raise BadRequestError("图片大小不能超过 5 MB")

    ext = (file.filename or "img").rsplit(".", 1)[-1] if "." in (file.filename or "") else "png"
    minio_svc = MinIOService()
    file_path = await minio_svc.upload_bytes(
        file_bytes,
        "profile",
        current_user.id,
        ext=ext,
        content_type=file.content_type or "image/png",
    )

    # profile/ 已配置公开读，直接返回永久可访问的公开 URL
    public_url = minio_svc.get_public_url(file_path)
    return success(data={"file_path": file_path, "url": public_url})
