from __future__ import annotations

import io
import uuid
from datetime import datetime, timedelta

import httpx
from fastapi import UploadFile

from app.core.config import settings
from app.core.minio_client import get_minio


def url_to_path(url: str | None) -> str | None:
    """将 MinIO 公开 URL 转换为对象路径（object name）。
    若已是路径则原样返回（兼容新旧数据）。
    示例：http://localhost:9000/knowledge/uid/profile/2026-04/uuid.png
          → uid/profile/2026-04/uuid.png
    """
    if not url:
        return url
    prefix = f"{settings.MINIO_PUBLIC_URL.rstrip('/')}/{settings.MINIO_BUCKET_NAME}/"
    if url.startswith(prefix):
        return url[len(prefix):]
    # 兼容 http/https 协议头不同的情况（如代理改写协议）
    for scheme in ("http://", "https://"):
        if url.startswith(scheme):
            # 跳过协议+域名+bucket，取第4段斜线之后的部分
            rest = url[len(scheme):]  # localhost:9000/knowledge/...
            parts = rest.split("/", 2)  # ['localhost:9000', 'knowledge', 'uid/...']
            if len(parts) == 3:
                return parts[2]
    return url  # 已经是路径，直接返回


def path_to_url(path: str | None) -> str | None:
    """将 MinIO 对象路径转换为可公开访问的完整 URL。
    若已是完整 URL（http/https 开头）则原样返回。
    示例：uid/profile/2026-04/uuid.png
          → http://localhost:9000/knowledge/uid/profile/2026-04/uuid.png
    """
    if not path:
        return None
    if path.startswith(("http://", "https://")):
        return path  # 已经是完整 URL
    base = settings.MINIO_PUBLIC_URL.rstrip("/")
    bucket = settings.MINIO_BUCKET_NAME
    return f"{base}/{bucket}/{path}"


class MinIOService:
    def __init__(self):
        self.client = get_minio()
        self.bucket = settings.MINIO_BUCKET_NAME

    async def upload_file(self, file: UploadFile, folder: str, user_id: str) -> str:
        """Upload a file and return the object path."""
        ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
        date_prefix = datetime.now().strftime("%Y-%m")
        object_name = f"{user_id}/{folder}/{date_prefix}/{uuid.uuid4()}.{ext}"

        content = await file.read()
        self.client.put_object(
            self.bucket,
            object_name,
            io.BytesIO(content),
            length=len(content),
            content_type=file.content_type or "application/octet-stream",
        )
        return object_name

    async def upload_bytes(self, data: bytes, folder: str, user_id: str, ext: str, content_type: str = "application/octet-stream") -> str:
        date_prefix = datetime.now().strftime("%Y-%m")
        object_name = f"{user_id}/{folder}/{date_prefix}/{uuid.uuid4()}.{ext}"
        self.client.put_object(
            self.bucket,
            object_name,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )
        return object_name

    async def download_and_store(self, url: str, folder: str, user_id: str) -> str:
        """Download a file from URL and store it in MinIO."""
        content, content_type = await self.fetch_bytes(url)
        ext = _guess_ext(url, content_type)
        return await self.upload_bytes(content, folder, user_id, ext, content_type)

    @staticmethod
    async def fetch_bytes(url: str, *, timeout: int = 120) -> tuple[bytes, str]:
        """从任意 http(s) URL 下载二进制内容，返回 (bytes, content_type)。

        用于需要把远程图片 / 文件读到内存里处理的场景（如 Azure gpt-image-2 edits 端点
        需要 multipart 上传参考图 bytes，不能直接传 URL）。
        """
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        return resp.content, resp.headers.get("content-type", "application/octet-stream")

    def get_public_url(self, object_name: str) -> str:
        """返回永久可访问的公开 URL（仅适用于已配置公开读策略的路径，如 profile/）。"""
        base = settings.MINIO_PUBLIC_URL.rstrip("/")
        return f"{base}/{self.bucket}/{object_name}"

    async def get_presigned_url(self, object_name: str, expires: int = 3600) -> str:
        """生成带签名的临时访问 URL。
        
        ⚠️ 注意：生成的 URL host 来自 MINIO_ENDPOINT（内网地址），而非 MINIO_PUBLIC_URL。
        若 bucket 已配置 public-read 策略，应直接使用 path_to_url() 或 get_public_url()，
        返回基于 MINIO_PUBLIC_URL 的永久公开链接，避免内外网地址混用问题。
        本方法仅适用于需要临时授权访问私有对象的场景。
        """
        url = self.client.presigned_get_object(
            self.bucket, object_name, expires=timedelta(seconds=expires)
        )
        return url

    async def delete_file(self, object_name: str) -> None:
        """异步删除 MinIO 对象（在线程池中执行，不阻塞事件循环）。"""
        import asyncio
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, self.client.remove_object, self.bucket, object_name
        )

    async def get_object_bytes(self, object_name: str) -> bytes:
        """读取对象完整内容（线程池），object_name 为桶内路径。"""
        import asyncio

        def _read() -> bytes:
            obj = self.client.get_object(self.bucket, object_name)
            try:
                return obj.read()
            finally:
                obj.close()
                obj.release_conn()

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _read)


def _guess_ext(url: str, content_type: str) -> str:
    ct_map = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
        "video/mp4": "mp4",
        "video/webm": "webm",
        "application/pdf": "pdf",
    }
    if content_type in ct_map:
        return ct_map[content_type]
    path = url.split("?")[0]
    if "." in path:
        return path.rsplit(".", 1)[-1][:10]
    return "bin"
