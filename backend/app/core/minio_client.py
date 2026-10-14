from __future__ import annotations

import json
import logging

from minio import Minio

from app.core.config import settings

logger = logging.getLogger(__name__)

minio_client: Minio | None = None

# 整个 bucket 允许匿名 GetObject（只读），上传/删除仍需 AccessKey 鉴权。
# 文件路径包含 UUID，不可猜测；访问控制在 API 层保障。
# 每次后端启动时会重新应用，保证 volume 清空重建后策略依然有效。
_PUBLIC_READ_POLICY = json.dumps({
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {"AWS": ["*"]},
            "Action": ["s3:GetObject"],
            "Resource": [f"arn:aws:s3:::{settings.MINIO_BUCKET_NAME}/*"],
        }
    ],
})


def init_minio() -> Minio:
    global minio_client
    minio_client = Minio(
        endpoint=settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )
    _ensure_bucket()
    return minio_client


def _ensure_bucket() -> None:
    assert minio_client is not None
    bucket = settings.MINIO_BUCKET_NAME
    if not minio_client.bucket_exists(bucket):
        minio_client.make_bucket(bucket)
        logger.info("Created MinIO bucket: %s", bucket)
    else:
        logger.info("MinIO bucket already exists: %s", bucket)

    # 每次启动都强制刷新公开读策略，防止 volume 重建后策略丢失
    try:
        minio_client.set_bucket_policy(bucket, _PUBLIC_READ_POLICY)
        logger.info("MinIO public-read policy applied to %s/*", bucket)
    except Exception as e:
        logger.warning("Failed to set MinIO bucket policy: %s", e)


def get_minio() -> Minio:
    if minio_client is None:
        raise RuntimeError("MinIO not initialised – call init_minio() first")
    return minio_client
