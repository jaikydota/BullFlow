"""LLM 工厂：将三个 provider 统一封装为 langchain_openai.ChatOpenAI 实例。

所有 provider（Azure、火山引擎、阿里云）均使用 OpenAI-compatible API，
因此直接使用 ChatOpenAI + 自定义 base_url，无需 AzureChatOpenAI 等变种。
返回的 LLM 实例支持 Tool Calling（bind_tools），可直接接入 LangGraph。
"""
from __future__ import annotations

import logging

from langchain_openai import ChatOpenAI

from app.core.config import settings
from app.services.llm_service import LLMProvider

logger = logging.getLogger(__name__)

# 默认生成参数
_DEFAULT_TEMPERATURE = 0.7
_DEFAULT_MAX_TOKENS = 4096


def get_chat_model(
    provider: str | None = None,
    model: str | None = None,
    *,
    temperature: float = _DEFAULT_TEMPERATURE,
    max_tokens: int = _DEFAULT_MAX_TOKENS,
    streaming: bool = False,
) -> ChatOpenAI:
    """返回绑定了指定 provider/model 的 ChatOpenAI 实例。

    Args:
        provider: "azure" | "volcengine" | "aliyun"，None 则用全局默认。
        model:    模型名称，None 则用全局默认。
        temperature: 采样温度。
        max_tokens:  最大输出 token 数。
        streaming:   是否开启流式模式（astream_events 场景下设为 True）。
    """
    provider = provider or settings.DEFAULT_LLM_PROVIDER
    model = model or settings.DEFAULT_LLM_MODEL

    base_url, api_key = _resolve_provider_credentials(provider)

    return ChatOpenAI(
        base_url=base_url,
        api_key=api_key,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        streaming=streaming,
        # 流式下请求后端回传 token 用量（stream_options.include_usage=true），
        # usage 随最后一个 chunk 返回并落到 AIMessage.usage_metadata，供响应日志打印。
        # 主流 OpenAI 兼容后端（Azure / 火山方舟 / 阿里云 DashScope）均支持。
        stream_usage=streaming,
    )


def _resolve_provider_credentials(provider: str) -> tuple[str, str]:
    """根据 provider 名称返回 (base_url, api_key)。"""
    if provider == LLMProvider.AZURE:
        return settings.AZURE_OPENAI_BASE_URL, settings.AZURE_OPENAI_API_KEY
    if provider == LLMProvider.VOLCENGINE:
        return settings.VOLCENGINE_BASE_URL, settings.VOLCENGINE_API_KEY
    if provider == LLMProvider.ALIYUN:
        return settings.ALIYUN_BASE_URL, settings.ALIYUN_API_KEY

    logger.warning("未知 LLM provider: %s，降级使用默认 provider", provider)
    return settings.ALIYUN_BASE_URL, settings.ALIYUN_API_KEY
