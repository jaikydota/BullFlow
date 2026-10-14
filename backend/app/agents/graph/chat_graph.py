"""LangGraph ReAct Agent — 对话主图。

架构：
    START
      ↓
    agent_node  (LLM + tools bound)
      ↓ [有 tool_calls?]
    ├── YES → tools_node (ToolNode，执行工具) → 回到 agent_node
    └── NO  → END

流式 API `stream_graph_events` 使用 `llm.astream` 对模型输出做 **Token 级** SSE，不再使用假分块或子图
astream_events（后者在 ainvoke 节点下常收不到 token 事件）。"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, AsyncIterator

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    BaseMessageChunk,
    HumanMessage,
    SystemMessage,
    ToolMessage,
    message_chunk_to_message,
)
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graph.llm_factory import get_chat_model
from app.agents.graph.state import AgentState
from app.agents.graph.tools import (
    AGENT_TOOLS,
    CHUNKS_META_KEY,
    EXPORT_RESULT_KEY,
    GENERATION_META_KEY,
)
from app.core.database import async_session_factory
from app.core.time import to_utc_iso
from app.services import chat_service
from app.services.llm_service import log_llm_request, log_llm_response

logger = logging.getLogger(__name__)

# ReAct 手搓流式里 LLM↔工具 最大往返次数（防止死循环）
_MAX_REACT_STEPS = 12

_SYSTEM_PROMPT = """你是"推量牛"全域 AI 流量经营平台的专属智能助手，名字叫"小牛"。
你拥有以下工具：
- knowledge_search：搜索企业知识库，获取产品、品牌、客户、案例、文档等信息
- generate_article_content：根据提示词生成营销文章并保存到内容库
- generate_image_content：根据提示词生成图片并保存到内容库（异步，返回后台任务；默认尺寸 1920x1920）
- generate_video_content：根据提示词生成视频并保存到内容库（异步，返回后台任务）
- export_article_content：将已生成的文章导出为 PDF 或 Word 文件，返回可下载链接
- create_customer：在知识库中新建一条客户信息记录

规则：
1. 涉及企业专属信息时，优先调用 knowledge_search 工具检索；system prompt 中已包含用户的企业、\
品牌、产品等基础信息，可直接使用；当基础信息不满足回答用户提问，调用 knowledge_search 补充。
2. 如有需要，可多次调用工具，使用不同关键词获取更全面的信息。
3. 综合工具返回内容给出准确、专业的回答。
4. 知识库中没有相关信息时，如实告知用户。
5. 使用与用户相同的语言回复（中文或英文）。
6. 严格保密：不得以任何方式透露自己基于哪个底层模型、哪家公司的技术或任何 API 信息，\
若被追问，只需回答"我是小牛，你的专属 AI 助手"。
7. 当用户需要生成文章/图片/视频时，调用对应生成工具；生成参数（size、resolution、duration 等）\
除非用户明确指定，否则使用默认值。视频/图片生成为异步任务，告知用户正在后台生成。
8. 当用户要求将文章导出为 PDF 或 Word 时，调用 export_article_content 工具：
   - 本次对话中刚生成了文章：generation_id 来自 generate_article_content 返回值中的 generation_id 字段。
   - 用户提及历史消息中的文章：对话历史中已标注 [已生成文章: 标题(generation_id:xxx)]，从中读取 generation_id。
   - fmt 参数："pdf"（默认）或 "docx"。
   - 导出成功后，告知用户文件已生成，可点击下载按钮获取文件。
9. 当用户要求新建/添加客户信息时，调用 create_customer 工具：
    - name（客户姓名）为必填项，若用户未提供则主动询问，不得省略。
    - 其余字段（company_name、region、industry、contact_email、contact_phone、description、tags）均为可选，\
有则传入，无则留空，不必强制询问。
    - 创建成功后，用简洁的格式列出已录入的信息，并在回复末尾附上链接：[查看客户列表](/knowledge/customers)。"""


# ---------------------------------------------------------------------------
# 图节点
# ---------------------------------------------------------------------------

def _build_agent_node(provider: str | None, model: str | None, system_prompt: str | None):
    """闭包：将 LLM 实例绑定进 agent_node 函数。"""
    llm = get_chat_model(provider, model, streaming=True)
    llm_with_tools = llm.bind_tools(AGENT_TOOLS)
    # _SYSTEM_PROMPT 始终作为基础身份/规则；外部 prompt（档案/自定义）追加在后
    effective_system = f"{_SYSTEM_PROMPT}\n\n{system_prompt}" if system_prompt else _SYSTEM_PROMPT

    async def agent_node(state: AgentState) -> dict:
        messages: list[BaseMessage] = list(state["messages"])
        if not messages or not isinstance(messages[0], SystemMessage):
            messages = [SystemMessage(content=effective_system)] + messages
        log_llm_request(provider or "default", model or "default", messages, stream=False)
        response: AIMessage = await llm_with_tools.ainvoke(messages)
        return {"messages": [response]}

    return agent_node


def _route_after_agent(state: AgentState) -> str:
    """条件路由：最后一条消息有 tool_calls → 工具节点，否则 → END。"""
    last: BaseMessage = state["messages"][-1]
    if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
        return "tools"
    return END


# ---------------------------------------------------------------------------
# 图构建
# ---------------------------------------------------------------------------

def build_chat_graph(
    provider: str | None = None,
    model: str | None = None,
    system_prompt: str | None = None,
):
    """构建并编译 LangGraph StateGraph。"""
    agent_node = _build_agent_node(provider, model, system_prompt)
    tools_node = ToolNode(AGENT_TOOLS)

    g = StateGraph(AgentState)
    g.add_node("agent", agent_node)
    g.add_node("tools", tools_node)
    g.set_entry_point("agent")
    g.add_conditional_edges("agent", _route_after_agent, {"tools": "tools", END: END})
    g.add_edge("tools", "agent")

    return g.compile()


# ---------------------------------------------------------------------------
# 非流式执行
# ---------------------------------------------------------------------------

async def run_graph(
    *,
    user_message: str,
    user_id: str,
    session_id: str,
    db: AsyncSession,
    provider: str | None = None,
    model: str | None = None,
    history: list[dict[str, str]] | None = None,
    system_prompt: str | None = None,
    use_knowledge: bool = True,
    reference_context: str = "",
    image_urls: list[str] | None = None,
) -> dict[str, Any]:
    """非流式执行 Agent，返回完整结果并持久化助手消息。"""
    compiled = build_chat_graph(provider, model, system_prompt)
    inputs = _build_inputs(
        user_message, history, user_id, session_id,
        reference_context=reference_context, image_urls=image_urls,
    )
    config = _build_config(user_id, db, use_knowledge, image_urls)

    final_state: AgentState = await compiled.ainvoke(inputs, config=config)

    answer = _extract_final_answer(final_state)
    context_chunks = _collect_context_chunks(final_state)

    saved_msg = await chat_service.add_message(
        session_id, user_id, "assistant", answer, db,
        context_chunks=context_chunks if context_chunks else None,
    )

    # 扣分（事后扣；失败仅 warn，不阻塞已生成的回复）
    await _charge_chat(
        db, user_id=user_id, model_id=model,
        messages=final_state["messages"], fallback_text=answer,
        biz_ref_id=str(saved_msg.id) if saved_msg else None,
    )

    return {
        "answer": answer,
        "context_chunks": context_chunks,
        "message_id": saved_msg.id,
    }


# ---------------------------------------------------------------------------
# 流式执行（SSE 生成器）— 真 Token 流 + 手搓 ReAct
# ---------------------------------------------------------------------------

def _tools_by_name() -> dict[str, Any]:
    return {t.name: t for t in AGENT_TOOLS}


def _stream_chunk_text_delta(chunk: BaseMessageChunk | Any) -> str:
    """单条 astream chunk 中推给前端的文本增量（模型侧多为 token 级 delta）。"""
    if chunk is None:
        return ""
    c = getattr(chunk, "content", None)
    if c is None or c == "":
        return ""
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        parts: list[str] = []
        for block in c:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
        return "".join(parts)
    return str(c)


async def stream_graph_events(
    *,
    user_message: str,
    user_id: str,
    session_id: str,
    db: AsyncSession,
    provider: str | None = None,
    model: str | None = None,
    history: list[dict[str, str]] | None = None,
    system_prompt: str | None = None,
    use_knowledge: bool = True,
    reference_context: str = "",
    image_urls: list[str] | None = None,
) -> AsyncIterator[str]:
    """真流式：对 `bind_tools` 后的 `astream` 逐 chunk 推送 content，工具轮不推模型 tool 元数据。

    与编译图 `run_graph` 语义一致（同 prompt、同工具、同 configurable），仅执行方式改为
    手搓 ReAct 循环以便把 LLM 的流式 chunk 直接映射为 SSE。
    """
    # _SYSTEM_PROMPT 始终作为基础身份/规则；外部 prompt（档案/自定义）追加在后
    effective_system = f"{_SYSTEM_PROMPT}\n\n{system_prompt}" if system_prompt else _SYSTEM_PROMPT
    llm = get_chat_model(provider, model, streaming=True)
    model_runnable = llm.bind_tools(AGENT_TOOLS) if use_knowledge else llm

    cfg = _build_config(user_id, db, use_knowledge, image_urls)
    base_msgs: list[BaseMessage] = _build_inputs(
        user_message, history, user_id, session_id,
        reference_context=reference_context, image_urls=image_urls,
    )["messages"]
    work: list[BaseMessage] = [SystemMessage(content=effective_system)] + list(base_msgs)

    tools_map = _tools_by_name()
    all_context_chunks: list[dict] = []
    seen_chunk_ids: set[str] = set()
    all_generation_results: list[dict] = []
    all_export_results: list[dict] = []
    full_text = ""

    for _step in range(_MAX_REACT_STEPS):
        log_llm_request(provider or "default", model or "default", work, stream=True)
        _t0 = time.perf_counter()
        acc: BaseMessageChunk | None = None
        async for chunk in model_runnable.astream(work, config=cfg):
            if acc is None:
                acc = chunk
            else:
                acc = acc + chunk
            tok = _stream_chunk_text_delta(chunk)
            if tok:
                yield _sse({"type": "content", "data": tok})

        if acc is None:
            logger.warning("ReAct 流式：astream 未返回任何 chunk")
            break

        ai_msg = message_chunk_to_message(acc)
        if not isinstance(ai_msg, AIMessage):
            ai_msg = AIMessage(
                content=getattr(ai_msg, "content", "") or "",
                tool_calls=getattr(ai_msg, "tool_calls", None),
            )
        # 记录本轮 LLM 响应（content 预览 + tool_calls + 耗时 + token 用量）
        log_llm_response(
            provider or "default",
            model or "default",
            ai_msg.content,
            stream=True,
            tool_calls=getattr(ai_msg, "tool_calls", None),
            elapsed_ms=(time.perf_counter() - _t0) * 1000,
            usage=getattr(ai_msg, "usage_metadata", None)
            or (ai_msg.response_metadata or {}).get("usage"),
            step=_step,
        )
        work.append(ai_msg)

        tcs: list[dict] = list(getattr(ai_msg, "tool_calls", None) or [])
        if not tcs:
            full_text = _message_text_content(ai_msg)
            break

        for tc in tcs:
            name: str = tc.get("name") or ""
            tid: str = tc.get("id") or ""
            args: Any = tc.get("args") or {}
            tool = tools_map.get(name)
            if tool is None:
                out = json.dumps({"error": f"未知工具: {name}"}, ensure_ascii=False)
            else:
                out = await tool.ainvoke(args, config=cfg)
            work.append(
                ToolMessage(
                    content=out if isinstance(out, str) else str(out),
                    tool_call_id=tid,
                    name=name or None,
                )
            )
            if isinstance(out, str):
                try:
                    data = json.loads(out)
                    # 知识库 chunks 处理
                    if name == "knowledge_search":
                        new_chunks = [
                            c
                            for c in data.get(CHUNKS_META_KEY, [])
                            if c.get("chunk_id")
                            and str(c.get("chunk_id")) not in seen_chunk_ids
                        ]
                        for c in new_chunks:
                            seen_chunk_ids.add(str(c.get("chunk_id", "")))
                        if new_chunks:
                            all_context_chunks.extend(new_chunks)
                            yield _sse({"type": "context", "data": new_chunks})
                    # 内容生成工具结果处理
                    elif GENERATION_META_KEY in data:
                        gen_result = {
                            "generation_id": data[GENERATION_META_KEY],
                            "type": data.get("type", "article"),
                            "status": data.get("status", "completed"),
                            "title": data.get("title"),
                            "preview_info": data.get("preview_info", {}),
                        }
                        all_generation_results.append(gen_result)
                        yield _sse({"type": "generation", "data": gen_result})
                    # 导出工具结果处理
                    elif EXPORT_RESULT_KEY in data:
                        export_info = data[EXPORT_RESULT_KEY]
                        all_export_results.append(export_info)
                        yield _sse({"type": "export_result", "data": export_info})
                except (json.JSONDecodeError, TypeError):
                    pass
    else:
        logger.warning("ReAct 流式：达到最大轮次 %s", _MAX_REACT_STEPS)
        for m in reversed(work):
            if isinstance(m, AIMessage) and not (getattr(m, "tool_calls", None) or []):
                full_text = _message_text_content(m)
                break

    if not full_text.strip() and work:
        last = work[-1]
        if isinstance(last, AIMessage) and not (getattr(last, "tool_calls", None) or []):
            full_text = _message_text_content(last)

    msg_data: dict = {"content": full_text, "role": "assistant"}
    try:
        async with async_session_factory() as save_db:
            try:
                saved_msg = await chat_service.add_message(
                    session_id,
                    user_id,
                    "assistant",
                    full_text,
                    save_db,
                    context_chunks=all_context_chunks if all_context_chunks else None,
                    generation_results=all_generation_results if all_generation_results else None,
                    distribution_results=None,  # 海外分发已移除（列保留兼容历史消息）
                    export_results=all_export_results if all_export_results else None,
                )
                # 扣分（事后扣；失败仅 warn，不影响 SSE 已下发内容）
                await _charge_chat(
                    save_db, user_id=user_id, model_id=model,
                    messages=work, fallback_text=full_text,
                    biz_ref_id=str(saved_msg.id) if saved_msg else None,
                )
                await save_db.commit()
                msg_data = {
                    "id": saved_msg.id,
                    "session_id": saved_msg.session_id,
                    "user_id": saved_msg.user_id,
                    "role": saved_msg.role,
                    "content": saved_msg.content,
                    "content_type": saved_msg.content_type,
                    "attachments": saved_msg.attachments,
                    "token_count": saved_msg.token_count,
                    "context_chunks": saved_msg.context_chunks,
                    "generation_results": saved_msg.generation_results,
                    "distribution_results": saved_msg.distribution_results,
                    "export_results": saved_msg.export_results,
                    "created_at": to_utc_iso(saved_msg.created_at),
                }
            except Exception:
                await save_db.rollback()
                raise
    except Exception:
        logger.warning("LangGraph Agent：流式保存助手消息失败", exc_info=True)

    yield _sse({"type": "done", "data": msg_data})


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------

def _build_inputs(
    user_message: str,
    history: list[dict[str, str]] | None,
    user_id: str,
    session_id: str,
    *,
    reference_context: str = "",
    image_urls: list[str] | None = None,
) -> AgentState:
    msgs: list[BaseMessage] = []
    for h in (history or []):
        role = h.get("role", "")
        content = (h.get("content") or "").strip()
        if role == "user":
            msgs.append(HumanMessage(content=content))
        elif role == "assistant" and content:
            # 跳过空 assistant 行（流式存库失败时会产生污染）
            msgs.append(AIMessage(content=content))
        # system 由 agent_node 注入，此处跳过
    msgs.append(_build_current_human(user_message, reference_context, image_urls))
    return {"messages": msgs, "user_id": user_id, "session_id": session_id, "context_chunks": []}


def _build_current_human(
    user_message: str,
    reference_context: str = "",
    image_urls: list[str] | None = None,
) -> HumanMessage:
    """构造本轮用户消息：注入参考资料文本 + 多模态图片（若有）。

    - reference_context：挂载文档/品牌/产品的资料文本，前置到用户问题之前；
      仅注入本轮 LLM 上下文，不落到 message.content（DB 保持纯净）。
    - image_urls：挂载图片的公网 URL，转为 OpenAI 多模态 image_url 块，
      让视觉模型（gpt-5.4-mini）真正"看到"图片。
    """
    text = f"{reference_context}\n\n{user_message}" if reference_context else user_message
    if image_urls:
        content: list[dict] = [{"type": "text", "text": text}]
        for url in image_urls:
            content.append({"type": "image_url", "image_url": {"url": url}})
        return HumanMessage(content=content)
    return HumanMessage(content=text)


def _build_config(
    user_id: str,
    db: AsyncSession,
    use_knowledge: bool,
    reference_image_urls: list[str] | None = None,
) -> dict:
    return {
        "configurable": {
            "user_id": user_id,
            "db": db,
            "use_knowledge": use_knowledge,
            "knowledge_top_k": 5,
            # 用户挂载的参考图 URL，供 generate_image_content 工具做图生图（参考图生成）
            "reference_image_urls": reference_image_urls or [],
        }
    }


def _extract_final_answer(state: AgentState) -> str:
    """从最终状态中提取最后一条无 tool_calls 的 AI 消息内容。"""
    for msg in reversed(state["messages"]):
        if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", None):
            return _message_text_content(msg) or ""
    return ""


def _collect_context_chunks(state: AgentState) -> list[dict]:
    """从 state 的所有 ToolMessage 中提取结构化 chunks（非流式路径用）。"""
    chunks: list[dict] = []
    seen: set[str] = set()
    for msg in state["messages"]:
        if msg.__class__.__name__ == "ToolMessage":
            try:
                data = json.loads(msg.content)
                for c in data.get(CHUNKS_META_KEY, []):
                    cid = c.get("chunk_id", "")
                    if cid not in seen:
                        chunks.append(c)
                        seen.add(cid)
            except (json.JSONDecodeError, AttributeError):
                pass
    return chunks


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _message_text_content(msg: Any) -> str:
    """从 AIMessage 等对象上取出纯文本（兼容 str / 多段 content 列表）。"""
    if msg is None:
        return ""
    c = getattr(msg, "content", None)
    if c is None:
        return ""
    if isinstance(c, str):
        return c.strip()
    if isinstance(c, list):
        parts: list[str] = []
        for block in c:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
        return "".join(parts).strip()
    return str(c).strip()


# ---------------------------------------------------------------------------
# 计费：从 messages 抓 usage_metadata 总和（流式 / 非流式共用）
# ---------------------------------------------------------------------------

def _extract_token_count(messages: list[Any]) -> int:
    total = 0
    for msg in messages:
        meta = getattr(msg, "usage_metadata", None) or {}
        try:
            total += int(meta.get("input_tokens", 0)) + int(meta.get("output_tokens", 0))
        except (TypeError, ValueError):
            continue
    return total


async def _charge_chat(
    db: AsyncSession,
    *,
    user_id: str,
    model_id: str | None,
    messages: list[Any],
    fallback_text: str,
    biz_ref_id: str | None,
) -> None:
    """Chat 扣分入口：流式 / 非流式共用。失败只 warn，不中断已生成的回复。"""
    from app.services.billing_config_service import credits_for_text
    from app.services.saas_quota import consume_points, QuotaExceededError

    tokens = _extract_token_count(messages)
    if tokens <= 0:
        tokens = max(1, len(fallback_text or "") // 4)

    try:
        credits, meta = await credits_for_text(db, tokens=tokens, model_id=model_id)
        await consume_points(
            db, user_id, credits,
            biz_type="chat",
            biz_ref_type="chat_message" if biz_ref_id else None,
            biz_ref_id=biz_ref_id,
            model_id=meta["model_id"],
            unit_price=meta["unit_price"],
            units=meta["units"],
            remark=f"AI 对话 · {model_id or 'auto'}",
            allow_partial=True,  # 后付费：余额不足扣到 0，避免少量余额无限白嫖
        )
    except QuotaExceededError as e:
        logger.warning("chat consume_points failed user=%s: %s", user_id, e.message)
    except Exception:  # noqa: BLE001
        logger.warning("chat consume_points unexpected error", exc_info=True)
