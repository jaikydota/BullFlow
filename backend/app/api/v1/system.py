from __future__ import annotations

from fastapi import APIRouter

from app.core.config import settings
from app.schemas.common import success

router = APIRouter(prefix="/system", tags=["系统"])


@router.get("/health")
async def health_check():
    """Health check – returns connectivity status for all services."""
    checks: dict[str, str] = {}

    # MySQL
    try:
        from app.core.database import engine
        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        checks["mysql"] = "ok"
    except Exception as e:
        checks["mysql"] = f"error: {e}"

    # Redis
    try:
        from app.core.redis import get_redis
        r = get_redis()
        await r.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"

    # Milvus
    try:
        from app.core.milvus import get_milvus
        mc = get_milvus()
        mc.list_collections()
        checks["milvus"] = "ok"
    except Exception as e:
        checks["milvus"] = f"error: {e}"

    # MinIO
    try:
        from app.core.minio_client import get_minio
        mc = get_minio()
        mc.bucket_exists(settings.MINIO_BUCKET_NAME)
        checks["minio"] = "ok"
    except Exception as e:
        checks["minio"] = f"error: {e}"

    # Elasticsearch
    try:
        from app.core.elasticsearch import get_elasticsearch
        es = get_elasticsearch()
        await es.ping()
        checks["elasticsearch"] = "ok"
    except Exception as e:
        checks["elasticsearch"] = f"error: {e}"

    all_ok = all(v == "ok" for v in checks.values())
    return success(data={"status": "healthy" if all_ok else "degraded", "services": checks})


@router.get("/info")
async def system_info():
    """Return basic system meta-data."""
    return success(data={
        "app_name": "推量牛",
        "version": "0.1.0",
    })
