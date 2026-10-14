from __future__ import annotations

import json
import logging

from app.core.config import settings
from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)

RETRIEVAL_DECISION_PROMPT = """判断以下用户问题是否需要检索企业知识库来回答。
企业知识库包含公司产品、品牌、客户、案例、技术文档等企业专属信息。

如果问题涉及企业专属信息（产品规格、价格、品牌故事、客户案例、操作指南等），回复：
{{"need_retrieval": true, "search_query": "优化后的检索关键词"}}

如果问题是通用知识、闲聊、打招呼、数学计算等不需要企业知识库的，回复：
{{"need_retrieval": false}}

只回复 JSON，不要任何其他内容。

用户问题: {question}"""


async def _should_retrieve(
    question: str,
    *,
    provider: str | None = None,
    model: str | None = None,
) -> tuple[bool, str]:
    """LLM 判断是否需要检索知识库，并可能改写检索查询。"""
    # 未配置专用模型时，沿用当前对话的 provider/model
    adaptive_model = settings.ADAPTIVE_RETRIEVAL_MODEL or model
    adaptive_provider = provider

    prompt = RETRIEVAL_DECISION_PROMPT.format(question=question)
    messages = [{"role": "user", "content": prompt}]

    try:
        response = await llm_service.chat(
            messages, provider=adaptive_provider, model=adaptive_model
        )
        response = response.strip()
        if response.startswith("```"):
            response = response.strip("`").strip()
            if response.startswith("json"):
                response = response[4:].strip()

        decision = json.loads(response)
        need = decision.get("need_retrieval", True)
        query = decision.get("search_query", question)
        logger.info(
            "自适应检索判断: need_retrieval=%s, search_query=%s",
            need,
            query[:60] if query else "",
        )
        return need, query or question
    except Exception:
        logger.warning("自适应检索判断失败，默认执行检索", exc_info=True)
        return True, question
