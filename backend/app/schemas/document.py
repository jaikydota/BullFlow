from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.core.time import UtcModel


class DocumentResponse(UtcModel):
    id: str
    user_id: str
    title: str
    file_name: str
    file_type: str
    file_size: int | None = None
    file_path: str
    status: str
    chunk_count: int
    error_message: str | None = None
    category: str | None = None
    tags: Any = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _transform_paths(self) -> DocumentResponse:
        from app.services.minio_service import path_to_url
        self.file_path = path_to_url(self.file_path) or self.file_path
        return self


class DocumentUpdate(BaseModel):
    title: str | None = Field(None, max_length=500)
    category: str | None = Field(None, max_length=100)
    tags: list[str] | None = None


class ChunkResponse(UtcModel):
    id: str
    document_id: str
    chunk_index: int
    content: str
    token_count: int | None = None
    metadata_: Any = Field(None, alias="metadata_")
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class TaskResponse(UtcModel):
    id: str
    user_id: str
    type: str
    status: str
    progress: int
    input_params: Any = None
    result: Any = None
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
