from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Query, UploadFile, File, Form
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.user import User
from app.schemas.common import PaginatedData, success
from app.schemas.document import ChunkResponse, DocumentResponse, DocumentUpdate
from app.services.minio_service import MinIOService, path_to_url
from app.core.exceptions import NotFoundError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["文档管理"])


async def _run_pipeline(document_id: str):
    """Run the document processing pipeline in the background."""
    from app.core.database import async_session_factory
    from app.services.document_pipeline import process_document
    async with async_session_factory() as session:
        await process_document(document_id, session)
        await session.commit()


@router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str | None = Form(None),
    category: str | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file_name = file.filename or "untitled"
    file_type = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "txt"

    minio_svc = MinIOService()
    file_path = await minio_svc.upload_file(file, "documents", current_user.id)

    doc = Document(
        user_id=current_user.id,
        title=title or file_name,
        file_name=file_name,
        file_type=file_type,
        file_size=file.size,
        file_path=file_path,
        status="pending",
        category=category,
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)
    await db.commit()

    background_tasks.add_task(_run_pipeline, doc.id)

    return success(data=DocumentResponse.model_validate(doc).model_dump())


@router.get("")
async def list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    status: str | None = Query(None),
    file_type: str | None = Query(None),
    q: str | None = Query(None, description="Filter by title or file name (contains)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filters = [Document.user_id == current_user.id, Document.source_audio_id.is_(None)]
    if status:
        filters.append(Document.status == status)
    if file_type:
        filters.append(Document.file_type == file_type)
    if q and q.strip():
        term = f"%{q.strip()}%"
        filters.append(or_(Document.title.ilike(term), Document.file_name.ilike(term)))

    total = (await db.execute(select(func.count()).select_from(Document).where(*filters))).scalar() or 0
    q = select(Document).where(*filters).order_by(Document.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list((await db.execute(q)).scalars().all())
    data = [DocumentResponse.model_validate(i).model_dump() for i in items]
    return success(data=PaginatedData.create(items=data, total=total, page=page, page_size=page_size).model_dump())


@router.get("/{id}")
async def get_document(id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    doc = await _get_doc(id, current_user.id, db)
    return success(data=DocumentResponse.model_validate(doc).model_dump())


@router.get("/{id}/chunks")
async def get_chunks(
    id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_doc(id, current_user.id, db)

    filters = [DocumentChunk.document_id == id, DocumentChunk.user_id == current_user.id]
    total = (await db.execute(select(func.count()).select_from(DocumentChunk).where(*filters))).scalar() or 0
    q = select(DocumentChunk).where(*filters).order_by(DocumentChunk.chunk_index).offset((page - 1) * page_size).limit(page_size)
    items = list((await db.execute(q)).scalars().all())
    data = [ChunkResponse.model_validate(i).model_dump() for i in items]
    return success(data=PaginatedData.create(items=data, total=total, page=page, page_size=page_size).model_dump())


@router.get("/{id}/download")
async def download_document(id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    doc = await _get_doc(id, current_user.id, db)
    url = path_to_url(doc.file_path)
    return success(data={"url": url})


@router.put("/{id}")
async def update_document(id: str, body: DocumentUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    doc = await _get_doc(id, current_user.id, db)
    if body.title is not None:
        doc.title = body.title
    if body.category is not None:
        doc.category = body.category
    if body.tags is not None:
        doc.tags = body.tags
    await db.flush()
    await db.commit()  # 返回前提交，否则前端随后刷新文档列表/详情读到旧数据
    await db.refresh(doc)
    return success(data=DocumentResponse.model_validate(doc).model_dump())


@router.delete("/{id}")
async def delete_document(id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    doc = await _get_doc(id, current_user.id, db)

    # Delete chunks from Milvus + ES
    chunks_q = select(DocumentChunk).where(DocumentChunk.document_id == id)
    chunks = list((await db.execute(chunks_q)).scalars().all())

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

    # Delete file from MinIO
    try:
        minio_svc = MinIOService()
        await minio_svc.delete_file(doc.file_path)
    except Exception as e:
        logger.warning("Failed to delete MinIO file %s: %s", doc.file_path, e)

    await db.delete(doc)
    await db.commit()
    return success(message="已删除")


@router.post("/{id}/reprocess")
async def reprocess_document(id: str, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    doc = await _get_doc(id, current_user.id, db)
    doc.status = "pending"
    doc.error_message = None
    await db.commit()
    background_tasks.add_task(_run_pipeline, doc.id)
    return success(message="已提交重新处理")


async def _get_doc(id: str, user_id: str, db: AsyncSession) -> Document:
    result = await db.execute(select(Document).where(Document.id == id, Document.user_id == user_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise NotFoundError("文档不存在")
    return doc
