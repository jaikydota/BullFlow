"""管理端文件上传（复用业务 backend 的 MinIO 客户端与 MinIOService）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile

from app.admin.dependencies import get_current_admin_user, get_current_finance_user
from app.core.exceptions import BadRequestError
from app.admin.schemas.common import success
from app.models.user import User

router = APIRouter(prefix="/uploads", tags=["文件上传"])

ALLOWED_IMAGE_MIME = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/x-icon",
    "image/vnd.microsoft.icon",
}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB

# 通用文件（发票等）：图片 + PDF
ALLOWED_FILE_MIME = ALLOWED_IMAGE_MIME | {"application/pdf"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


@router.post("/image")
async def admin_upload_image(
    file: UploadFile = File(...),
    admin: User = Depends(get_current_admin_user),
):
    """上传图片到 MinIO，路径形如 `{admin_id}/admin/{YYYY-MM}/uuid.ext`，返回公开访问 URL。

    需在环境中配置与业务 backend 一致的 `MINIO_*`（见 `backend/.env.example`），
    且 MinIO 服务可连通；启动时会尝试 `init_minio()` 建桶与公开读策略。
    """
    if file.content_type not in ALLOWED_IMAGE_MIME:
        raise BadRequestError("仅支持 JPEG / PNG / GIF / WebP / SVG 格式")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_IMAGE_SIZE:
        raise BadRequestError("图片大小不能超过 10 MB")

    ext = (file.filename or "img").rsplit(".", 1)[-1] if "." in (file.filename or "") else "png"
    if ext.lower() not in ("jpg", "jpeg", "png", "gif", "webp", "svg"):
        ext = "png"

    try:
        from app.services.minio_service import MinIOService
    except Exception as e:
        raise BadRequestError("MinIO 依赖未就绪") from e

    try:
        minio_svc = MinIOService()
    except RuntimeError as e:
        raise BadRequestError("MinIO 未初始化，请检查 MINIO_* 配置并确保对象存储已启动") from e

    file_path = await minio_svc.upload_bytes(
        file_bytes,
        "admin",
        str(admin.id),
        ext=ext,
        content_type=file.content_type or "image/png",
    )
    public_url = minio_svc.get_public_url(file_path)
    return success(
        data={
            "file_path": file_path,
            "url": public_url,
            "content_type": file.content_type,
        }
    )


@router.post("/file")
async def admin_upload_file(
    file: UploadFile = File(...),
    admin: User = Depends(get_current_finance_user),
):
    """上传图片或 PDF 到 MinIO（发票文件 / 收款凭证等），返回公开访问 URL。

    权限放宽到财务（get_current_finance_user）：财务开票 / 核销时需上传发票或凭证文件。

    对象路径同 image：`{admin_id}/admin/{YYYY-MM}/uuid.ext`，与业务 backend 共用桶（public-read）。
    """
    if file.content_type not in ALLOWED_FILE_MIME:
        raise BadRequestError("仅支持图片（JPEG/PNG/GIF/WebP）或 PDF 文件")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise BadRequestError("文件大小不能超过 20 MB")

    name = file.filename or "file"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in ("jpg", "jpeg", "png", "gif", "webp", "svg", "pdf"):
        ext = "pdf" if file.content_type == "application/pdf" else "png"

    try:
        from app.services.minio_service import MinIOService
    except Exception as e:
        raise BadRequestError("MinIO 依赖未就绪") from e

    try:
        minio_svc = MinIOService()
    except RuntimeError as e:
        raise BadRequestError("MinIO 未初始化，请检查 MINIO_* 配置并确保对象存储已启动") from e

    file_path = await minio_svc.upload_bytes(
        file_bytes,
        "admin",
        str(admin.id),
        ext=ext,
        content_type=file.content_type or "application/octet-stream",
    )
    public_url = minio_svc.get_public_url(file_path)
    return success(
        data={
            "file_path": file_path,
            "url": public_url,
            "content_type": file.content_type,
            "filename": name,
        }
    )
