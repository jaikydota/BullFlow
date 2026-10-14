from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.common import success
from app.schemas.knowledge import (
    ImageSearchRequest,
    KnowledgeSearchRequest,
    TextSearchRequest,
    VectorSearchRequest,
)
from app.services import knowledge_service

router = APIRouter(prefix="/knowledge", tags=["知识检索"])


@router.post("/search")
async def hybrid_search(
    body: KnowledgeSearchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """混合检索：向量 + 全文 + 重排序"""
    results = await knowledge_service.hybrid_search(
        query=body.query,
        user_id=current_user.id,
        db=db,
        top_k=body.top_k,
        document_ids=body.filters.document_ids if body.filters else None,
        category=body.filters.category if body.filters else None,
        use_reranker=body.use_reranker,
    )
    return success(data={"results": results, "total": len(results)})


@router.post("/search/text")
async def text_search(
    body: TextSearchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """仅全文检索"""
    results = await knowledge_service.fulltext_search(
        query=body.query,
        user_id=current_user.id,
        db=db,
        top_k=body.top_k,
        document_ids=body.document_ids,
        category=body.category,
    )
    return success(data={"results": results, "total": len(results)})


@router.post("/search/vector")
async def vec_search(
    body: VectorSearchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """仅向量检索"""
    results = await knowledge_service.vector_search(
        query=body.query,
        user_id=current_user.id,
        db=db,
        top_k=body.top_k,
        document_ids=body.document_ids,
    )
    return success(data={"results": results, "total": len(results)})


@router.post("/search/image")
async def img_search(
    body: ImageSearchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """图片语义检索"""
    results = await knowledge_service.image_search(
        query=body.query,
        user_id=current_user.id,
        db=db,
        top_k=body.top_k,
    )
    return success(data={"results": results, "total": len(results)})
