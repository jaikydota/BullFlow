from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import BadRequestError, NotFoundError
from app.models.user import User
from app.agents.workflows.chat_workflow import run_chat_workflow
from app.schemas.chat import ChatRequest, CreateSessionRequest, MessageResponse, SessionResponse
from app.schemas.common import PaginatedData, success
from app.services import chat_service
from app.services.llm_service import llm_service

router = APIRouter(prefix="/chat", tags=["AI 对话"])


@router.get("/models")
async def list_models(current_user: User = Depends(get_current_user)):
    """获取可用 LLM 模型列表"""
    models = llm_service.list_models()
    return success(data=models)


@router.post("/sessions")
async def create_session(
    body: CreateSessionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await chat_service.create_session(
        user_id=current_user.id,
        db=db,
        title=body.title,
        model_provider=body.model_provider,
        model_name=body.model_name,
        system_prompt=body.system_prompt,
    )
    await db.commit()  # service 仅 flush，必须在返回前 commit，否则前端随后拉列表读到旧数据
    return success(data=SessionResponse.model_validate(session).model_dump(mode="json"))


@router.get("/sessions")
async def list_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items, total = await chat_service.list_sessions(current_user.id, db, page=page, page_size=page_size)
    data = [SessionResponse.model_validate(s).model_dump(mode="json") for s in items]
    return success(data=PaginatedData.create(items=data, total=total, page=page, page_size=page_size).model_dump())


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await chat_service.get_session(session_id, current_user.id, db)
    if not session:
        raise NotFoundError("会话不存在")
    return success(data=SessionResponse.model_validate(session).model_dump(mode="json"))


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ok = await chat_service.delete_session(session_id, current_user.id, db)
    if not ok:
        raise NotFoundError("会话不存在")
    await db.commit()  # service 仅 flush，必须在返回前 commit，否则前端随后拉列表读到旧数据
    return success(message="已删除")


@router.get("/sessions/{session_id}/messages")
async def get_messages(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await chat_service.get_session(session_id, current_user.id, db)
    if not session:
        raise NotFoundError("会话不存在")
    msgs = await chat_service.get_messages(session_id, current_user.id, db)
    from app.services.minio_service import path_to_url
    rows = []
    for m in msgs:
        d = MessageResponse.model_validate(m).model_dump(mode="json")
        if d.get("tts_audio_url"):
            d["tts_audio_url"] = path_to_url(d["tts_audio_url"])
        # 将 generation_results.preview_info 中存储的 MinIO 路径统一转为公网 URL
        for r in (d.get("generation_results") or []):
            pi = r.get("preview_info") or {}
            if pi.get("file_url") and not pi["file_url"].startswith("http"):
                pi["file_url"] = path_to_url(pi["file_url"])
            if pi.get("thumbnail_url") and not pi["thumbnail_url"].startswith("http"):
                pi["thumbnail_url"] = path_to_url(pi["thumbnail_url"])
            if pi.get("media_urls"):
                pi["media_urls"] = [
                    path_to_url(p) if isinstance(p, str) and not p.startswith("http") else p
                    for p in pi["media_urls"]
                ]
        # 将 upload_results 中存储的 MinIO 路径统一转为公网 URL
        for r in (d.get("upload_results") or []):
            if r.get("file_url") and not r["file_url"].startswith("http"):
                r["file_url"] = path_to_url(r["file_url"])
            if r.get("thumbnail_url") and not r["thumbnail_url"].startswith("http"):
                r["thumbnail_url"] = path_to_url(r["thumbnail_url"])
        rows.append(d)

    # 修正进行中的生成/上传状态（批量查库，写回 DB，避免前端闪旧状态）
    await _refresh_in_progress_statuses(rows, msgs, db)

    return success(data=rows)


async def _refresh_in_progress_statuses(
    rows: list[dict],
    msgs: list,
    db: AsyncSession,
) -> None:
    """批量查询并修正 generation_results / upload_results 中的进行中状态。
    同时将修正后的值写回数据库，后续直接读取即为最新状态。
    """
    from sqlalchemy import select, update as sql_update
    from app.models.generated_content import GeneratedContent
    from app.models.chat_message import ChatMessage as ChatMessageModel
    from app.services.minio_service import path_to_url as _path_to_url

    _IN_PROGRESS_GEN    = {"pending", "generating"}
    _IN_PROGRESS_UPLOAD = {"pending", "processing"}

    # ── 收集需要更新的 ID ──────────────────────────────────────────────
    gen_ids:  set[str] = set()
    upload_ids_by_cat: dict[str, set[str]] = {
        "document": set(), "image": set(), "video": set(), "audio": set(),
    }

    for row in rows:
        for r in (row.get("generation_results") or []):
            if r.get("status") in _IN_PROGRESS_GEN:
                gen_ids.add(r["generation_id"])
        for r in (row.get("upload_results") or []):
            cat = r.get("file_category", "")
            fid = r.get("file_id", "")
            if r.get("status") in _IN_PROGRESS_UPLOAD and cat in upload_ids_by_cat and fid:
                upload_ids_by_cat[cat].add(fid)

    has_upload = any(v for v in upload_ids_by_cat.values())
    if not gen_ids and not has_upload:
        return

    # ── 批量查真实状态 ────────────────────────────────────────────────
    gen_map:    dict[str, dict] = {}
    upload_map: dict[str, dict] = {}  # file_id -> {status, thumbnail_path?, cover_path?}

    if gen_ids:
        res = await db.execute(
            select(
                GeneratedContent.id,
                GeneratedContent.status,
                GeneratedContent.file_path,
                GeneratedContent.thumbnail_path,
                GeneratedContent.content,
                GeneratedContent.media_urls,
                GeneratedContent.layout,
            ).where(GeneratedContent.id.in_(gen_ids))
        )
        for row_db in res.all():
            gen_map[row_db.id] = {
                "status": row_db.status,
                "file_path": row_db.file_path,
                "thumbnail_path": row_db.thumbnail_path,
                # 图文混编正文较长，预览截断；普通文章保持原逻辑
                "content": (row_db.content or "")[:300] if row_db.content else None,
                "media_urls": row_db.media_urls or None,
                "layout": row_db.layout,
            }

    if upload_ids_by_cat["document"]:
        from app.models.document import Document
        res = await db.execute(
            select(Document.id, Document.status)
            .where(Document.id.in_(upload_ids_by_cat["document"]))
        )
        found: set[str] = set()
        for row_db in res.all():
            upload_map[row_db.id] = {"status": row_db.status}
            found.add(row_db.id)
        for missing in upload_ids_by_cat["document"] - found:
            upload_map[missing] = {"status": "deleted"}

    if upload_ids_by_cat["image"]:
        from app.models.image import Image
        res = await db.execute(
            select(Image.id, Image.status, Image.thumbnail_path)
            .where(Image.id.in_(upload_ids_by_cat["image"]))
        )
        found = set()
        for row_db in res.all():
            upload_map[row_db.id] = {"status": row_db.status, "thumbnail_path": row_db.thumbnail_path}
            found.add(row_db.id)
        for missing in upload_ids_by_cat["image"] - found:
            upload_map[missing] = {"status": "deleted"}

    if upload_ids_by_cat["video"]:
        from app.models.video import Video
        res = await db.execute(
            select(Video.id, Video.status, Video.cover_path)
            .where(Video.id.in_(upload_ids_by_cat["video"]))
        )
        found = set()
        for row_db in res.all():
            upload_map[row_db.id] = {"status": row_db.status, "cover_path": row_db.cover_path}
            found.add(row_db.id)
        for missing in upload_ids_by_cat["video"] - found:
            upload_map[missing] = {"status": "deleted"}

    if upload_ids_by_cat["audio"]:
        from app.models.audio import Audio
        res = await db.execute(
            select(Audio.id, Audio.status)
            .where(Audio.id.in_(upload_ids_by_cat["audio"]))
        )
        found = set()
        for row_db in res.all():
            upload_map[row_db.id] = {"status": row_db.status}
            found.add(row_db.id)
        for missing in upload_ids_by_cat["audio"] - found:
            upload_map[missing] = {"status": "deleted"}

    # ── 更新 rows 并写回 DB ───────────────────────────────────────────
    for row in rows:
        gen_results    = row.get("generation_results")  or []
        upload_results = row.get("upload_results") or []
        gen_changed    = False
        upload_changed = False

        for r in gen_results:
            if r.get("status") in _IN_PROGRESS_GEN and r["generation_id"] in gen_map:
                real = gen_map[r["generation_id"]]
                r["status"] = real["status"]
                if real["status"] == "completed":
                    r.setdefault("preview_info", {})
                    if real["file_path"]:
                        r["preview_info"]["file_url"] = _path_to_url(real["file_path"])
                    if real["thumbnail_path"]:
                        r["preview_info"]["thumbnail_url"] = _path_to_url(real["thumbnail_path"])
                    if real["content"]:
                        r["preview_info"]["content"] = real["content"]
                    if real.get("media_urls"):
                        r["preview_info"]["media_urls"] = [
                            _path_to_url(p) for p in real["media_urls"]
                        ]
                    if real.get("layout"):
                        r["preview_info"]["layout"] = real["layout"]
                gen_changed = True

        for r in upload_results:
            fid = r.get("file_id", "")
            if r.get("status") in _IN_PROGRESS_UPLOAD and fid in upload_map:
                real = upload_map[fid]
                r["status"] = real["status"]
                # 响应中补充缩略图公网 URL（路径写回 DB 时单独处理）
                if real.get("thumbnail_path"):
                    r["thumbnail_url"] = _path_to_url(real["thumbnail_path"])
                if real.get("cover_path"):
                    r["thumbnail_url"] = _path_to_url(real["cover_path"])
                upload_changed = True

        # 写回 DB
        msg_id = row.get("id")
        if msg_id and (gen_changed or upload_changed):
            update_vals: dict = {}
            if gen_changed:
                db_gen = []
                for r in gen_results:
                    db_r = {k: v for k, v in r.items() if k != "preview_info"}
                    if r.get("status") == "completed" and r["generation_id"] in gen_map:
                        real = gen_map[r["generation_id"]]
                        db_r["preview_info"] = {
                            k: v for k, v in {
                                "file_url":       real["file_path"],
                                "thumbnail_url":  real["thumbnail_path"],
                                "content":        real["content"],
                                "media_urls":     real.get("media_urls"),
                                "layout":         real.get("layout"),
                            }.items() if v is not None
                        }
                    else:
                        db_r["preview_info"] = r.get("preview_info") or {}
                    db_gen.append(db_r)
                update_vals["generation_results"] = db_gen
            if upload_changed:
                # DB 中存路径，不存公网 URL
                db_upload = []
                for r in upload_results:
                    db_r = dict(r)
                    fid = r.get("file_id", "")
                    if fid in upload_map:
                        real = upload_map[fid]
                        if real.get("thumbnail_path"):
                            db_r["thumbnail_url"] = real["thumbnail_path"]
                        elif real.get("cover_path"):
                            db_r["thumbnail_url"] = real["cover_path"]
                    db_upload.append(db_r)
                update_vals["upload_results"] = db_upload
            await db.execute(
                sql_update(ChatMessageModel)
                .where(ChatMessageModel.id == msg_id)
                .values(**update_vals)
            )

    if gen_ids or has_upload:
        try:
            await db.commit()
        except Exception:
            await db.rollback()


@router.post("/completions")
async def chat_completions(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI 对话 – 支持 SSE 流式 / 非流式"""
    session = await chat_service.get_session(body.session_id, current_user.id, db)
    if not session:
        raise NotFoundError("会话不存在")

    # 预校验余额 > 0（避免负值还继续生成；事后真实扣费在 chat_graph 内做）
    from app.services.saas_subscription import get_active_subscription
    from app.services.saas_quota import QuotaExceededError
    sub = await get_active_subscription(db, current_user.id)
    if sub is None or (sub.points_quota - sub.points_used + sub.addon_points) <= 0:
        raise QuotaExceededError("积分余额已用完，请升级套餐或购买增量包")

    # 解析挂载的参考素材（文档全文 / 图片 URL / 品牌产品资料）。
    # display_refs 回存到 user 消息 attachments（供前端气泡渲染引用卡片）；
    # reference_context / image_urls 仅注入本轮 LLM 上下文，不落到 message.content。
    from app.services.reference_service import build_reference_payload
    ref_payload = await build_reference_payload(body.references, current_user.id, db)

    # save user message（content 只存用户纯输入，引用以结构化形式存 attachments）
    await chat_service.add_message(
        body.session_id, current_user.id, "user", body.message, db,
        attachments=ref_payload.display_refs or None,
    )
    # 🔴 立刻提交用户消息：流式场景下请求 session 之后还会被 Agent 复用整段流，
    # get_db 的收尾 commit 要等流结束才执行；若仅 flush，这条未提交的 INSERT 一旦
    # 在流式期间因共享 session 回滚而被重发，created_at 会取到流结束后的时间，
    # 导致用户消息 created_at 晚于（独立 session 提前提交的）AI 消息、历史排序错乱。
    # 提前 commit 把 created_at 钉在此刻，并与后续 Agent 对 db 的使用解耦。
    await db.commit()

    # 解析 skill（注入 system）
    from app.services.skill_service import get_skill_prompt
    skill_prompt = await get_skill_prompt(body.skill_id, db)

    # build history
    history = await chat_service.build_llm_messages(
        body.session_id, current_user.id, db, system_prompt=session.system_prompt
    )

    if body.stream:
        gen = await run_chat_workflow(
            user_message=body.message,
            user_id=current_user.id,
            session_id=body.session_id,
            db=db,
            provider=body.provider or session.model_provider,
            model=body.model or session.model_name,
            history=history[:-1],  # exclude the latest user msg already in history
            system_prompt=session.system_prompt,
            use_knowledge=body.use_knowledge,
            reference_context=ref_payload.context_text,
            image_urls=ref_payload.image_urls,
            skill_prompt=skill_prompt,
            stream=True,
        )
        return StreamingResponse(gen, media_type="text/event-stream")

    result = await run_chat_workflow(
        user_message=body.message,
        user_id=current_user.id,
        session_id=body.session_id,
        db=db,
        provider=body.provider or session.model_provider,
        model=body.model or session.model_name,
        history=history[:-1],
        system_prompt=session.system_prompt,
        use_knowledge=body.use_knowledge,
        reference_context=ref_payload.context_text,
        image_urls=ref_payload.image_urls,
        skill_prompt=skill_prompt,
        stream=False,
    )
    # 助手消息已由 run_graph 内部持久化，此处直接返回结果
    return success(data=result)


@router.post("/messages/{message_id}/tts")
async def generate_message_tts(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """为指定助手消息生成 TTS 朗读音频（幂等：已生成则直接返回缓存 URL）。"""
    from sqlalchemy import select, update
    from app.models.chat_message import ChatMessage as ChatMessageModel
    from app.services.tts_service import generate_tts
    from app.services.minio_service import path_to_url

    # 查询消息（需归属当前用户）
    result = await db.execute(
        select(ChatMessageModel).where(
            ChatMessageModel.id == message_id,
            ChatMessageModel.user_id == current_user.id,
        )
    )
    msg = result.scalar_one_or_none()
    if msg is None:
        raise NotFoundError("消息不存在")
    if msg.role != "assistant":
        raise BadRequestError("仅支持对助手消息生成语音")

    # 幂等：已有缓存则直接返回
    if msg.tts_audio_url:
        return success(data={"tts_audio_url": path_to_url(msg.tts_audio_url)})

    # 生成 TTS → ffmpeg → MinIO
    object_path = await generate_tts(msg.content, current_user.id)

    # 持久化到消息
    await db.execute(
        update(ChatMessageModel)
        .where(ChatMessageModel.id == message_id)
        .values(tts_audio_url=object_path)
    )
    await db.commit()

    return success(data={"tts_audio_url": path_to_url(object_path)})


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """将上传的音频文件通过 Whisper 转录为文字（用于对话语音输入，不存库）。"""
    from app.services.whisper_service import transcribe

    file_bytes = await file.read()
    file_name = file.filename or "recording.webm"
    result = await transcribe(file_bytes, file_name, language=None)
    text = (result.get("text") or "").strip()
    return success(data={"text": text})


# ---------------------------------------------------------------------------
# 拖拽文件上传（文档 / 图片 / 视频）→ 自动路由到对应资源库 + 创建聊天记录
# ---------------------------------------------------------------------------

async def _doc_pipeline_bg(document_id: str) -> None:
    from app.core.database import async_session_factory
    from app.services.document_pipeline import process_document
    async with async_session_factory() as s:
        await process_document(document_id, s)
        await s.commit()


async def _image_pipeline_bg(image_id: str, user_id: str, file_bytes: bytes) -> None:
    from app.services.video_service import process_image
    await process_image(image_id, user_id, file_bytes)


async def _video_pipeline_bg(video_id: str, user_id: str, file_bytes: bytes) -> None:
    from app.services.video_service import process_video
    await process_video(video_id, user_id, file_bytes)


async def _audio_pipeline_bg(audio_id: str, user_id: str, file_bytes: bytes, file_name: str) -> None:
    from app.services.audio_service import process_audio
    await process_audio(audio_id, user_id, file_bytes, file_name)


@router.post("/sessions/{session_id}/upload")
async def upload_chat_file(
    session_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """将拖拽文件上传到对应资源库（文档/图片/视频），并在聊天中创建上传记录消息。"""
    from app.core.file_validators import (
        ALLOWED_AUDIO_EXTENSIONS,
        ALLOWED_DOCUMENT_EXTENSIONS,
        ALLOWED_IMAGE_EXTENSIONS,
        ALLOWED_VIDEO_EXTENSIONS,
    )
    from app.services.minio_service import MinIOService, path_to_url

    session = await chat_service.get_session(session_id, current_user.id, db)
    if not session:
        raise NotFoundError("会话不存在")

    file_name = file.filename or "file"
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""

    if ext in ALLOWED_IMAGE_EXTENSIONS:
        file_category = "image"
    elif ext in ALLOWED_VIDEO_EXTENSIONS:
        file_category = "video"
    elif ext in ALLOWED_AUDIO_EXTENSIONS:
        file_category = "audio"
    elif ext in ALLOWED_DOCUMENT_EXTENSIONS:
        file_category = "document"
    else:
        raise BadRequestError(
            f"不支持的文件格式 .{ext}，仅支持文档（pdf/docx/xlsx/txt 等）或媒体/音频文件（jpg/png/mp4/mp3 等）"
        )

    file_bytes = await file.read()
    minio_svc = MinIOService()
    upload_result: dict = {}
    # 延迟注册的后台任务参数（在 commit 之后才 add_task，避免 pipeline 读不到记录）
    _bg_task: tuple | None = None

    if file_category == "document":
        from app.models.document import Document

        file_path = await minio_svc.upload_bytes(
            file_bytes, "documents", current_user.id,
            ext=ext, content_type=file.content_type or "application/octet-stream",
        )
        record = Document(
            user_id=current_user.id,
            title=file_name,
            file_name=file_name,
            file_type=ext,
            file_size=len(file_bytes),
            file_path=file_path,
            status="pending",
        )
        db.add(record)
        await db.flush()
        await db.refresh(record)
        _bg_task = (_doc_pipeline_bg, record.id)
        upload_result = {
            "file_category": "document",
            "file_name": file_name,
            "file_id": record.id,
            "file_url": file_path,
            "status": "pending",
        }

    elif file_category == "image":
        from app.models.image import Image

        file_path = await minio_svc.upload_bytes(
            file_bytes, "images", current_user.id,
            ext=ext, content_type=file.content_type or "image/jpeg",
        )
        record = Image(
            user_id=current_user.id,
            title=file_name,
            file_name=file_name,
            file_path=file_path,
            file_size=len(file_bytes),
            mime_type=file.content_type,
            source="upload",
            status="pending",
        )
        db.add(record)
        await db.flush()
        await db.refresh(record)
        _bg_task = (_image_pipeline_bg, record.id, current_user.id, file_bytes)
        upload_result = {
            "file_category": "image",
            "file_name": file_name,
            "file_id": record.id,
            "file_url": file_path,
            "status": "pending",
        }

    elif file_category == "audio":
        from app.models.audio import Audio

        file_path = await minio_svc.upload_bytes(
            file_bytes, "audios", current_user.id,
            ext=ext, content_type=file.content_type or "audio/mpeg",
        )
        record = Audio(
            user_id=current_user.id,
            title=file_name,
            file_name=file_name,
            file_path=file_path,
            file_size=len(file_bytes),
            mime_type=file.content_type,
            source="upload",
            status="pending",
        )
        db.add(record)
        await db.flush()
        await db.refresh(record)
        _bg_task = (_audio_pipeline_bg, record.id, current_user.id, file_bytes, file_name)
        upload_result = {
            "file_category": "audio",
            "file_name": file_name,
            "file_id": record.id,
            "file_url": file_path,
            "status": "pending",
        }

    else:  # video
        from app.models.video import Video

        file_path = await minio_svc.upload_bytes(
            file_bytes, "videos", current_user.id,
            ext=ext, content_type=file.content_type or "video/mp4",
        )
        record = Video(
            user_id=current_user.id,
            title=file_name,
            file_name=file_name,
            file_path=file_path,
            file_size=len(file_bytes),
            mime_type=file.content_type,
            source="upload",
            status="pending",
        )
        db.add(record)
        await db.flush()
        await db.refresh(record)
        _bg_task = (_video_pipeline_bg, record.id, current_user.id, file_bytes)
        upload_result = {
            "file_category": "video",
            "file_name": file_name,
            "file_id": record.id,
            "file_url": file_path,
            "status": "pending",
        }

    msg = await chat_service.add_message(
        session_id,
        current_user.id,
        "assistant",
        f'小牛已帮您将文件「{file_name}」提交上传',
        db,
        upload_results=[upload_result],
    )

    # 先提交事务，再注册后台任务，确保 pipeline 能读到记录（与 documents.py 保持一致）
    await db.commit()
    await db.refresh(msg)
    if _bg_task:
        background_tasks.add_task(*_bg_task)

    d = MessageResponse.model_validate(msg).model_dump(mode="json")
    for r in (d.get("upload_results") or []):
        if r.get("file_url") and not r["file_url"].startswith("http"):
            r["file_url"] = path_to_url(r["file_url"])
        if r.get("thumbnail_url") and not r["thumbnail_url"].startswith("http"):
            r["thumbnail_url"] = path_to_url(r["thumbnail_url"])

    return success(data=d)
