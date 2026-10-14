"""Content generation workflow orchestration."""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


async def run_article_workflow(
    prompt: str,
    user_id: str,
    db: AsyncSession,
    *,
    provider: str | None = None,
    model: str | None = None,
    brand_info: str | None = None,
    stream: bool = False,
    **kwargs: Any,
) -> dict[str, Any] | Any:
    """Article generation workflow entry point."""
    from app.agents.article_agent import generate_article
    return await generate_article(
        prompt=prompt,
        user_id=user_id,
        db=db,
        provider=provider,
        model=model,
        brand_info=brand_info,
        stream=stream,
        **kwargs,
    )
