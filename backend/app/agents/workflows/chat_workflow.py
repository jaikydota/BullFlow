"""Chat workflow entry point — 接入 LangGraph ReAct Agent。

由 LangGraph StateGraph 驱动：
  LLM 自主决策工具调用 → 多轮检索 → 生成最终回答

降级路径：若 use_knowledge=False，Agent 仍正常工作（不会调用 knowledge_search，
因为系统 prompt 不会促使 LLM 在无需知识时主动调用工具）。
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graph.chat_graph import _SYSTEM_PROMPT, run_graph, stream_graph_events
from app.services.llm_service import log_system_layers
from app.services.profile_service import build_user_profile_text


async def run_chat_workflow(
    user_message: str,
    user_id: str,
    session_id: str,
    db: AsyncSession,
    *,
    provider: str | None = None,
    model: str | None = None,
    history: list[dict[str, str]] | None = None,
    system_prompt: str | None = None,
    use_knowledge: bool = True,
    reference_context: str = "",
    image_urls: list[str] | None = None,
    skill_prompt: str | None = None,
    stream: bool = False,
) -> dict[str, Any] | Any:
    """对话工作流入口，支持流式和非流式两种模式。

    流式模式返回 AsyncGenerator[str]，yield SSE 格式字符串。
    非流式模式返回 dict，包含 answer / context_chunks / message_id。
    """
    # 查询用户企业档案（公司/品牌/产品），注入 system prompt 让模型直接可用
    profile_text = await build_user_profile_text(user_id, db)
    effective_system = _merge_system_prompt(system_prompt, profile_text, skill_prompt)

    # 分层打印最终 system 的组成（确认「创作大师」skill / 企业档案等是否注入）。
    # 顺序与实际拼接一致：Agent 身份(graph 层前置) → 会话自定义 → 创作大师 → 企业档案。
    log_system_layers([
        ("Agent 身份/工具", _SYSTEM_PROMPT),
        ("会话自定义", system_prompt),
        ("创作大师", skill_prompt),
        ("企业档案", profile_text),
    ])

    if stream:
        return stream_graph_events(
            user_message=user_message,
            user_id=user_id,
            session_id=session_id,
            db=db,
            provider=provider,
            model=model,
            history=history,
            system_prompt=effective_system,
            use_knowledge=use_knowledge,
            reference_context=reference_context,
            image_urls=image_urls,
        )

    return await run_graph(
        user_message=user_message,
        user_id=user_id,
        session_id=session_id,
        db=db,
        provider=provider,
        model=model,
        history=history,
        system_prompt=effective_system,
        use_knowledge=use_knowledge,
        reference_context=reference_context,
        image_urls=image_urls,
    )


def _merge_system_prompt(base: str | None, profile: str, skill_prompt: str | None = None) -> str | None:
    """将企业档案文本追加到 session 自定义 system prompt 后面。

    chat_graph 内的 _SYSTEM_PROMPT（身份/规则）始终由 graph 层负责拼接，
    此处仅拼合"会话级自定义 prompt + 企业档案"部分，返回值将被 graph 追加在
    _SYSTEM_PROMPT 之后。

    顺序：会话自定义 prompt + skill 创作技巧 + 企业档案；都为空时返回 None
    （graph 直接用 _SYSTEM_PROMPT）。
    """
    parts: list[str] = []
    if base:
        parts.append(base)
    if skill_prompt and skill_prompt.strip():
        parts.append(f"【创作技巧】\n{skill_prompt.strip()}")
    if profile:
        parts.append(profile)
    return "\n\n".join(parts) if parts else None
