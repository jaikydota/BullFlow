from __future__ import annotations

from pydantic import BaseModel, Field


class SearchFilters(BaseModel):
    category: str | None = None
    document_ids: list[str] | None = None


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="搜索关键词")
    top_k: int = Field(10, ge=1, le=100, description="返回条数")
    filters: SearchFilters | None = None
    use_reranker: bool = Field(True, description="是否使用 Reranker 重排序")


class TextSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(10, ge=1, le=100)
    document_ids: list[str] | None = None
    category: str | None = None


class VectorSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(10, ge=1, le=100)
    document_ids: list[str] | None = None


class ImageSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(20, ge=1, le=100)
