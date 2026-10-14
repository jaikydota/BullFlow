"""LangGraph Agent 工具集。

所有工具通过 RunnableConfig 的 configurable 字段接收请求级上下文（user_id、db），
避免使用全局状态，保证多租户隔离。

调用方需在 graph.ainvoke / graph.astream_events 时传入：
    config = {"configurable": {"user_id": ..., "db": ...}}
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

logger = logging.getLogger(__name__)

# 持有后台生成任务的强引用：裸 asyncio.create_task 的 task 可能在执行中途被 GC，
# 且不被引用时易随触发它的请求/事件循环收尾被取消。这里强引用直到任务结束。
_BG_TASKS: set[asyncio.Task] = set()


def _spawn_bg(coro) -> None:
    task = asyncio.create_task(coro)
    _BG_TASKS.add(task)
    task.add_done_callback(_BG_TASKS.discard)

# 工具返回中携带的结构化 chunks 的 key，便于 chat_graph 从 ToolMessage 中提取
CHUNKS_META_KEY = "__chunks__"
# 生成工具返回中携带的生成结果标识 key
GENERATION_META_KEY = "generation_id"
# 导出工具返回标识 key
EXPORT_RESULT_KEY = "__export_result__"

# 各生图 provider 的默认尺寸（LLM 漏给 / 给错 size 时兜底）
_IMAGE_DEFAULT_SIZE = {"azure": "1024x1024", "doubao": "2560x1440", "tencent": "1920x1080"}


def _normalize_image_size(provider: str, size: str) -> str:
    """校正 size 以匹配 provider，避免 LLM 切了 provider 却没改 size 导致 API 报错。

    - doubao(Seedream) 要求 ≥3,686,400 像素，不达标回退该 provider 默认尺寸；
    - 其余 provider 暂直接放行（azure 自定义尺寸约束由其 API 校验）。
    """
    if provider == "doubao":
        try:
            w_str, h_str = size.lower().split("x")
            if int(w_str) * int(h_str) >= 3_686_400:
                return size
        except (ValueError, AttributeError):
            pass
        return _IMAGE_DEFAULT_SIZE["doubao"]
    return size or _IMAGE_DEFAULT_SIZE.get(provider, "1024x1024")


@tool
async def knowledge_search(query: str, config: RunnableConfig) -> str:
    """搜索企业知识库，返回与用户问题相关的产品、品牌、客户、案例、文档等信息。

    当用户提问涉及企业专属信息时调用此工具。
    可以多次调用，使用不同关键词以获取更全面的信息。
    """
    configurable = config.get("configurable", {})
    user_id: str = configurable["user_id"]
    db = configurable["db"]
    top_k: int = configurable.get("knowledge_top_k", 5)

    from app.services.knowledge_service import hybrid_search

    try:
        chunks: list[dict[str, Any]] = await hybrid_search(
            query=query,
            user_id=user_id,
            db=db,
            top_k=top_k,
        )
    except Exception:
        logger.warning("knowledge_search 工具执行失败", exc_info=True)
        return json.dumps({"error": "知识库检索失败，请稍后再试。"}, ensure_ascii=False)

    if not chunks:
        return json.dumps({"result": "知识库中未找到相关内容。"}, ensure_ascii=False)

    # 构建 LLM 可读的文本段落
    text_parts: list[str] = []
    for c in chunks:
        title = c.get("document_title", "未知文档")
        content = c.get("content_expanded") or c.get("content", "")
        heading = c.get("heading_context", "")
        part = f"[来源: {title}]"
        if heading:
            part += f" [{heading}]"
        part += f"\n{content}"
        text_parts.append(part)

    readable = "\n\n---\n\n".join(text_parts)

    # 附加结构化 chunks（供 chat_graph 提取并存入 context_chunks 状态）
    structured_chunks = [
        {
            "chunk_id": c.get("chunk_id", ""),
            "document_id": c.get("document_id", ""),
            "document_title": c.get("document_title", ""),
            "file_name": c.get("file_name", ""),
            "file_type": c.get("file_type", ""),
            "score": c.get("score", 0.0),
            "content": c.get("content") or c.get("content_expanded", ""),
        }
        for c in chunks
    ]

    return json.dumps(
        {"result": readable, CHUNKS_META_KEY: structured_chunks},
        ensure_ascii=False,
    )


@tool
async def generate_article_content(
    config: RunnableConfig,
    prompt: str,
    brand_info: str | None = None,
    title: str | None = None,
    mixed: bool = False,
) -> str:
    """根据提示词生成一篇营销文章，保存到内容库并返回生成记录 ID。

    适用于：撰写社交媒体文案、产品介绍、营销推文、品牌故事等。
    brand_info 可传入品牌/产品背景信息，使内容更贴合品牌调性。
    system prompt 中已有企业基础信息，无需重复传入；当需要知识库中更详细的产品/客户数据时，
    请先调用 knowledge_search 获取后再传入 brand_info。

    图文混编（mixed=True）：生成「正文内嵌配图」的**长文/文章**，发布时对应国内分发的
    **「文章」(article)** 类型。仅适用于**支持发文章的平台**：微信公众号、今日头条号文章、
    百家号、知乎文章、B 站专栏、抖音图文文章等。例如「生成一篇发今日头条号的图文文章/图文内容」
    「写篇带配图的公众号推文」应 mixed=True。系统会让模型在正文标注配图位置并自动生成内嵌配图
    （随机 1–3 张），异步任务，立即返回 pending 记录 ID，前端卡片轮询展示带内嵌图的图文。
    ⚠️ mixed=True 时，prompt 里**只写文章内容/主题/字数/风格要求即可，不要自己加「预留配图位置」
    「用【配图建议：…】标注」之类的指令**——配图位置由系统统一处理，你额外加的标注会干扰配图。

    ⚠️ 严格区分，不要混用：小红书、新浪微博、抖音图文这类**只支持「图文动态」**的平台，
    用户要发「图文」时**不要**用 mixed，应改用 generate_image_content(count=N, as_dynamic=True)
    生成「图文分离」的多图动态。纯文字文案（无需配图）时 mixed=False。
    """
    configurable = config.get("configurable", {})
    user_id: str = configurable["user_id"]

    from app.agents.article_agent import generate_article
    from app.core.database import async_session_factory
    from app.models.generated_content import GeneratedContent

    # 图文混编：异步生成（正文 + 并发配图），立即返回 pending 记录
    if mixed:
        import random as _random

        from app.api.v1.generation import _run_mixed_article_async
        from app.core.config import settings as _settings

        _min = max(1, _settings.MIXED_ARTICLE_IMAGE_MIN)
        _max = max(_min, _settings.MIXED_ARTICLE_IMAGE_MAX)
        n = _random.randint(_min, _max)
        try:
            async with async_session_factory() as save_db:
                record = GeneratedContent(
                    user_id=user_id,
                    type="article",
                    layout="mixed",
                    title=title or prompt[:100],
                    prompt=prompt,
                    parameters={"brand_info": brand_info, "mixed_image_count": n},
                    status="pending",
                )
                save_db.add(record)
                await save_db.flush()
                record_id = record.id
                await save_db.commit()

            _spawn_bg(
                _run_mixed_article_async(
                    record_id=record_id,
                    prompt=prompt,
                    user_id=user_id,
                    provider=None,
                    model=None,
                    brand_info=brand_info,
                    skill_prompt=None,
                    use_knowledge=True,
                    image_count=n,
                )
            )
            return json.dumps(
                {
                    GENERATION_META_KEY: record_id,
                    "type": "article",
                    "status": "pending",
                    "title": title or prompt[:80],
                    "preview_info": {},
                },
                ensure_ascii=False,
            )
        except Exception as e:
            logger.exception("generate_article_content(mixed) 工具失败")
            return json.dumps({"error": f"图文混编文章生成失败：{e}"}, ensure_ascii=False)

    try:
        # 文章生成（非流式，使用独立 DB session 做知识库查询）
        async with async_session_factory() as gen_db:
            result = await generate_article(
                prompt=prompt,
                user_id=user_id,
                db=gen_db,
                brand_info=brand_info,
                use_knowledge=True,
                stream=False,
            )
        content: str = result.get("content", "")

        # 保存到内容库
        async with async_session_factory() as save_db:
            record = GeneratedContent(
                user_id=user_id,
                type="article",
                title=title or prompt[:100],
                content=content,
                prompt=prompt,
                parameters={"brand_info": brand_info},
                status="completed",
            )
            save_db.add(record)
            await save_db.flush()
            record_id = record.id
            await save_db.commit()

        return json.dumps(
            {
                GENERATION_META_KEY: record_id,
                "type": "article",
                "status": "completed",
                "title": title or prompt[:80],
                "preview_info": {"content": content[:300]},
            },
            ensure_ascii=False,
        )
    except Exception as e:
        logger.exception("generate_article_content 工具失败")
        return json.dumps({"error": f"文章生成失败：{e}"}, ensure_ascii=False)


@tool
async def generate_image_content(
    config: RunnableConfig,
    prompt: str,
    size: str = "1024x1024",
    provider: str = "azure",
    brand_info: str | None = None,
    title: str | None = None,
    use_reference_image: bool = True,
    count: int = 1,
    as_dynamic: bool = False,
) -> str:
    """根据提示词生成图片，返回生成记录 ID（图片在后台异步生成，可通过 ID 查询进度）。

    适用于：生成产品配图、营销海报、社交媒体封面等。
    provider 默认 azure（GPT-Image-2），可选 doubao / tencent：
    - azure   (GPT-Image-2): size 1024x1024 / 1536x1024 / 1024x1536 / 2048x1152 / 1152x2048 / 2048x2048
    - doubao  (Seedream 5.0): size 2560x1440 / 1440x2560 / 1920x1920（要求 ≥3,686,400 像素）
    - tencent (Nano Banana 2): size 1920x1920 / 1920x1080 / 1080x1920
    切换 provider 时务必同时选用该 provider 支持的 size。

    一次生成多张：当用户要「多张图 / 一组图 / 发图文动态」时，把 count 设为需要的张数（1–9）。
    as_dynamic=True 表示这组图作为**「图文分离」动态**发布（多图 + 自动生成的发布文案），发布时
    对应国内分发的 **「图文」(dynamic)** 类型。**小红书图文、新浪微博图文、抖音图文、今日头条
    微头条**等只支持图文动态的平台，用户要发「图文」时就用这个（count=N, as_dynamic=True），
    例如「生成 3 张图发小红书图文」「做条带图的微博」。
    注意：要发「文章」类型（公众号/头条号文章等正文内嵌图）的应改用 generate_article_content(mixed=True)。

    参考图（图生图）：当用户在对话中"挂载"了参考图片时，本工具会**自动**把参考图传给生图
    模型做参考生成。仅当用户明确表示"不要参考这张图/忽略图片"时，才把 use_reference_image 设为 False。

    图片生成为异步任务，调用后立即返回 pending 状态的记录 ID，生成完成后状态变为 completed。
    """
    configurable = config.get("configurable", {})
    user_id: str = configurable["user_id"]

    # 取用户挂载的参考图，按该 provider 支持的数量上限裁剪（多图参考）
    from app.core.config import settings as _settings
    from app.core.media_limits import clamp_image_refs
    mounted: list[str] = configurable.get("reference_image_urls") or []
    ref_images: list[str] = clamp_image_refs(provider, mounted) if use_reference_image else []
    size = _normalize_image_size(provider, size)
    count = max(1, min(count, _settings.IMAGE_BATCH_MAX))

    from app.core.database import async_session_factory
    from app.models.generated_content import GeneratedContent

    try:
        # 创建 pending 记录，立即返回
        async with async_session_factory() as save_db:
            record = GeneratedContent(
                user_id=user_id,
                type="image",
                layout="dynamic" if as_dynamic else None,
                title=title or prompt[:100],
                prompt=prompt,
                model_provider=provider,
                parameters={
                    "size": size,
                    "brand_info": brand_info,
                    "image_url": ref_images[0] if ref_images else None,  # 兼容旧字段
                    "image_urls": ref_images,
                    "count": count,
                    "as_dynamic": as_dynamic,
                },
                status="pending",
            )
            save_db.add(record)
            await save_db.flush()
            record_id = record.id
            await save_db.commit()

        # 异步后台执行图片生成（复用 generation.py 中的逻辑）
        from app.api.v1.generation import _run_image_generation_async
        _spawn_bg(
            _run_image_generation_async(
                record_id=record_id,
                prompt=prompt,
                user_id=user_id,
                provider=provider,
                size=size,
                image_urls=ref_images,
                brand_info=brand_info,
                count=count,
            )
        )

        return json.dumps(
            {
                GENERATION_META_KEY: record_id,
                "type": "image",
                "status": "pending",
                "title": title or prompt[:80],
                "preview_info": {},
            },
            ensure_ascii=False,
        )
    except Exception as e:
        logger.exception("generate_image_content 工具失败")
        return json.dumps({"error": f"图片生成失败：{e}"}, ensure_ascii=False)


@tool
async def generate_video_content(
    config: RunnableConfig,
    prompt: str,
    resolution: str = "1080p",
    duration: int = 5,
    provider: str = "doubao",
    brand_info: str | None = None,
    title: str | None = None,
    enable_audio: bool = True,
) -> str:
    """根据提示词生成一段视频，返回生成记录 ID（视频在后台异步生成，可通过 ID 查询进度）。

    适用于：生成产品展示视频、营销短视频等。
    resolution 默认 1080p；duration 默认 5 秒，**仅支持 1-15 秒（模型上限）**，
    超过 15 秒会被自动 clamp 到 15 秒。enable_audio 默认 True（生成带背景音/音效的视频）。
    视频生成为异步任务，调用后立即返回 pending 状态的记录 ID，视频生成完成后状态变为 completed。
    """
    configurable = config.get("configurable", {})
    user_id: str = configurable["user_id"]

    # 防止 Agent 传入超出模型上限的 duration（超过 15s 第三方会直接调用失败）
    original_duration = duration
    if duration < 1:
        duration = 1
    elif duration > 15:
        duration = 15
    if original_duration != duration:
        logger.warning(
            "[Tool:generate_video] duration %s 超出模型范围 [1, 15]，已 clamp 为 %s",
            original_duration, duration,
        )

    from app.core.database import async_session_factory
    from app.models.generated_content import GeneratedContent

    try:
        # 先创建 pending 记录，立即返回
        async with async_session_factory() as save_db:
            record = GeneratedContent(
                user_id=user_id,
                type="video",
                title=title or prompt[:100],
                prompt=prompt,
                model_provider=provider,
                parameters={
                    "resolution": resolution,
                    "duration": duration,
                    "enable_audio": enable_audio,
                    "brand_info": brand_info,
                },
                status="pending",
            )
            save_db.add(record)
            await save_db.flush()
            record_id = record.id
            await save_db.commit()

        # 异步后台执行视频生成（复用 generation.py 中的逻辑）
        from app.api.v1.generation import _run_video_generation_async
        _spawn_bg(
            _run_video_generation_async(
                record_id=record_id,
                prompt=prompt,
                user_id=user_id,
                provider=provider,
                resolution=resolution,
                duration=duration,
                image_url=None,
                brand_info=brand_info,
                enable_audio=enable_audio,
            )
        )

        return json.dumps(
            {
                GENERATION_META_KEY: record_id,
                "type": "video",
                "status": "pending",
                "title": title or prompt[:80],
                "preview_info": {},
            },
            ensure_ascii=False,
        )
    except Exception as e:
        logger.exception("generate_video_content 工具失败")
        return json.dumps({"error": f"视频生成失败：{e}"}, ensure_ascii=False)


@tool
async def create_customer(
    name: str,
    config: RunnableConfig,
    company_name: str | None = None,
    region: str | None = None,
    industry: str | None = None,
    contact_email: str | None = None,
    contact_phone: str | None = None,
    description: str | None = None,
    tags: list[str] | None = None,
) -> str:
    """在知识库中新建一条客户信息记录。

    name（客户姓名）为必填项，其余字段均为可选：
    - company_name：客户所属公司名称
    - region：所在地区或国家
    - industry：所属行业
    - contact_email：联系邮箱
    - contact_phone：联系电话
    - description：客户背景描述
    - tags：自定义标签列表，如 ["跨境电商", "大客户"]

    当用户提出新建客户但信息不足时，主动告知哪些字段还未提供（至少需要客户姓名）。
    创建成功后告知用户，并提供查看客户列表的链接。
    """
    configurable = config.get("configurable", {})
    user_id: str = configurable["user_id"]

    from app.core.database import async_session_factory
    from app.schemas.customer import CustomerCreate
    from app.services.customer_service import CustomerService

    try:
        body = CustomerCreate(
            name=name,
            company_name=company_name,
            region=region,
            industry=industry,
            contact_email=contact_email,
            contact_phone=contact_phone,
            description=description,
            tags=tags,
        )
        async with async_session_factory() as db:
            svc = CustomerService(db)
            obj = await svc.create(user_id, body)
            await db.commit()

        return json.dumps(
            {
                "success": True,
                "customer_id": obj.id,
                "name": obj.name,
                "company_name": obj.company_name,
                "region": obj.region,
                "industry": obj.industry,
                "contact_email": obj.contact_email,
                "contact_phone": obj.contact_phone,
                "tags": obj.tags,
            },
            ensure_ascii=False,
        )
    except Exception as e:
        logger.exception("create_customer 工具失败")
        return json.dumps({"error": f"创建客户失败：{e}"}, ensure_ascii=False)


@tool
async def export_article_content(
    config: RunnableConfig,
    generation_id: str,
    fmt: str = "pdf",
) -> str:
    """将已生成的文章导出为 PDF 或 Word 文件，并返回可下载链接。

    适用场景：
    - 用户刚生成文章后请求导出（generation_id 来自本次 generate_article_content 的返回值）
    - 用户对历史文章请求导出（generation_id 来自对话历史中 [已生成文章] 标注）

    fmt 参数：
    - "pdf"  → 导出为 PDF（默认）
    - "docx" → 导出为 Word 文档
    """
    configurable = config.get("configurable", {})
    user_id: str = configurable["user_id"]

    from app.core.database import async_session_factory
    from app.services.export_service import export_article

    try:
        async with async_session_factory() as db:
            download_url = await export_article(generation_id, user_id, fmt, db)

        # 取文章标题用于展示
        from app.models.generated_content import GeneratedContent
        from sqlalchemy import select
        async with async_session_factory() as db2:
            res = await db2.execute(
                select(GeneratedContent.title).where(GeneratedContent.id == generation_id)
            )
            title = res.scalar_one_or_none() or generation_id[:40]

        return json.dumps(
            {
                EXPORT_RESULT_KEY: {
                    "generation_id": generation_id,
                    "format": fmt,
                    "download_url": download_url,
                    "title": title,
                }
            },
            ensure_ascii=False,
        )
    except ValueError as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)
    except Exception as e:
        logger.exception("export_article_content 工具失败")
        return json.dumps({"error": f"导出失败：{e}"}, ensure_ascii=False)


# 工具列表（后续可在此扩展更多工具）
AGENT_TOOLS = [
    knowledge_search,
    generate_article_content,
    generate_image_content,
    generate_video_content,
    export_article_content,
    create_customer,
]
