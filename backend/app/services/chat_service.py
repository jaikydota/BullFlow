from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_message import ChatMessage
from app.models.chat_session import ChatSession


async def create_session(
    user_id: str,
    db: AsyncSession,
    *,
    title: str | None = None,
    model_provider: str | None = None,
    model_name: str | None = None,
    system_prompt: str | None = None,
) -> ChatSession:
    session = ChatSession(
        user_id=user_id,
        title=title or "新对话",
        model_provider=model_provider,
        model_name=model_name,
        system_prompt=system_prompt,
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


async def list_sessions(user_id: str, db: AsyncSession, *, page: int = 1, page_size: int = 20):
    filters = [ChatSession.user_id == user_id]
    total = (await db.execute(select(func.count()).select_from(ChatSession).where(*filters))).scalar() or 0
    q = (
        select(ChatSession)
        .where(*filters)
        .order_by(ChatSession.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = list((await db.execute(q)).scalars().all())
    return items, total


async def get_session(session_id: str, user_id: str, db: AsyncSession) -> ChatSession | None:
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def delete_session(session_id: str, user_id: str, db: AsyncSession) -> bool:
    session = await get_session(session_id, user_id, db)
    if session is None:
        return False

    # 查出该会话下所有有 TTS 音频的消息路径，删除 MinIO 文件
    tts_result = await db.execute(
        select(ChatMessage.tts_audio_url).where(
            ChatMessage.session_id == session_id,
            ChatMessage.tts_audio_url.is_not(None),
        )
    )
    tts_paths = [row[0] for row in tts_result.all() if row[0]]
    if tts_paths:
        import asyncio
        from app.services.minio_service import MinIOService
        minio = MinIOService()

        async def _delete_one(path: str) -> None:
            try:
                await minio.delete_file(path)
            except Exception:
                import logging
                logging.getLogger(__name__).warning(
                    "删除 TTS 音频失败，已忽略 [path=%s]", path
                )

        await asyncio.gather(*[_delete_one(p) for p in tts_paths])

    await db.delete(session)
    await db.flush()
    return True


async def add_message(
    session_id: str,
    user_id: str,
    role: str,
    content: str,
    db: AsyncSession,
    *,
    content_type: str = "text",
    attachments: list | None = None,
    token_count: int | None = None,
    context_chunks: list | None = None,
    generation_results: list | None = None,
    distribution_results: list | None = None,
    export_results: list | None = None,
    upload_results: list | None = None,
) -> ChatMessage:
    msg = ChatMessage(
        user_id=user_id,
        session_id=session_id,
        role=role,
        content=content,
        content_type=content_type,
        attachments=attachments,
        token_count=token_count,
        context_chunks=context_chunks,
        generation_results=generation_results,
        distribution_results=distribution_results,
        export_results=export_results,
        upload_results=upload_results,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    return msg


async def get_messages(
    session_id: str,
    user_id: str,
    db: AsyncSession,
    *,
    limit: int = 50,
) -> list[ChatMessage]:
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id, ChatMessage.user_id == user_id)
        # created_at 为秒级精度，快问快答时用户/AI 消息可能落在同一秒；
        # 以 id（UUID v7，按字节序即时间序）作次级键，保证同秒内仍按创建先后排序。
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def build_llm_messages(
    session_id: str,
    user_id: str,
    db: AsyncSession,
    *,
    system_prompt: str | None = None,
    max_history: int = 20,
) -> list[dict[str, str]]:
    """Build messages list for LLM from session history."""
    messages: list[dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    history = await get_messages(session_id, user_id, db, limit=max_history)
    for msg in history:
        if msg.role == "assistant" and not (msg.content or "").strip():
            # 不注入空 assistant 行，避免污染 LangGraph / OpenAI 消息序列
            continue
        content = msg.content
        # 将本条消息中的文章 generation_id 注入到内容末尾，
        # 让 LLM 在后续轮次中能引用该 ID 调用导出工具
        if msg.role == "assistant" and msg.generation_results:
            article_hints = [
                f"{r.get('title', '文章')}(generation_id:{r.get('generation_id', '')})"
                for r in msg.generation_results
                if r.get("type") == "article" and r.get("generation_id")
            ]
            if article_hints:
                content = (content or "") + "\n[已生成文章: " + "、".join(article_hints) + "]"
        messages.append({"role": msg.role, "content": content})
    return messages
