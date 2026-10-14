from __future__ import annotations

from typing import Annotated

from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class AgentState(TypedDict):
    """LangGraph Agent 的共享状态。

    messages 使用 add_messages reducer，支持追加（而非覆盖）：
    - HumanMessage  ← 用户输入
    - AIMessage     ← LLM 回复（可能含 tool_calls）
    - ToolMessage   ← 工具执行结果
    """

    messages: Annotated[list, add_messages]
    user_id: str
    session_id: str
    # 累积所有轮次 tool_call 返回的知识片段，用于 SSE context 事件和消息持久化
    context_chunks: list[dict]
