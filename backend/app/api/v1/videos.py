from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Query, UploadFile, File, Form
from pydantic import BaseModel, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import NotFoundError
from app.core.time import UtcModel
from app.models.user import User
from app.models.video import Video
from app.schemas.common import PaginatedData, success
from app.services.minio_service import MinIOService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/videos", tags=["视频管理"])


class VideoResponse(UtcModel):
    id: str
    user_id: str
    title: str | None = None
    file_name: str | None = None
    file_path: str
    cover_path: str | None = None
    file_size: int | None = None
    duration: int | None = None
    resolution: str | None = None
    mime_type: str | None = None
    source: str
    category: str | None = None
    tags: Any = None
    status: str = "completed"
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _transform_paths(self) -> VideoResponse:
        from app.services.minio_service import path_to_url
        self.file_path = path_to_url(self.file_path) or self.file_path
        self.cover_path = path_to_url(self.cover_path)
        return self


@router.get("")
async def list_videos(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filters = [Video.user_id == current_user.id]
    total = (await db.execute(select(func.count()).select_from(Video).where(*filters))).scalar() or 0
    q = select(Video).where(*filters).order_by(Video.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list((await db.execute(q)).scalars().all())
    data = [VideoResponse.model_validate(i).model_dump() for i in items]
    return success(data=PaginatedData.create(items=data, total=total, page=page, page_size=page_size).model_dump())


@router.post("/upload")
async def upload_video(
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
        file_bytes, "videos", current_user.id,
        ext=file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "mp4",
        content_type=file.content_type or "video/mp4",
    )

    vid = Video(
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
    db.add(vid)
    await db.flush()
    await db.refresh(vid)
    await db.commit()

    # 后台：ffprobe 元数据 + ffmpeg 缩略图
    from app.services.video_service import process_video
    background_tasks.add_task(process_video, vid.id, current_user.id, file_bytes)
    logger.info("视频上传成功 [ID=%s, 文件=%s]，后台处理任务已提交", vid.id, file.filename)

    return success(data=VideoResponse.model_validate(vid).model_dump())


@router.get("/{id}")
async def get_video(id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    vid = await _get(id, current_user.id, db)
    return success(data=VideoResponse.model_validate(vid).model_dump())


@router.delete("/{id}")
async def delete_video(id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    vid = await _get(id, current_user.id, db)
    try:
        minio_svc = MinIOService()
        await minio_svc.delete_file(vid.file_path)
    except Exception:
        pass
    await db.delete(vid)
    # 显式 commit 后再返回，否则前端收到响应后立刻发起的列表 GET 会走另一条连接读到未提交的旧数据
    await db.commit()
    return success(message="已删除")


async def _get(id: str, user_id: str, db: AsyncSession) -> Video:
    result = await db.execute(select(Video).where(Video.id == id, Video.user_id == user_id))
    vid = result.scalar_one_or_none()
    if vid is None:
        raise NotFoundError("视频不存在")
    return vid
