from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, UploadFile
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import NotFoundError
from app.core.time import UtcModel
from app.models.image import Image
from app.models.user import User
from app.schemas.common import PaginatedData, success
from app.services.minio_service import MinIOService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/images", tags=["图片管理"])


class ImageResponse(UtcModel):
    id: str
    user_id: str
    title: str | None = None
    file_name: str | None = None
    file_path: str
    thumbnail_path: str | None = None
    file_size: int | None = None
    width: int | None = None
    height: int | None = None
    mime_type: str | None = None
    source: str
    category: str | None = None
    tags: Any = None
    milvus_id: str | None = None
    status: str = "completed"
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _transform_paths(self) -> ImageResponse:
        from app.services.minio_service import path_to_url
        self.file_path = path_to_url(self.file_path) or self.file_path
        self.thumbnail_path = path_to_url(self.thumbnail_path)
        return self


class ImageSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(20, ge=1, le=100)


async def _process_image_bg(image_id: str, user_id: str, file_bytes: bytes) -> None:
    """后台任务：ffprobe 宽高 + ffmpeg 缩略图 + CLIP 向量化，全流程写库。"""
    from app.services.video_service import process_image
    await process_image(image_id, user_id, file_bytes)


@router.get("")
async def list_images(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    source: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filters = [Image.user_id == current_user.id]
    if source:
        filters.append(Image.source == source)
    total = (await db.execute(select(func.count()).select_from(Image).where(*filters))).scalar() or 0
    q = select(Image).where(*filters).order_by(Image.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list((await db.execute(q)).scalars().all())
    data = [ImageResponse.model_validate(i).model_dump() for i in items]
    return success(data=PaginatedData.create(items=data, total=total, page=page, page_size=page_size).model_dump())


@router.post("/upload")
async def upload_image(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str | None = Form(None),
    category: str | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file_bytes = await file.read()

    minio_svc = MinIOService()
    file_path = await minio_svc.upload_bytes(
        file_bytes, "images", current_user.id,
        ext=file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "png",
        content_type=file.content_type or "image/png",
    )

    img = Image(
        user_id=current_user.id,
        title=title or file.filename,
        file_name=file.filename,
        file_path=file_path,
        file_size=len(file_bytes),
        mime_type=file.content_type,
        source="upload",
        category=category,
        status="pending",
    )
    db.add(img)
    await db.flush()
    await db.refresh(img)
    await db.commit()

    # 后台：ffprobe 宽高 + ffmpeg 缩略图 + CLIP 向量化
    background_tasks.add_task(_process_image_bg, img.id, current_user.id, file_bytes)
    logger.info("图片上传成功 [ID=%s, 文件=%s]，处理任务已提交后台", img.id, file.filename)

    return success(data=ImageResponse.model_validate(img).model_dump())


@router.get("/{id}")
async def get_image(id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    img = await _get(id, current_user.id, db)
    return success(data=ImageResponse.model_validate(img).model_dump())


@router.delete("/{id}")
async def delete_image(id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    img = await _get(id, current_user.id, db)
    if img.milvus_id:
        try:
            from app.services.clip_service import delete_image_embedding
            await delete_image_embedding(img.milvus_id)
        except Exception:
            pass
    try:
        minio_svc = MinIOService()
        await minio_svc.delete_file(img.file_path)
    except Exception:
        pass
    await db.delete(img)
    # 必须显式 commit 后再返回：get_db 的提交在依赖收尾(响应已发送后)才执行，
    # 仅 flush 会导致前端收到「已删除」后立刻发起的列表 GET 走另一条连接读到未提交的旧数据。
    await db.commit()
    return success(message="已删除")


@router.post("/search")
async def search_images(
    body: ImageSearchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """混合检索：标题 ILIKE 优先（高分置顶），再合并 CLIP 语义检索结果（去重）。"""
    from app.services.clip_service import encode_text_for_image_search, search_image_embeddings

    q = body.query.strip()
    logger.info("图片混合检索: query=%r, top_k=%d, user=%s", q[:80], body.top_k, current_user.id)

    # ① 标题 ILIKE（精确字串命中给最高分置顶）
    title_rows: list[Image] = []
    if q:
        # 转义 LIKE 元字符，避免用户输入 % / _ 时把通配语义带入
        like_pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        title_result = await db.execute(
            select(Image)
            .where(
                Image.user_id == current_user.id,
                Image.title.ilike(like_pattern, escape="\\"),
            )
            .order_by(Image.created_at.desc())
            .limit(body.top_k)
        )
        title_rows = list(title_result.scalars().all())

    # ② CLIP 语义检索
    try:
        query_vec = await encode_text_for_image_search(q)
        vec_hits = await search_image_embeddings(query_vec, current_user.id, top_k=body.top_k)
    except Exception as e:
        # 语义检索失败不阻塞标题命中结果
        logger.warning("图片语义检索失败，仅返回标题命中: %s", e)
        vec_hits = []

    results: list[dict] = []
    seen: set[str] = set()

    # 标题命中：score=1.0 置顶
    for img in title_rows:
        d = ImageResponse.model_validate(img).model_dump()
        d["score"] = 1.0
        d["match_source"] = "title"
        results.append(d)
        seen.add(img.id)

    # 向量命中：按 CLIP score 排序加入（去重已在 seen 中的标题命中）
    vec_ids = [h["id"] for h in vec_hits if h["id"] not in seen]
    if vec_ids:
        vec_result = await db.execute(select(Image).where(Image.id.in_(vec_ids)))
        images_map = {img.id: img for img in vec_result.scalars().all()}
        for h in vec_hits:
            if h["id"] in seen:
                continue
            img = images_map.get(h["id"])
            if img:
                d = ImageResponse.model_validate(img).model_dump()
                d["score"] = h["score"]
                d["match_source"] = "semantic"
                results.append(d)
                seen.add(h["id"])

    logger.info(
        "图片混合检索完成: title=%d semantic=%d total=%d",
        len(title_rows), max(0, len(results) - len(title_rows)), len(results),
    )
    return success(data={"results": results, "total": len(results)})


async def _get(id: str, user_id: str, db: AsyncSession) -> Image:
    result = await db.execute(select(Image).where(Image.id == id, Image.user_id == user_id))
    img = result.scalar_one_or_none()
    if img is None:
        raise NotFoundError("图片不存在")
    return img
