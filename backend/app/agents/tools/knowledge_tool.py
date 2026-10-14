from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


async def run_knowledge_search(
    query: str,
    user_id: str,
    db: Any,
    *,
    top_k: int = 5,
    use_reranker: bool = True,
) -> list[dict[str, Any]]:
    """Directly callable async knowledge search for agent use."""
    from app.services.knowledge_service import hybrid_search
    return await hybrid_search(
        query=query,
        user_id=user_id,
        db=db,
        top_k=top_k,
        use_reranker=use_reranker,
    )
