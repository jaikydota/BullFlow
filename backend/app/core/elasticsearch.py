from __future__ import annotations

import logging

from elasticsearch import AsyncElasticsearch

from app.core.config import settings

logger = logging.getLogger(__name__)

es_client: AsyncElasticsearch | None = None

KNOWLEDGE_INDEX = "knowledge_chunks"

KNOWLEDGE_INDEX_SETTINGS = {
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 0,
        "analysis": {
            "analyzer": {
                "ik_index_analyzer": {
                    "type": "custom",
                    "tokenizer": "ik_max_word",
                    "filter": ["lowercase", "ik_synonym"],
                },
                "ik_search_analyzer": {
                    "type": "custom",
                    "tokenizer": "ik_smart",
                    "filter": ["lowercase", "ik_synonym"],
                },
            },
            "filter": {
                "ik_synonym": {
                    "type": "synonym",
                    "synonyms": [],
                    "lenient": True,
                },
            },
        },
    },
    "mappings": {
        "properties": {
            "chunk_id": {"type": "keyword"},
            "user_id": {"type": "keyword"},
            "document_id": {"type": "keyword"},
            "content": {
                "type": "text",
                "analyzer": "ik_index_analyzer",
                "search_analyzer": "ik_search_analyzer",
            },
            "title": {
                "type": "text",
                "analyzer": "ik_index_analyzer",
                "search_analyzer": "ik_search_analyzer",
                "fields": {"keyword": {"type": "keyword", "ignore_above": 256}},
            },
            "heading_context": {
                "type": "text",
                "analyzer": "ik_index_analyzer",
                "search_analyzer": "ik_search_analyzer",
                "fields": {"keyword": {"type": "keyword", "ignore_above": 500}},
            },
            "category": {"type": "keyword"},
            "tags": {"type": "keyword"},
            "chunk_index": {"type": "integer"},
            "token_count": {"type": "integer"},
            "created_at": {"type": "date"},
        },
    },
}


async def init_elasticsearch() -> AsyncElasticsearch:
    global es_client
    es_client = AsyncElasticsearch(
        hosts=[settings.ES_URL],
        basic_auth=(settings.ES_USER, settings.ES_PASSWORD) if settings.ES_PASSWORD else None,
        request_timeout=30,
        max_retries=3,
        retry_on_timeout=True,
    )
    await _ensure_index()
    logger.info("Elasticsearch connected at %s", settings.ES_URL)
    return es_client


async def _ensure_index() -> None:
    assert es_client is not None
    if not await es_client.indices.exists(index=KNOWLEDGE_INDEX):
        await es_client.indices.create(
            index=KNOWLEDGE_INDEX,
            settings=KNOWLEDGE_INDEX_SETTINGS["settings"],
            mappings=KNOWLEDGE_INDEX_SETTINGS["mappings"],
        )
        logger.info("Created ES index: %s", KNOWLEDGE_INDEX)


async def close_elasticsearch() -> None:
    global es_client
    if es_client is not None:
        await es_client.close()
        es_client = None


def get_elasticsearch() -> AsyncElasticsearch:
    if es_client is None:
        raise RuntimeError("Elasticsearch not initialised – call init_elasticsearch() first")
    return es_client
