from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, UploadFile
from pydantic import BaseModel, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import NotFoundError
from app.core.time import UtcModel
from app.models.audio import Audio
from app.models.user import User
from app.schemas.common import PaginatedData, success
from app.services.minio_service import MinIOService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/audios", tags=["音频管理"])

_ALLOWED_EXTS = {"mp3", "wav", "ogg", "flac", "m4a", "aac", "wma", "opus", "webm"}


class AudioResponse(UtcModel):
    id: str
    user_id: str
    title: str | None = None
    file_name: str | None = None
    file_path: str
    file_size: int | None = None
    mime_type: str | None = None
    duration: int | None = None
    language: str | None = None
    transcript: str | None = None
    segments: Any = None
    source: str
    category: str | None = None
    status: str
    error_message: str | None = None
    document_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _transform_paths(self) -> AudioResponse:
        from app.services.minio_service import path_to_url
        self.file_path = path_to_url(self.file_path) or self.file_path
        return self


@router.get("")
async def list_audios(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filters = [Audio.user_id == current_user.id]
    total = (await db.execute(select(func.count()).select_from(Audio).where(*filters))).scalar() or 0
    q = (
        select(Audio)
        .where(*filters)
        .order_by(Audio.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = list((await db.execute(q)).scalars().all())
    data = [AudioResponse.model_validate(i).model_dump() for i in items]
    return success(data=PaginatedData.create(items=data, total=total, page=page, page_size=page_size).model_dump())


@router.post("/upload")
async def upload_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str | None = Form(None),
    category: str | None = Form(None),
    language: str | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file_bytes = await file.read()
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "mp3"

    minio_svc = MinIOService()
    file_path = await minio_svc.upload_bytes(
        file_bytes, "audios", current_user.id,
        ext=ext,
        content_type=file.content_type or "audio/mpeg",
    )

    audio = Audio(
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
    db.add(audio)
    await db.flush()
    await db.refresh(audio)
    await db.commit()

    from app.services.audio_service import process_audio
    background_tasks.add_task(process_audio, audio.id, current_user.id, file_bytes, file.filename or "audio")
    logger.info("音频上传成功 [ID=%s, 文件=%s]，Whisper 转录任务已提交后台", audio.id, file.filename)

    return success(data=AudioResponse.model_validate(audio).model_dump())


@router.get("/{id}")
async def get_audio(id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    audio = await _get(id, current_user.id, db)
    return success(data=AudioResponse.model_validate(audio).model_dump())


@router.delete("/{id}")
async def delete_audio(id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    audio = await _get(id, current_user.id, db)

    # 同步删除关联的转录文档（chunks → Milvus/ES → Document记录）
    if audio.document_id:
        try:
            from app.models.document import Document
            from app.models.document_chunk import DocumentChunk
            result = await db.execute(select(Document).where(Document.id == audio.document_id))
            doc = result.scalar_one_or_none()
            if doc:
                chunks = list((await db.execute(
                    select(DocumentChunk).where(DocumentChunk.document_id == doc.id)
                )).scalars().all())
                milvus_ids = [c.milvus_id for c in chunks if c.milvus_id]
                if milvus_ids:
                    from app.services.embedding_service import delete_text_embeddings
                    await delete_text_embeddings(milvus_ids)
                es_ids = [c.es_id for c in chunks if c.es_id]
                if es_ids:
                    from app.core.elasticsearch import KNOWLEDGE_INDEX, get_elasticsearch
                    es = get_elasticsearch()
                    for es_id in es_ids:
                        try:
                            await es.delete(index=KNOWLEDGE_INDEX, id=es_id)
                        except Exception:
                            pass
                for chunk in chunks:
                    await db.delete(chunk)
                try:
                    minio_svc_doc = MinIOService()
                    await minio_svc_doc.delete_file(doc.file_path)
                except Exception:
                    pass
                await db.delete(doc)
        except Exception as exc:
            logger.warning("删除音频转录文档失败 [audio_id=%s]: %s", id, exc)

    try:
        minio_svc = MinIOService()
        await minio_svc.delete_file(audio.file_path)
    except Exception:
        pass

    await db.delete(audio)
    # 显式 commit 后再返回，否则前端收到响应后立刻发起的列表 GET 会走另一条连接读到未提交的旧数据
    await db.commit()
    return success(message="已删除")


async def _get(id: str, user_id: str, db: AsyncSession) -> Audio:
    result = await db.execute(select(Audio).where(Audio.id == id, Audio.user_id == user_id))
    audio = result.scalar_one_or_none()
    if audio is None:
        raise NotFoundError("音频不存在")
    return audio
