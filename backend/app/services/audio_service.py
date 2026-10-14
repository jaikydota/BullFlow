"""音频后台处理：Whisper 转录 → 存入 audios 表 → 创建 Document → RAG Pipeline。"""
from __future__ import annotations

import logging
import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def process_audio(audio_id: str, user_id: str, file_bytes: bytes, file_name: str) -> None:
    """后台任务入口：完整处理一个音频文件。"""
    from app.core.database import async_session_factory
    from app.models.audio import Audio
    from app.services.whisper_service import transcribe

    logger.info("音频处理开始 [ID=%s, 文件=%s, 大小=%.1f MB]",
                audio_id, file_name, len(file_bytes) / 1024 / 1024)
    t0 = time.perf_counter()

    async with async_session_factory() as session:
        result = await session.execute(select(Audio).where(Audio.id == audio_id))
        audio = result.scalar_one_or_none()
        if not audio:
            return

        try:
            audio.status = "processing"
            await session.flush()

            # ── 1. Whisper 转录 ────────────────────────────────────────
            whisper_result = await transcribe(file_bytes, file_name)

            audio.transcript = whisper_result.get("text", "").strip()
            audio.language = whisper_result.get("language")
            raw_duration = whisper_result.get("duration")
            if raw_duration:
                audio.duration = int(float(raw_duration))

            # 保留分段信息（仅保留 start/end/text，去掉 tokens 等大字段）
            segments = [
                {"id": s.get("id"), "start": s.get("start"), "end": s.get("end"), "text": s.get("text", "")}
                for s in whisper_result.get("segments", [])
            ]
            audio.segments = segments or None

            if not audio.transcript:
                logger.warning("Whisper 转录结果为空 [ID=%s]，标记为完成但无转录文本", audio_id)
                audio.status = "completed"
                await session.commit()
                return

            # ── 2. 把转录文本送入文档 RAG Pipeline ────────────────────
            doc_id = await _create_transcript_document(
                session=session,
                audio=audio,
                transcript=audio.transcript,
                user_id=user_id,
            )
            audio.document_id = doc_id

            audio.status = "completed"
            logger.info(
                "音频处理完成 [ID=%s]: document_id=%s, 总耗时=%.2fs",
                audio_id, doc_id, time.perf_counter() - t0,
            )

        except Exception as exc:
            logger.error("音频处理失败 [ID=%s]: %s", audio_id, exc)
            audio.status = "failed"
            audio.error_message = str(exc)[:500]

        await session.commit()


async def _create_transcript_document(
    session: AsyncSession,
    audio: "Audio",  # type: ignore[name-defined]  # noqa: F821
    transcript: str,
    user_id: str,
) -> str:
    """将转录文本作为 TXT 文件上传 MinIO，并在 documents 表中建立记录，触发 RAG 管线。"""
    from app.models.document import Document
    from app.services.minio_service import MinIOService

    minio_svc = MinIOService()
    txt_bytes = transcript.encode("utf-8")
    file_path = await minio_svc.upload_bytes(
        txt_bytes, "audios/transcripts", user_id,
        ext="txt", content_type="text/plain; charset=utf-8",
    )

    doc = Document(
        user_id=user_id,
        title=f"【音频】{audio.title or audio.file_name}",
        file_name=f"{audio.file_name}.transcript.txt",
        file_type="txt",
        file_size=len(txt_bytes),
        file_path=file_path,
        status="pending",
        category=audio.category,
        source_audio_id=audio.id,
    )
    session.add(doc)
    await session.flush()
    await session.refresh(doc)
    doc_id = doc.id

    # 在同一个 session commit 前先 commit 一次确保 doc 写入，再触发 pipeline
    await session.commit()

    logger.info("转录文档已创建 [document_id=%s]，开始 RAG 管线", doc_id)
    from app.services.document_pipeline import process_document
    async with __import__("app.core.database", fromlist=["async_session_factory"]).async_session_factory() as pipeline_session:
        await process_document(doc_id, pipeline_session)
        await pipeline_session.commit()

    return doc_id
