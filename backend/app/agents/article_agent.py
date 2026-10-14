"""Article generation agent: knowledge retrieval -> brand injection -> LLM -> output."""
from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.tools.knowledge_tool import run_knowledge_search
from app.core.config import settings
from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)

# ARTICLE_SYSTEM_PROMPT 的 4 个注入槽（都在用，按条件出现，对应内容为空时 .format 后只是空串、自动省略）：
#   {skill_context}     —— 仅用户选了「创作大师」(skill) 时填：把该 skill 的提示词作为风格/技巧指令
#   {brand_context}     —— 「参考内容」解析出的企业档案 / 品牌信息（auto=按档案，custom=勾选的公司/品牌/产品/客户/案例）
#   {knowledge_context} —— 「参考内容=检索知识库」时按提示词检索到的知识库片段；其余模式为空
#   {mixed_context}     —— 仅「图文混编」(mixed=True) 时填：MIXED_IMAGE_INSTRUCTION，要求正文插入 [[IMG: 描述]] 配图占位符。
#                          ⚠️ 故意放在 system **最末尾**（知识库之后），让这条关键指令处于模型注意力最高位置，避免被长知识库稀释
# 这些是「拼接进同一段 system」，所以最终发给模型是一整串；run 时用 log_system_layers 分层打印每段内容，便于排查。
ARTICLE_SYSTEM_PROMPT = """你是一位资深的内容写手。本次是**自动化生成任务**：输出直接入库展示，没有后续对话。严格遵守：

【输出格式】
- 第一个字符就是正文，禁止任何引导语（如「好的，以下是…」「这是一篇为您撰写的…」）。
- 文章结尾即文末，禁止任何追问或备选建议（如「需要英文版吗？」「还可以调整为…」）。
- 不复述提示词、不加元说明。

【写作风格 · 去 AI 味】
- 不用万能套话和空洞形容词堆砌（「精心打造」「高效优质专业可靠」等），卖点要有具体场景 / 数据 / 案例支撑。
- 不用「行货」结尾（「选择 X 就是选择 Y」「开启新篇章」「值得信赖」等）。
- 像真人写：有细节、有口语感，避免句句四平八稳；hashtag 仅在必要时用且紧扣内容。

【事实性】
- 只基于下方参考内容与知识库撰写，用户没给的事实不要编造；信息不足就简短写，宁短勿凑。

【遵循指令】
- 用户在提示词里写了字数 / 平台 / 风格 / 标签就严格照做；没写就按主题选合适的篇幅与语气。
{skill_context}
{brand_context}

{knowledge_context}
{mixed_context}"""

# 图文混编模式追加的 system 段（拼在 system 最末尾，优先级最高）：要求 LLM 在正文标注图片占位符
MIXED_IMAGE_INSTRUCTION = """

————————————————————————————
【图文混编 · 最高优先级，必须执行】
本文要做成「图文混编」。你**必须**在正文中**恰好 {n} 处**最适合配图的位置，各插入一行独立的图片占位标记：
[[IMG: 一句具体的画面描述]]

⚠️ 最关键：插入 [[IMG: ...]] 占位**就是本系统「自动配图」的实现方式**。
- 即使用户提示词里说「配图位置由系统自动处理」「不要手动标注配图占位」「不要标注配图位置」之类，
  你也**必须**插入这 {n} 个 [[IMG: ...]] 标记——这正是「系统自动处理」所需，**不算违背用户**。
- 不要改用「【配图建议：…】」「（配图：…）」等任何其它写法，**只能**用 [[IMG: ...]]。

其它要求：
- 占位标记**独占一行**，与上下文各留一个空行；描述要画面化、具体（场景/主体/风格/氛围），禁止「这里放一张图」这类空话。
- 不要插在文章第一行之前；标记自然分布在正文中部。
- 除这 {n} 个 [[IMG: ...]] 外，禁止输出任何其它图片语法（如 markdown ![]() 或 【配图…】）。
"""


async def generate_article(
    prompt: str,
    user_id: str,
    db: AsyncSession,
    *,
    provider: str | None = None,
    model: str | None = None,
    brand_info: str | None = None,
    skill_prompt: str | None = None,
    use_knowledge: bool = True,
    top_k: int = 5,
    stream: bool = False,
    mixed: bool = False,
    image_count: int = 0,
    **kwargs: Any,
) -> dict[str, Any] | AsyncIterator[str]:
    """
    Generate an article using RAG + brand context.
    """
    knowledge_context = ""
    context_chunks: list[dict] = []

    if use_knowledge:
        need_retrieval = True
        search_query = prompt

        if settings.ADAPTIVE_RETRIEVAL_ENABLED:
            from app.agents.chat_agent import _should_retrieve

            need_retrieval, search_query = await _should_retrieve(
                prompt, provider=provider, model=model
            )

        if need_retrieval:
            try:
                context_chunks = await run_knowledge_search(
                    query=search_query, user_id=user_id, db=db, top_k=top_k
                )
                if context_chunks:
                    parts = [
                        f"[{c.get('document_title', '')}] {c.get('content_expanded') or c['content']}"
                        for c in context_chunks
                    ]
                    knowledge_context = "参考资料：\n" + "\n\n".join(parts)
            except Exception:
                logger.warning(
                    "Knowledge search failed for article generation", exc_info=True
                )

    brand_context = f"品牌信息：\n{brand_info}" if brand_info else ""
    skill_context = f"\n【创作技巧】\n{skill_prompt}" if skill_prompt and skill_prompt.strip() else ""
    mixed_context = (
        MIXED_IMAGE_INSTRUCTION.format(n=image_count)
        if mixed and image_count > 0
        else ""
    )

    system_prompt = ARTICLE_SYSTEM_PROMPT.format(
        mixed_context=mixed_context,
        skill_context=skill_context,
        brand_context=brand_context,
        knowledge_context=knowledge_context,
    )

    # 分层打印文章 system 的组成（确认创作大师 / 品牌 / 知识库 / 图文混编指令是否注入）
    from app.services.llm_service import log_system_layers
    log_system_layers([
        ("文章基础规则", ARTICLE_SYSTEM_PROMPT),
        ("图文混编指令", mixed_context),
        ("创作大师", skill_prompt),
        ("品牌/参考内容", brand_info),
        ("知识库检索", knowledge_context),
    ], title="文章 System")

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]

    if stream:
        return _stream_article(messages, provider, model, context_chunks)

    answer = await llm_service.chat(
        messages,
        provider=provider,
        model=model,
        max_completion_tokens=settings.ARTICLE_MAX_COMPLETION_TOKENS,
        enable_thinking=settings.ARTICLE_THINKING_ENABLED,
    )
    return {
        "content": answer,
        "context_chunks": [
            {"chunk_id": c.get("chunk_id", ""), "document_title": c.get("document_title", ""), "score": c.get("score", 0)}
            for c in context_chunks
        ],
    }


async def _stream_article(messages, provider, model, context_chunks) -> AsyncIterator[str]:
    if context_chunks:
        refs = [
            {"chunk_id": c.get("chunk_id", ""), "document_title": c.get("document_title", ""), "score": c.get("score", 0)}
            for c in context_chunks
        ]
        yield f"data: {json.dumps({'type': 'context', 'data': refs}, ensure_ascii=False)}\n\n"

    full_text = ""
    async for token in llm_service.chat_stream(
        messages,
        provider=provider,
        model=model,
        max_completion_tokens=settings.ARTICLE_MAX_COMPLETION_TOKENS,
        enable_thinking=settings.ARTICLE_THINKING_ENABLED,
    ):
        full_text += token
        yield f"data: {json.dumps({'type': 'content', 'data': token}, ensure_ascii=False)}\n\n"

    yield f"data: {json.dumps({'type': 'done', 'data': {'total_length': len(full_text)}}, ensure_ascii=False)}\n\n"
