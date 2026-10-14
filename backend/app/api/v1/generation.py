from __future__ import annotations

import asyncio
import logging
import random
import re

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import NotFoundError
from app.services.billing_config_service import (
    credits_for_image,
    credits_for_text,
    credits_for_video,
)
from app.services.saas_quota import QuotaExceededError, consume_points
from app.services.saas_subscription import get_active_subscription
from app.services import auto_distribute_service
from app.models.generated_content import GeneratedContent
from app.models.user import User
from app.schemas.common import PaginatedData, success
from app.schemas.generation import (
    ArticleGenRequest,
    GeneratedContentResponse,
    ImageGenRequest,
    VideoGenRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/generation", tags=["内容生成"])


@router.post("/article")
async def generate_article(
    body: ArticleGenRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """生成文章 – 异步：提交即建 pending 记录并立即返回，后台任务独立完成生成入库。
    图文混编（body.mixed）同样走异步：正文 + 并发配图。前端通过 GET /generation/{id} 轮询。
    """
    # 预校验余额 > 0
    sub = await get_active_subscription(db, current_user.id)
    if sub is None or (sub.points_quota - sub.points_used + sub.addon_points) <= 0:
        raise QuotaExceededError("积分余额已用完，请升级套餐或购买增量包")

    # 解析「参考内容」：文章允许 auto 模式按需检索知识库文档
    from app.services.reference_resolver import resolve_generation_reference
    resolved = await resolve_generation_reference(
        body.reference, current_user.id, db,
        allow_doc_retrieval=True, fallback_brand_info=body.brand_info,
    )
    ref_text = resolved.reference_text or None

    # 解析 skill（注入 system）
    from app.services.skill_service import get_skill_prompt
    skill_prompt = await get_skill_prompt(body.skill_id, db)

    # 图文混编：异步生成（正文内嵌配图），立即返回 pending 记录，前端轮询
    if body.mixed:
        _min = max(1, settings.MIXED_ARTICLE_IMAGE_MIN)
        _max = max(_min, settings.MIXED_ARTICLE_IMAGE_MAX)
        n = random.randint(_min, _max)
        record = GeneratedContent(
            user_id=current_user.id,
            type="article",
            layout="mixed",
            title=body.prompt[:100],
            prompt=body.prompt,
            model_provider=body.provider,
            model_name=body.model,
            parameters={
                "reference": body.reference,
                "skill_id": body.skill_id,
                "template_label": body.template_label,
                "mixed_image_count": n,
            },
            status="pending",
        )
        db.add(record)
        await db.flush()
        await db.commit()  # 必须在 background task 启动前提交，否则新 session 查不到记录
        background_tasks.add_task(
            _run_mixed_article_async,
            record_id=record.id,
            prompt=body.prompt,
            user_id=current_user.id,
            provider=body.provider,
            model=body.model,
            brand_info=ref_text,
            skill_prompt=skill_prompt,
            use_knowledge=resolved.use_knowledge,
            image_count=n,
        )
        return success(data={
            "id": record.id,
            "status": "pending",
            "message": "图文混编文章生成任务已创建，请通过 GET /generation/{id} 查询进度",
        })

    # 普通文章：与图片/视频/图文混编一致，走异步——提交即建 pending 记录并立即返回，
    # 真正的生成在后台任务里独立完成。用户即便提交后马上切到别的菜单 / 断开连接，
    # 文章也会照常生成入库，可在「内容库」查看。前端通过 GET /generation/{id} 轮询进度。
    record = GeneratedContent(
        user_id=current_user.id,
        type="article",
        title=body.prompt[:100],
        prompt=body.prompt,
        model_provider=body.provider,
        model_name=body.model,
        parameters={
            "reference": body.reference,
            "skill_id": body.skill_id,
            "template_label": body.template_label,
        },
        status="pending",
    )
    db.add(record)
    await db.flush()
    await db.commit()  # 必须在 background task 启动前提交，否则新 session 查不到记录
    background_tasks.add_task(
        _run_article_async,
        record_id=record.id,
        prompt=body.prompt,
        user_id=current_user.id,
        provider=body.provider,
        model=body.model,
        brand_info=ref_text,
        skill_prompt=skill_prompt,
        use_knowledge=resolved.use_knowledge,
        template_label=body.template_label,
    )
    return success(data={
        "id": record.id,
        "status": "pending",
        "message": "文章生成任务已创建，请通过 GET /generation/{id} 查询进度",
    })


async def _run_article_async(
    record_id: str,
    prompt: str,
    user_id: str,
    *,
    provider: str | None,
    model: str | None,
    brand_info: str | None,
    skill_prompt: str | None,
    use_knowledge: bool,
    template_label: str | None = None,
) -> None:
    """普通文章后台任务：非流式生成正文 → 发布元数据 → 一次性原子回写完成。

    与请求 / SSE 连接解耦：用户提交后断开或切换页面，生成照常完成入库。
    回写前重新取记录，若生成期间已被删除则优雅跳过，避免 StaleDataError。
    """
    from app.agents.metadata_agent import generate_publish_metadata
    from app.agents.workflows.content_workflow import run_article_workflow
    from app.core.database import async_session_factory

    logger.info("[Article] BG task started | record=%s provider=%s", record_id, provider)

    async with async_session_factory() as db:
        try:
            record = (
                await db.execute(select(GeneratedContent).where(GeneratedContent.id == record_id))
            ).scalar_one_or_none()
            if not record:
                logger.warning("[Article] record %s not found, aborting", record_id)
                return

            record.status = "generating"
            await db.flush()
            await db.commit()

            # 1. 生成正文（非流式）
            result = await run_article_workflow(
                prompt=prompt,
                user_id=user_id,
                db=db,
                provider=provider,
                model=model,
                brand_info=brand_info,
                skill_prompt=skill_prompt,
                use_knowledge=use_knowledge,
                stream=False,
            )
            content = result.get("content") or ""

            # 2. 发布元数据（标题/描述/标签），失败返回 {} 不连坐入库
            meta: dict = {}
            try:
                meta = await generate_publish_metadata(
                    content_type="article", text=content, brand_info=brand_info
                )
            except Exception as meta_err:  # noqa: BLE001
                logger.warning("[Article] publish metadata skipped: %s", meta_err)

            # 3. 重活完成后一次性回写；期间记录可能已被用户删除 → 取不到则优雅跳过
            db.expunge_all()
            record = (
                await db.execute(select(GeneratedContent).where(GeneratedContent.id == record_id))
            ).scalar_one_or_none()
            if record is None:
                logger.info("[Article] record %s 在生成期间已被删除，跳过入库", record_id)
                return

            record.content = content
            if meta.get("title"):
                record.title = meta["title"]
            if meta.get("description"):
                record.description = meta["description"]
            if meta.get("tags"):
                record.tags = meta["tags"]
            record.status = "completed"
            await db.flush()

            await _charge_article(
                db, user_id=user_id, text=content, model_id=model, record_id=str(record_id)
            )
            await db.commit()
            logger.info("[Article] record %s → completed ✓", record_id)
            await _maybe_auto_distribute(db, record)

        except Exception as e:  # noqa: BLE001
            logger.exception("[Article] FAILED for record %s | error: %s", record_id, e)
            # 用全新 session 落 failed，避免主 session 事务已损坏导致状态卡在 generating
            try:
                async with async_session_factory() as err_db:
                    err_record = await err_db.get(GeneratedContent, record_id)
                    if err_record:
                        err_record.status = "failed"
                        err_record.error_message = str(e)[:2000]
                        await err_db.commit()
            except Exception:  # noqa: BLE001
                logger.warning("[Article] could not update failed status for %s", record_id)


# 图文混编正文里的图片占位符：[[IMG: 画面描述]]
_IMG_PLACEHOLDER_RE = re.compile(r"\[\[IMG:\s*(.*?)\]\]", re.DOTALL)
# 兜底：模型有时会用「【配图建议：…】 / 【配图：…】 / [配图提示：…]」等标记（尤其用户提示词自带配图指令时）
_IMG_FALLBACK_RE = re.compile(r"[【\[]\s*配图[^：:】\]]*[：:]\s*(.*?)\s*[】\]]", re.DOTALL)


def _insert_images_evenly(text: str, image_paths: list[str]) -> str:
    """把图片均匀插入正文段落之间（模型完全没标占位符时的兜底）。image_paths 为 MinIO 存储路径。"""
    from app.services.minio_service import path_to_url
    paras = [p for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]
    if not paras or not image_paths:
        return text
    n = len(image_paths)
    # 在段落之间均匀挑 n 个插入点（避开第一段之前与文末之后）
    step = max(1, len(paras) / (n + 1))
    targets = sorted({min(len(paras) - 1, max(1, round(step * (k + 1)))) for k in range(n)})
    out: list[str] = []
    img_idx = 0
    for i, para in enumerate(paras, start=1):
        out.append(para)
        if img_idx < n and i in targets:
            out.append(f"![]({path_to_url(image_paths[img_idx])})")
            img_idx += 1
    while img_idx < n:  # targets 去重后可能少于 n，剩余图补到文末
        out.append(f"![]({path_to_url(image_paths[img_idx])})")
        img_idx += 1
    return "\n\n".join(out)


async def _run_mixed_article_async(
    record_id: str,
    prompt: str,
    user_id: str,
    *,
    provider: str | None,
    model: str | None,
    brand_info: str | None,
    skill_prompt: str | None,
    use_knowledge: bool,
    image_count: int,
) -> None:
    """图文混编文章后台任务：生成带 [[IMG:]] 占位符的正文 → 并发生图 → 替换为内嵌 markdown 图。"""
    from app.agents.article_agent import generate_article
    from app.core.database import async_session_factory
    from app.services.minio_service import MinIOService, path_to_url

    logger.info(
        "[MixedArticle] BG task started | record=%s provider=%s image_count=%d",
        record_id, provider, image_count,
    )

    async with async_session_factory() as db:
        try:
            record = (
                await db.execute(select(GeneratedContent).where(GeneratedContent.id == record_id))
            ).scalar_one_or_none()
            if not record:
                logger.warning("[MixedArticle] record %s not found, aborting", record_id)
                return

            record.status = "generating"
            await db.flush()
            await db.commit()

            # 1. 生成带占位符的正文（非流式）
            result = await generate_article(
                prompt=prompt,
                user_id=user_id,
                db=db,
                provider=provider,
                model=model,
                brand_info=brand_info,
                skill_prompt=skill_prompt,
                use_knowledge=use_knowledge,
                stream=False,
                mixed=True,
                image_count=image_count,
            )
            article_text = result["content"] or ""

            # 2. 解析占位符（保留出现顺序）。优先标准 [[IMG: ...]]；
            #    若模型改用「【配图建议：...】」之类标记则兜底兼容；都没有则后面走"自动派生 + 均匀插入"。
            matches = list(_IMG_PLACEHOLDER_RE.finditer(article_text))
            if not matches:
                matches = list(_IMG_FALLBACK_RE.finditer(article_text))
                if matches:
                    logger.info("[MixedArticle] record=%s 用兜底配图标记解析到 %d 处", record_id, len(matches))
            img_prompts = [m.group(1).strip() for m in matches if m.group(1).strip()]

            auto_insert = False
            if not img_prompts:
                # 模型完全没标注配图（常因用户提示词里要求"系统自动处理/不要标注配图"）：
                # 兜底——基于正文另让 LLM 产出 image_count 个配图描述，再均匀插入段落之间，保证图文混编一定有图。
                from app.agents.metadata_agent import derive_image_prompts
                img_prompts = await derive_image_prompts(article_text, image_count)
                auto_insert = True
                logger.info("[MixedArticle] record=%s 正文无占位符，兜底自动派生 %d 个配图描述", record_id, len(img_prompts))
            logger.info("[MixedArticle] record=%s 待生成配图 %d 张（auto_insert=%s）", record_id, len(img_prompts), auto_insert)

            # 3. 并发生图（固定 gpt-image-2 / Azure），失败的返回 None
            minio_svc = MinIOService()

            async def _gen_one(p: str) -> str | None:
                if not p:
                    return None
                try:
                    from app.services.azure_image_client import generate_image as azure_gen
                    img_bytes = await azure_gen(prompt=p, size="1024x1024")
                    return await minio_svc.upload_bytes(
                        img_bytes, "generated/images", user_id, "png", "image/png"
                    )
                except Exception as e:  # noqa: BLE001
                    logger.warning("[MixedArticle] image gen failed for %r: %s", p[:60], e)
                    return None

            paths: list[str | None] = (
                list(await asyncio.gather(*[_gen_one(p) for p in img_prompts])) if img_prompts else []
            )

            # 4. 组装正文：占位符模式按位置替换；自动模式把图均匀插到段落之间
            media_paths: list[str] = []
            if auto_insert:
                media_paths = [p for p in paths if p]
                final_content = _insert_images_evenly(article_text, media_paths)
            else:
                out_parts: list[str] = []
                last = 0
                for m, path in zip(matches, paths):
                    out_parts.append(article_text[last:m.start()])
                    if path:
                        out_parts.append(f"![]({path_to_url(path)})")
                        media_paths.append(path)
                    last = m.end()
                out_parts.append(article_text[last:])
                final_content = re.sub(r"\n{3,}", "\n\n", "".join(out_parts)).strip()

            record.content = final_content
            record.media_urls = media_paths or None
            record.file_path = media_paths[0] if media_paths else None

            # 首图作缩略图
            if media_paths:
                try:
                    img_bytes = await minio_svc.get_object_bytes(media_paths[0])
                    from app.services.video_service import extract_image_thumbnail
                    thumb_bytes = await extract_image_thumbnail(img_bytes)
                    record.thumbnail_path = await minio_svc.upload_bytes(
                        thumb_bytes, "generated/thumbnails", user_id, "jpg", "image/jpeg"
                    )
                except Exception as thumb_err:  # noqa: BLE001
                    logger.warning("[MixedArticle] thumbnail skipped: %s", thumb_err)

            # 5. 发布元数据（基于去图后的纯文本，两种标记都去掉）
            plain_text = _IMG_FALLBACK_RE.sub("", _IMG_PLACEHOLDER_RE.sub("", article_text))
            try:
                from app.agents.metadata_agent import generate_publish_metadata
                meta = await generate_publish_metadata(
                    content_type="article", text=plain_text, brand_info=brand_info
                )
                if meta.get("title"):
                    record.title = meta["title"]
                if meta.get("description"):
                    record.description = meta["description"]
                if meta.get("tags"):
                    record.tags = meta["tags"]
            except Exception as meta_err:  # noqa: BLE001
                logger.warning("[MixedArticle] publish metadata skipped: %s", meta_err)

            record.status = "completed"
            await db.flush()

            # 6. 扣分：文章正文（按去图纯文本算 token，不含图片 URL）+ 每张配图
            await _charge_article(
                db, user_id=user_id, text=plain_text, model_id=model, record_id=str(record_id)
            )
            for _ in media_paths:
                await _charge_image(
                    db, user_id=user_id,
                    model_id=settings.AZURE_IMAGE_MODEL,
                    size="1024x1024",
                    record_id=str(record_id),
                )

            await db.commit()
            logger.info("[MixedArticle] record %s → completed ✓ (%d images)", record_id, len(media_paths))
            await _maybe_auto_distribute(db, record)

        except Exception as e:
            logger.exception("[MixedArticle] FAILED for record %s | error: %s", record_id, e)
            # 用全新 session 落 failed，避免主 session 事务已损坏导致状态卡在 generating
            try:
                async with async_session_factory() as err_db:
                    err_record = await err_db.get(GeneratedContent, record_id)
                    if err_record:
                        err_record.status = "failed"
                        err_record.error_message = str(e)[:2000]
                        await err_db.commit()
            except Exception:  # noqa: BLE001
                logger.warning("[MixedArticle] could not update failed status for %s", record_id)


@router.post("/image")
async def generate_image(
    body: ImageGenRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """生图 – 异步后台处理，立即返回记录 ID，前端通过 GET /generation/{id} 轮询进度"""
    # 一次生成张数（clamp 到配置上限）；as_dynamic=生成发布动态（多图 + 复用文案）
    count = max(1, min(body.count, settings.IMAGE_BATCH_MAX))

    # 预校验：按张数粗算扣分，若余额不足直接拒绝
    sub = await get_active_subscription(db, current_user.id)
    if sub is None:
        raise QuotaExceededError("未找到有效订阅")
    est_credits, _ = await credits_for_image(
        db,
        model_id=_resolve_image_model_id(body.provider),
        size=body.size or "1024x1024",
    )
    est_total = est_credits * count
    if (sub.points_quota - sub.points_used + sub.addon_points) < est_total:
        raise QuotaExceededError(f"积分不足：本次生图（{count} 张）预计扣 {est_total} 积分")

    # 归一化参考图：优先 image_urls（多图），兼容旧 image_url（单图），按模型上限裁剪
    from app.core.media_limits import clamp_image_refs
    ref_urls = clamp_image_refs(
        body.provider, body.image_urls or ([body.image_url] if body.image_url else [])
    )

    # 解析「参考内容」：图片不检索文档，仅注入企业档案（auto）/所选内容（custom）
    from app.services.reference_resolver import resolve_generation_reference
    resolved = await resolve_generation_reference(
        body.reference, current_user.id, db,
        allow_doc_retrieval=False, fallback_brand_info=body.brand_info,
    )
    ref_text = resolved.reference_text or None

    from app.services.skill_service import get_skill_prompt
    skill_prompt = await get_skill_prompt(body.skill_id, db)

    record = GeneratedContent(
        user_id=current_user.id,
        type="image",
        layout="dynamic" if body.as_dynamic else None,
        title=body.title or body.prompt[:100],
        prompt=body.prompt,
        model_provider=body.provider,
        parameters={
            "size": body.size,
            "image_url": ref_urls[0] if ref_urls else None,  # 兼容旧字段（首图）
            "image_urls": ref_urls,
            "count": count,
            "as_dynamic": body.as_dynamic,
            "reference": body.reference,
            "skill_id": body.skill_id,
            "template_label": body.template_label,
        },
        status="pending",
    )
    db.add(record)
    await db.flush()
    await db.commit()  # 必须在 background task 启动前提交，否则新 session 查不到记录

    background_tasks.add_task(
        _run_image_generation_async,
        record_id=record.id,
        prompt=body.prompt,
        user_id=current_user.id,
        provider=body.provider,
        size=body.size or "1920x1920",
        image_urls=ref_urls,
        brand_info=ref_text,
        skill_prompt=skill_prompt,
        count=count,
    )

    return success(data={
        "id": record.id,
        "status": "pending",
        "message": "图片生成任务已创建，请通过 GET /generation/{id} 查询进度",
    })


@router.post("/video")
async def generate_video(
    body: VideoGenRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """生视频 – 异步轮询，返回生成记录 ID"""
    # 预校验：粗算扣分（按请求时长估算）
    sub = await get_active_subscription(db, current_user.id)
    if sub is None:
        raise QuotaExceededError("未找到有效订阅")
    est_credits, _ = await credits_for_video(
        db,
        model_id=_resolve_video_model_id(body.provider),
        resolution=body.resolution or "720p",
        seconds=float(body.duration or 5),
    )
    if (sub.points_quota - sub.points_used + sub.addon_points) < est_credits:
        raise QuotaExceededError(f"积分不足：本次生视频预计扣 {est_credits} 积分")

    # 解析「参考内容」：视频不检索文档，仅注入企业档案（auto）/所选内容（custom）
    from app.services.reference_resolver import resolve_generation_reference
    resolved = await resolve_generation_reference(
        body.reference, current_user.id, db,
        allow_doc_retrieval=False, fallback_brand_info=body.brand_info,
    )
    ref_text = resolved.reference_text or None

    from app.services.skill_service import get_skill_prompt
    skill_prompt = await get_skill_prompt(body.skill_id, db)

    record = GeneratedContent(
        user_id=current_user.id,
        type="video",
        title=body.title or body.prompt[:100],
        prompt=body.prompt,
        model_provider=body.provider,
        parameters={
            "resolution": body.resolution,
            "duration": body.duration,
            "enable_audio": body.enable_audio,
            "image_url": body.image_url,
            "last_image_url": body.last_image_url,
            "reference": body.reference,
            "skill_id": body.skill_id,
            "template_label": body.template_label,
        },
        status="pending",
    )
    db.add(record)
    await db.flush()
    await db.commit()  # 必须在 background task 启动前提交，否则新 session 查不到记录

    background_tasks.add_task(
        _run_video_generation_async,
        record_id=record.id,
        prompt=body.prompt,
        user_id=current_user.id,
        provider=body.provider,
        resolution=body.resolution or "1080p",
        duration=body.duration or 5,
        image_url=body.image_url,
        last_image_url=body.last_image_url,
        brand_info=ref_text,
        skill_prompt=skill_prompt,
        enable_audio=body.enable_audio,
    )

    return success(data={
        "id": record.id,
        "status": "pending",
        "message": "视频生成任务已创建，请通过 GET /generation/{id} 查询进度",
    })


@router.get("")
async def list_generated(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    type: str | None = Query(None, description="article / image / video"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出生成内容历史"""
    filters = [GeneratedContent.user_id == current_user.id]
    if type:
        filters.append(GeneratedContent.type == type)
    total = (await db.execute(select(func.count()).select_from(GeneratedContent).where(*filters))).scalar() or 0
    q = (
        select(GeneratedContent)
        .where(*filters)
        .order_by(GeneratedContent.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = list((await db.execute(q)).scalars().all())
    data = [GeneratedContentResponse.model_validate(i).model_dump(mode="json") for i in items]
    return success(data=PaginatedData.create(items=data, total=total, page=page, page_size=page_size).model_dump())


@router.get("/{id}")
async def get_generated(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取生成内容详情"""
    result = await db.execute(
        select(GeneratedContent).where(GeneratedContent.id == id, GeneratedContent.user_id == current_user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise NotFoundError("生成内容不存在")
    return success(data=GeneratedContentResponse.model_validate(record).model_dump(mode="json"))


@router.get("/{id}/export")
async def export_article(
    id: str,
    format: str = Query("docx", description="导出格式：docx / pdf"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """将文章导出为 Word (.docx) 或 PDF 文件。"""
    result = await db.execute(
        select(GeneratedContent).where(GeneratedContent.id == id, GeneratedContent.user_id == current_user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise NotFoundError("生成内容不存在")
    if record.type != "article":
        raise NotFoundError("仅文章内容支持导出")
    content = record.content or ""
    title = (record.title or "article").replace("/", "-").replace("\\", "-")[:80]

    if format == "docx":
        import os
        import tempfile

        import pypandoc
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
            tmp_path = f.name
        try:
            pypandoc.convert_text(
                content, "docx", format="md", outputfile=tmp_path,
                extra_args=["--metadata", f"title={title}"],
            )
            with open(tmp_path, "rb") as f:
                data = f.read()
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        safe_name = title.encode("ascii", errors="replace").decode().replace("?", "_") or "article"
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.docx"'},
        )

    if format == "pdf":
        import pypandoc
        import weasyprint

        html_body = pypandoc.convert_text(content, "html", format="md")
        escaped_title = title.replace("<", "&lt;").replace(">", "&gt;")
        full_html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>{escaped_title}</title>
<style>
  @page {{ margin: 20mm 18mm; }}
  body {{ font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
         font-size: 13px; line-height: 1.75; color: #222; max-width: 100%; }}
  h1 {{ font-size: 22px; margin-top: 0 0 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }}
  h2 {{ font-size: 17px; margin: 24px 0 10px; }}
  h3 {{ font-size: 14px; margin: 18px 0 8px; }}
  p  {{ margin: 0 0 10px; }}
  ul, ol {{ padding-left: 22px; margin: 0 0 10px; }}
  li {{ margin-bottom: 4px; }}
  code {{ background: #f3f4f6; padding: 1px 5px; border-radius: 3px;
          font-family: "Courier New", monospace; font-size: 12px; }}
  pre  {{ background: #f3f4f6; border-radius: 6px; padding: 12px 16px;
          overflow: auto; font-size: 12px; margin: 0 0 12px; }}
  blockquote {{ border-left: 4px solid #d1d5db; margin: 0 0 12px 0;
               padding: 6px 14px; color: #555; background: #f9fafb; }}
  table {{ border-collapse: collapse; width: 100%; margin-bottom: 12px; font-size: 12px; }}
  th, td {{ border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; }}
  th {{ background: #f3f4f6; font-weight: 600; }}
  img {{ max-width: 100%; height: auto; }}
  a {{ color: #2563eb; }}
</style>
</head>
<body>
<h1>{escaped_title}</h1>
{html_body}
</body>
</html>"""
        pdf_data: bytes = weasyprint.HTML(string=full_html).write_pdf()
        safe_name = title.encode("ascii", errors="replace").decode().replace("?", "_") or "article"
        return Response(
            content=pdf_data,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.pdf"'},
        )

    raise NotFoundError(f"不支持的导出格式：{format}，请使用 docx 或 pdf")


@router.put("/{id}/publish")
async def update_publish_status(
    id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """变更发布状态 (draft -> ready -> published)"""
    from app.services.generation_service import update_publish_status as _update
    record = await _update(id, current_user.id, body.get("status", ""), db)
    return success(data=GeneratedContentResponse.model_validate(record).model_dump(mode="json"))


@router.delete("/{id}")
async def delete_generated(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除生成内容"""
    result = await db.execute(
        select(GeneratedContent).where(GeneratedContent.id == id, GeneratedContent.user_id == current_user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise NotFoundError("生成内容不存在")
    if record.file_path or record.thumbnail_path:
        try:
            from app.services.minio_service import MinIOService, url_to_path
            minio_svc = MinIOService()
            for path in (record.file_path, record.thumbnail_path):
                if not path:
                    continue
                try:
                    key = url_to_path(path) or path
                    await minio_svc.delete_file(key)
                except Exception:
                    pass
        except Exception:
            pass
    await db.delete(record)
    # 显式 commit 后再返回，否则前端收到响应后立刻发起的列表 GET 会走另一条连接读到未提交的旧数据
    await db.commit()
    return success(message="已删除")


def _build_image_prompt(prompt: str, brand_info: str | None, skill_prompt: str | None = None) -> str:
    """将 skill 创作技巧 + 品牌信息追加到生图提示词中。"""
    parts = [prompt]
    if skill_prompt and skill_prompt.strip():
        parts.append(f"[创作技巧]\n{skill_prompt.strip()}")
    if brand_info and brand_info.strip():
        parts.append(f"[品牌参考信息]\n{brand_info.strip()}")
    from app.services.llm_service import log_system_layers
    log_system_layers([
        ("生图提示词(用户)", prompt),
        ("创作大师", skill_prompt),
        ("品牌/参考内容", brand_info),
    ], title="生图 Prompt")
    return "\n\n".join(parts)


async def _generate_single_image(
    provider: str,
    effective_prompt: str,
    size: str,
    refs: list[str],
    *,
    minio_svc,
    user_id: str,
    azure_ref_images: list[tuple[bytes, str, str]] | None = None,
) -> str:
    """生成单张图片并存入 MinIO，返回存储路径。供「一次生成多张」并发调用。"""
    if provider == "tencent":
        from app.services.tencent_vod_client import generate_image as tc_gen
        remote_url = await tc_gen(effective_prompt, size=size, image_urls=refs or None)
        return await minio_svc.download_and_store(remote_url, "generated/images", user_id)
    if provider == "azure":
        # Azure gpt-image-2：有参考图走 edits（支持多图），无参考图走 generations
        from app.services.azure_image_client import (
            edit_image as azure_edit,
            generate_image as azure_gen,
        )
        if azure_ref_images:
            image_bytes = await azure_edit(prompt=effective_prompt, images=azure_ref_images, size=size)
        else:
            image_bytes = await azure_gen(prompt=effective_prompt, size=size)
        return await minio_svc.upload_bytes(image_bytes, "generated/images", user_id, "png", "image/png")
    from app.services.doubao_client import generate_image as db_gen
    remote_url = await db_gen(effective_prompt, size=size, image_urls=refs or None)
    return await minio_svc.download_and_store(remote_url, "generated/images", user_id)


async def _run_image_generation_async(
    record_id: str,
    prompt: str,
    user_id: str,
    provider: str,
    size: str,
    image_urls: list[str] | None = None,
    brand_info: str | None = None,
    skill_prompt: str | None = None,
    image_url: str | None = None,  # 兼容旧调用（单图）；内部归一化为列表
    count: int = 1,
    prefer_generated_title: bool = False,  # 定时任务：record 预置的是规则名占位，强制用 LLM 标题
) -> None:
    """图片生成后台任务：按 count 并发生成 N 张，存 MinIO，首张生成缩略图，更新 DB 状态。"""
    from app.core.database import async_session_factory
    from app.core.media_limits import clamp_image_refs, normalize_ref_image_bytes
    from app.services.minio_service import MinIOService

    # 归一化 + 按 provider 上限裁剪参考图
    refs = clamp_image_refs(provider, image_urls or ([image_url] if image_url else []))
    count = max(1, count)

    logger.info(
        "[ImageGen] BG task started | record=%s provider=%s size=%s ref_images=%d count=%d",
        record_id, provider, size, len(refs), count,
    )

    # 选了「创作大师」(生图提示词专家 skill)：用 LLM 把简单需求优化成专业文生图提示词；
    # 否则只把品牌/参考信息拼到用户提示词后（图像模型直接渲染，不会执行 skill 指令）。
    if skill_prompt and skill_prompt.strip():
        from app.agents.metadata_agent import optimize_image_prompt
        optimized = await optimize_image_prompt(prompt, skill_prompt, brand_info)
        effective_prompt = _build_image_prompt(optimized, brand_info if optimized == prompt else None, None)
        logger.info("[ImageGen] record=%s 创作大师优化后提示词: %r", record_id, effective_prompt[:160])
    else:
        effective_prompt = _build_image_prompt(prompt, brand_info, None)

    async with async_session_factory() as db:
        try:
            result = await db.execute(
                select(GeneratedContent).where(GeneratedContent.id == record_id)
            )
            record = result.scalar_one_or_none()
            if not record:
                logger.warning("[ImageGen] record %s not found in DB, aborting", record_id)
                return

            # commit 后 record 会过期；且为缩小持锁窗口，后续重活全程不持有该行，
            # 这里先把之后要用到的字段捕获为本地变量。
            is_dynamic = record.layout == "dynamic"
            orig_title = record.title

            record.status = "generating"
            await db.flush()
            await db.commit()  # 立即提交，让前端轮询能读到 generating 状态
            logger.info("[ImageGen] record %s → generating, calling provider=%s ×%d", record_id, provider, count)

            minio_svc = MinIOService()

            # Azure 多图参考字节预取一次，避免 N 张重复下载
            azure_ref_images: list[tuple[bytes, str, str]] | None = None
            if provider == "azure" and refs:
                azure_ref_images = []
                for i, ref in enumerate(refs):
                    ref_bytes, _ref_mime = await minio_svc.fetch_bytes(ref)
                    # Azure edits 对输入图格式/颜色模式较严：统一标准化为 RGB PNG
                    # （去 alpha/CMYK/P、缩放超大图），否则异常模式会报 invalid_image_file
                    norm = await asyncio.to_thread(normalize_ref_image_bytes, ref_bytes)
                    if norm is None:
                        logger.warning("[ImageGen] 跳过无法标准化的参考图 #%d | record=%s", i, record_id)
                        continue
                    azure_ref_images.append((norm, f"ref{i}.png", "image/png"))
                if not azure_ref_images:
                    logger.warning("[ImageGen] 所有参考图标准化失败，退化为文生图 | record=%s", record_id)
                    azure_ref_images = None

            # 并发生成 N 张（部分失败不阻断，全失败才报错）
            gen_results = await asyncio.gather(
                *[
                    _generate_single_image(
                        provider, effective_prompt, size, refs,
                        minio_svc=minio_svc, user_id=user_id, azure_ref_images=azure_ref_images,
                    )
                    for _ in range(count)
                ],
                return_exceptions=True,
            )
            file_paths: list[str] = [r for r in gen_results if isinstance(r, str)]
            for r in gen_results:
                if isinstance(r, Exception):
                    logger.warning("[ImageGen] one image failed | record=%s err=%s", record_id, r)
            if not file_paths:
                raise RuntimeError("所有图片生成均失败")

            file_path = file_paths[0]
            logger.info("[ImageGen] Stored %d/%d to MinIO | first=%s record=%s",
                        len(file_paths), count, file_path, record_id)

            # 缩略图（首图）：只产出本地 thumb_path，先不碰 DB 行
            thumb_path: str | None = None
            try:
                img_bytes = await minio_svc.get_object_bytes(file_path)
                from app.services.video_service import extract_image_thumbnail
                thumb_bytes = await extract_image_thumbnail(img_bytes)
                thumb_path = await minio_svc.upload_bytes(
                    thumb_bytes, "generated/thumbnails", user_id, "jpg", "image/jpeg"
                )
                logger.info("[ImageGen] thumbnail uploaded: %s", thumb_path)
            except Exception as thumb_err:
                logger.warning("[ImageGen] image thumbnail skipped: %s", thumb_err)

            # 发布元数据/文案：图文动态(layout=dynamic)用专门的「图文文案写手」写真正的种草文案，
            # 普通图片仍用通用 metadata。含一次 LLM 调用（~1-2s）——放在回写 DB 行之前完成，
            # 避免长时间持有该行（期间若被用户删除会导致最终 flush 报 StaleDataError）。
            meta: dict = {}
            try:
                if is_dynamic:
                    from app.agents.metadata_agent import generate_dynamic_post
                    meta = await generate_dynamic_post(prompt=prompt, brand_info=brand_info)
                else:
                    from app.agents.metadata_agent import generate_publish_metadata
                    meta = await generate_publish_metadata(
                        content_type="image", text=prompt, brand_info=brand_info
                    )
            except Exception as meta_err:  # noqa: BLE001
                logger.warning("[ImageGen] publish metadata skipped: %s", meta_err)

            # 重活全部完成后，重新取一次记录并在极短事务内一次性回写。
            # 期间记录可能已被用户从「内容库」删除 → 取不到则优雅跳过，不报错。
            db.expunge_all()
            record = (
                await db.execute(select(GeneratedContent).where(GeneratedContent.id == record_id))
            ).scalar_one_or_none()
            if record is None:
                logger.info("[ImageGen] record %s 在生成期间已被删除，跳过入库", record_id)
                return

            record.file_path = file_path
            record.media_urls = file_paths if len(file_paths) > 1 else None
            if thumb_path:
                record.thumbnail_path = thumb_path
            record.status = "completed"
            if meta.get("description"):
                record.description = meta["description"]
            if meta.get("tags"):
                record.tags = meta["tags"]
            # title：用户没传才用 LLM 标题（orig_title 当前 = body.title or prompt[:100]）；
            # 定时任务 prefer_generated_title=True：record 预置的是「规则名」占位，强制用 LLM 标题。
            if meta.get("title") and (prefer_generated_title or not orig_title or orig_title == prompt[:100]):
                record.title = meta["title"]

            await db.flush()

            # 扣分（事后扣；失败仅 warn 不阻塞）—— 按实际生成张数逐张计费
            for _ in file_paths:
                await _charge_image(
                    db, user_id=user_id,
                    model_id=_resolve_image_model_id(provider),
                    size=size,
                    record_id=str(record_id),
                )

            await db.commit()
            logger.info("[ImageGen] record %s → completed ✓ (%d images)", record_id, len(file_paths))

            await _maybe_auto_distribute(db, record)

        except Exception as e:
            logger.exception("[ImageGen] FAILED for record %s | error: %s", record_id, e)
            # 用全新 session 落 failed，避免主 session 事务已损坏导致状态卡在 generating
            try:
                async with async_session_factory() as err_db:
                    err_record = await err_db.get(GeneratedContent, record_id)
                    if err_record:
                        err_record.status = "failed"
                        err_record.error_message = str(e)[:2000]
                        await err_db.commit()
            except Exception:
                logger.warning("[ImageGen] could not update failed status for record %s", record_id)


def _build_video_prompt(prompt: str, brand_info: str | None, skill_prompt: str | None = None) -> str:
    """将 skill 创作技巧 + 品牌信息追加到视频生成提示词中。"""
    parts = [prompt]
    if skill_prompt and skill_prompt.strip():
        parts.append(f"[创作技巧]\n{skill_prompt.strip()}")
    if brand_info and brand_info.strip():
        parts.append(f"[品牌参考信息]\n{brand_info.strip()}")
    from app.services.llm_service import log_system_layers
    log_system_layers([
        ("生视频提示词(用户)", prompt),
        ("创作大师", skill_prompt),
        ("品牌/参考内容", brand_info),
    ], title="生视频 Prompt")
    return "\n\n".join(parts)


async def _run_video_generation_async(
    record_id: str,
    prompt: str,
    user_id: str,
    provider: str,
    resolution: str,
    duration: int,
    image_url: str | None,
    last_image_url: str | None = None,
    brand_info: str | None = None,
    skill_prompt: str | None = None,
    enable_audio: bool = True,
    prefer_generated_title: bool = False,  # 定时任务：record 预置的是规则名占位，强制用 LLM 标题
) -> None:
    from app.core.database import async_session_factory
    from app.services.minio_service import MinIOService

    # 尾帧必须与首帧成对：只给尾帧没意义，丢弃
    if last_image_url and not image_url:
        last_image_url = None

    # 兜底再 clamp 一次时长，防止 Agent / 老客户端绕过 schema 校验
    if duration < 1:
        duration = 1
    elif duration > 15:
        logger.warning("[VideoGen] duration %s 超过模型上限，clamp 到 15s", duration)
        duration = 15

    logger.info(
        "[VideoGen] BG task started | record=%s provider=%s resolution=%s duration=%s audio=%s image_url=%s",
        record_id, provider, resolution, duration, enable_audio, image_url,
    )

    # 选了「创作大师」(提示词工程类 skill)：用 LLM 把需求优化成专业视频提示词；
    # 否则只把品牌/参考信息拼到用户提示词后（视频模型直接渲染，不会执行 skill 指令）。
    if skill_prompt and skill_prompt.strip():
        from app.agents.metadata_agent import optimize_video_prompt
        optimized = await optimize_video_prompt(prompt, skill_prompt, brand_info)
        effective_prompt = _build_video_prompt(optimized, brand_info if optimized == prompt else None, None)
        logger.info("[VideoGen] record=%s 创作大师优化后提示词: %r", record_id, effective_prompt[:160])
    else:
        effective_prompt = _build_video_prompt(prompt, brand_info, None)

    async with async_session_factory() as db:
        try:
            result = await db.execute(
                select(GeneratedContent).where(GeneratedContent.id == record_id)
            )
            record = result.scalar_one_or_none()
            if not record:
                logger.warning("[VideoGen] record %s not found in DB, aborting", record_id)
                return

            record.status = "generating"
            await db.flush()
            await db.commit()  # 立即提交，让前端轮询能读到 generating 状态
            logger.info("[VideoGen] record %s → generating, calling provider=%s", record_id, provider)

            if provider == "tencent":
                from app.services.tencent_vod_client import generate_video as tc_gen
                logger.info("[VideoGen] Calling Tencent generate_video | prompt=%r resolution=%s duration=%s audio=%s",
                            effective_prompt[:120], resolution, duration, enable_audio)
                remote_url = await tc_gen(
                    effective_prompt, resolution=resolution.upper(), duration=duration,
                    image_url=image_url, last_image_url=last_image_url, enable_audio=enable_audio,
                )
            else:
                from app.services.doubao_client import generate_video as db_gen
                logger.info("[VideoGen] Calling Doubao generate_video | prompt=%r resolution=%s duration=%s audio=%s",
                            effective_prompt[:120], resolution, duration, enable_audio)
                remote_url = await db_gen(
                    effective_prompt, resolution=resolution, duration=duration,
                    image_url=image_url, last_image_url=last_image_url, enable_audio=enable_audio,
                )

            logger.info("[VideoGen] Provider returned remote_url=%s | record=%s", remote_url, record_id)

            minio_svc = MinIOService()
            file_path = await minio_svc.download_and_store(remote_url, "generated/videos", user_id)
            logger.info("[VideoGen] Stored to MinIO: %s | record=%s", file_path, record_id)

            try:
                video_bytes = await minio_svc.get_object_bytes(file_path)
                from app.services.video_service import extract_thumbnail, probe_video
                meta = await probe_video(video_bytes)
                duration = meta.get("duration", 0)
                seek = min(5.0, duration * 0.1) if duration > 0 else 0.0
                thumb_bytes = await extract_thumbnail(video_bytes, seek_sec=seek)
                record.thumbnail_path = await minio_svc.upload_bytes(
                    thumb_bytes, "generated/thumbnails", user_id, "jpg", "image/jpeg"
                )
                logger.info("[VideoGen] thumbnail uploaded: %s", record.thumbnail_path)
            except Exception as thumb_err:
                logger.warning("[VideoGen] video thumbnail skipped: %s", thumb_err)

            record.file_path = file_path
            record.status = "completed"

            # 生成发布元数据（标题/描述/标签），基于提示词；失败仅 warn 不影响已完成的生成
            try:
                from app.agents.metadata_agent import generate_publish_metadata
                meta = await generate_publish_metadata(
                    content_type="video", text=prompt, brand_info=brand_info
                )
                if meta.get("description"):
                    record.description = meta["description"]
                if meta.get("tags"):
                    record.tags = meta["tags"]
                # title：用户没传才用 LLM 标题（record.title 当前 = body.title or prompt[:100]）；
                # 定时任务 prefer_generated_title=True：record 预置的是「规则名」占位，强制用 LLM 标题。
                if meta.get("title") and (prefer_generated_title or not record.title or record.title == prompt[:100]):
                    record.title = meta["title"]
            except Exception as meta_err:  # noqa: BLE001
                logger.warning("[VideoGen] publish metadata skipped: %s", meta_err)

            await db.flush()

            # 扣分（用真实时长，没拿到则用请求时长）
            actual_seconds = float(duration) if duration else 5.0
            await _charge_video(
                db, user_id=user_id,
                model_id=_resolve_video_model_id(provider),
                resolution=resolution,
                seconds=actual_seconds,
                record_id=str(record_id),
            )

            await db.commit()
            logger.info("[VideoGen] record %s → completed ✓", record_id)

            await _maybe_auto_distribute(db, record)
        except Exception as e:
            logger.exception("[VideoGen] FAILED for record %s | error: %s", record_id, e)
            try:
                err_result = await db.execute(
                    select(GeneratedContent).where(GeneratedContent.id == record_id)
                )
                err_record = err_result.scalar_one_or_none()
                if err_record:
                    err_record.status = "failed"
                    err_record.error_message = str(e)[:2000]
                    await db.flush()
                    await db.commit()
            except Exception:
                await db.rollback()


# ---------------------------------------------------------------------------
# 计费辅助
# ---------------------------------------------------------------------------

def _resolve_image_model_id(provider: str | None) -> str:
    """根据 provider 字段映射到 billing_configuration 里的 model id。"""
    p = (provider or "").lower()
    if p == "tencent":
        return "tencent-gem"
    if p == "azure":
        # 与 AZURE_IMAGE_MODEL 部署名一致，便于在管理后台单独配置该模型的积分单价
        return settings.AZURE_IMAGE_MODEL
    return "doubao-seedream-5-0-260128"


def _resolve_video_model_id(provider: str | None) -> str:
    if (provider or "").lower() == "tencent":
        return "tencent-kling-3-0"
    return "doubao-seedance-2-0-260128"


async def _charge_article(
    db: AsyncSession,
    *,
    user_id: str,
    text: str,
    model_id: str | None,
    record_id: str | None,
) -> None:
    """文章扣分：按字符数 / 4 估算 token。"""
    tokens = max(1, len(text or "") // 4)
    try:
        credits, meta = await credits_for_text(db, tokens=tokens, model_id=model_id)
        await consume_points(
            db, user_id, credits,
            biz_type="article",
            biz_ref_type="generated_content",
            biz_ref_id=record_id,
            model_id=meta["model_id"],
            unit_price=meta["unit_price"],
            units=meta["units"],
            remark=f"文章生成 · {model_id or 'auto'}",
            allow_partial=True,  # 后付费：余额不足扣到 0，避免少量余额无限白嫖
        )
    except QuotaExceededError as e:
        logger.warning("article consume_points failed user=%s: %s", user_id, e.message)
    except Exception:  # noqa: BLE001
        logger.warning("article consume_points unexpected error", exc_info=True)


async def _charge_image(
    db: AsyncSession,
    *,
    user_id: str,
    model_id: str,
    size: str,
    record_id: str | None,
) -> None:
    try:
        credits, meta = await credits_for_image(db, model_id=model_id, size=size)
        await consume_points(
            db, user_id, credits,
            biz_type="image",
            biz_ref_type="generated_content",
            biz_ref_id=record_id,
            model_id=meta["model_id"],
            unit_price=meta["unit_price"],
            units=meta["units"],
            remark=f"图片生成 · {model_id} · {size}",
            allow_partial=True,  # 后付费：余额不足扣到 0，避免少量余额无限白嫖
        )
    except QuotaExceededError as e:
        logger.warning("image consume_points failed user=%s: %s", user_id, e.message)
    except Exception:  # noqa: BLE001
        logger.warning("image consume_points unexpected error", exc_info=True)


async def _charge_video(
    db: AsyncSession,
    *,
    user_id: str,
    model_id: str,
    resolution: str,
    seconds: float,
    record_id: str | None,
) -> None:
    try:
        credits, meta = await credits_for_video(
            db, model_id=model_id, resolution=resolution, seconds=seconds
        )
        await consume_points(
            db, user_id, credits,
            biz_type="video",
            biz_ref_type="generated_content",
            biz_ref_id=record_id,
            model_id=meta["model_id"],
            unit_price=meta["unit_price"],
            units=meta["units"],
            remark=f"视频生成 · {model_id} · {resolution} · {int(seconds)}s",
            allow_partial=True,  # 后付费：余额不足扣到 0，避免少量余额无限白嫖
        )
    except QuotaExceededError as e:
        logger.warning("video consume_points failed user=%s: %s", user_id, e.message)
    except Exception:  # noqa: BLE001
        logger.warning("video consume_points unexpected error", exc_info=True)


async def _maybe_auto_distribute(db: AsyncSession, record: GeneratedContent) -> None:
    """生成完成钩子：若关联了 schedule_id 且规则启用自动分发，则触发分发。
    包 try/except —— 分发问题绝不连坐生成结果。
    """
    schedule_id = (record.parameters or {}).get("schedule_id") if record.parameters else None
    if not schedule_id:
        return
    try:
        await auto_distribute_service.dispatch_for_record(db, record, str(schedule_id))
        await db.commit()
    except Exception:  # noqa: BLE001
        logger.warning("auto distribute failed for record=%s", record.id, exc_info=True)
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass
