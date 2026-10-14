from __future__ import annotations

import logging

from pymilvus import (
    CollectionSchema,
    DataType,
    FieldSchema,
    MilvusClient,
)

from app.core.config import settings

logger = logging.getLogger(__name__)

milvus_client: MilvusClient | None = None

TEXT_COLLECTION = "text_embeddings"
IMAGE_COLLECTION = "image_embeddings"
TEXT_EMBEDDING_DIM = 1024  # BGE-M3
IMAGE_EMBEDDING_DIM = 768  # CLIP


def init_milvus() -> MilvusClient:
    global milvus_client
    uri = f"http://{settings.MILVUS_HOST}:{settings.MILVUS_PORT}"
    milvus_client = MilvusClient(uri=uri)
    logger.info("Milvus connected at %s", uri)
    _ensure_collections()
    return milvus_client


def _ensure_collections() -> None:
    assert milvus_client is not None

    if not milvus_client.has_collection(TEXT_COLLECTION):
        schema = CollectionSchema(fields=[
            FieldSchema("id", DataType.VARCHAR, is_primary=True, max_length=36),
            FieldSchema("user_id", DataType.VARCHAR, max_length=36),
            FieldSchema("document_id", DataType.VARCHAR, max_length=36),
            FieldSchema("embedding", DataType.FLOAT_VECTOR, dim=TEXT_EMBEDDING_DIM),
        ])
        text_index = milvus_client.prepare_index_params()
        text_index.add_index(
            field_name="embedding",
            index_type="HNSW",
            metric_type="COSINE",
            params={"M": 16, "efConstruction": 256},
        )
        text_index.add_index(
            field_name="user_id",
            index_type="Trie",
        )
        milvus_client.create_collection(
            collection_name=TEXT_COLLECTION,
            schema=schema,
            index_params=text_index,
        )
        logger.info("Created Milvus collection: %s", TEXT_COLLECTION)

    if not milvus_client.has_collection(IMAGE_COLLECTION):
        schema = CollectionSchema(fields=[
            FieldSchema("id", DataType.VARCHAR, is_primary=True, max_length=36),
            FieldSchema("user_id", DataType.VARCHAR, max_length=36),
            FieldSchema("embedding", DataType.FLOAT_VECTOR, dim=IMAGE_EMBEDDING_DIM),
        ])
        img_index = milvus_client.prepare_index_params()
        img_index.add_index(
            field_name="embedding",
            index_type="HNSW",
            metric_type="COSINE",
            params={"M": 16, "efConstruction": 256},
        )
        img_index.add_index(
            field_name="user_id",
            index_type="Trie",
        )
        milvus_client.create_collection(
            collection_name=IMAGE_COLLECTION,
            schema=schema,
            index_params=img_index,
        )
        logger.info("Created Milvus collection: %s", IMAGE_COLLECTION)


def get_milvus() -> MilvusClient:
    if milvus_client is None:
        raise RuntimeError("Milvus not initialised – call init_milvus() first")
    return milvus_client


def close_milvus() -> None:
    global milvus_client
    if milvus_client is not None:
        milvus_client.close()
        milvus_client = None
