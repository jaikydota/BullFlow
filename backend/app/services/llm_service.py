from __future__ import annotations

import logging
from enum import Enum
from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)

# 单条 message content 日志预览上限（超出截断，避免长 system prompt / 上下文污染日志）
_MSG_PREVIEW_LIMIT = 300
# LLM 响应 content 日志预览上限（响应是核心信息，比请求 message 给更长的预览）
_RESP_PREVIEW_LIMIT = 600
# system 分层日志每层预览上限（创作大师/档案等可能较长，但仍只取头部片段）
_LAYER_PREVIEW_LIMIT = 250


def _preview_text(value: Any, limit: int = _MSG_PREVIEW_LIMIT) -> str:
    """把任意 content 转成单行截断预览：超长时尾部标注 …(共 N 字)。

    content 可能是 str，也可能是多模态 list（如 [{type:'text',...},{type:'image_url',...}]）。
    """
    if isinstance(value, list):
        # 多模态：逐段提取文本，图片只留占位
        parts: list[str] = []
        for seg in value:
            if isinstance(seg, dict):
                if seg.get("type") == "text":
                    parts.append(str(seg.get("text", "")))
                elif seg.get("type") in ("image_url", "input_image"):
                    parts.append("[image]")
                else:
                    parts.append(f"[{seg.get('type', 'part')}]")
            else:
                parts.append(str(seg))
        text = " ".join(parts)
    else:
        text = "" if value is None else str(value)

    text = text.replace("\n", " ").strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit]}…(共 {len(text)} 字)"


def log_system_layers(
    layers: list[tuple[str, str | None]],
    *,
    title: str = "System",
    limit: int = _LAYER_PREVIEW_LIMIT,
) -> None:
    """分层打印发给模型的 prompt 的各组成部分（Agent 身份 / 创作大师 / 企业档案 / 知识库 …）。

    最终发给模型的 system / prompt 往往是一整段拼接串，单条日志只能看到截断头部、
    看不出 skill 等是否注入。这里在拼接处把各「层」按名称 + 长度 + 片段分别打印，
    方便确认每一层（尤其「创作大师」skill）是否生效、内容是什么。
    - layers：(层名, 文本) 列表；文本为空的层自动跳过。
    - title：日志前缀，区分场景（System / 文章 System / 生图 Prompt …）。
    """
    try:
        kept = [(name, text) for name, text in layers if text and str(text).strip()]
        total = sum(len(str(text)) for _, text in kept)
        lines = [f"[{title} 分层] 共 {len(kept)} 层 / {total} 字（按拼接顺序）"]
        for i, (name, text) in enumerate(kept):
            t = str(text).replace("\n", " ").strip()
            preview = t if len(t) <= limit else f"{t[:limit]}…(共 {len(t)} 字)"
            lines.append(f"  L{i} [{name}] {len(str(text))} 字 | {preview}")
        logger.info("\n".join(lines))
    except Exception:  # 日志绝不能影响主流程
        logger.debug("prompt 分层日志打印失败", exc_info=True)


def _msg_role_content(m: Any) -> tuple[str, Any]:
    """从一条 message 提取 (role, content)，兼容 dict 与 LangChain BaseMessage。"""
    if isinstance(m, dict):
        return str(m.get("role", "?")), m.get("content")
    # LangChain BaseMessage：SystemMessage.type='system' / HumanMessage.type='human'
    # / AIMessage.type='ai' / ToolMessage.type='tool'
    role = getattr(m, "type", None) or type(m).__name__
    return str(role), getattr(m, "content", None)


def log_llm_request(
    provider: str,
    model: str,
    messages: list[Any],
    *,
    stream: bool,
    **params: Any,
) -> None:
    """打印发给 LLM 的请求摘要：provider/model + 逐条 message（content 截断）。

    替代 openai SDK 自带的 DEBUG 全量日志（已在 main 中压制为 WARNING），
    既能逐条定位发给模型的内容，又不会被单条超长 content 刷屏。
    兼容 dict 消息（llm_service）与 LangChain BaseMessage（LangGraph agent）。
    """
    try:
        header = (
            f"[LLM 请求] provider={provider} model={model} stream={stream} "
            f"messages={len(messages)}"
        )
        temp = params.get("temperature")
        max_tok = params.get("max_completion_tokens") or params.get("max_tokens")
        if temp is not None or max_tok is not None:
            header += f" temp={temp} max_tokens={max_tok}"
        if params.get("thinking"):
            header += " thinking=on"
        lines = [header]
        for i, m in enumerate(messages):
            role, content = _msg_role_content(m)
            # AIMessage 带 tool_calls 时附带工具名，便于看 ReAct 决策
            tool_calls = getattr(m, "tool_calls", None)
            suffix = ""
            if tool_calls:
                names = ", ".join(tc.get("name", "?") for tc in tool_calls if isinstance(tc, dict))
                suffix = f"  →tool_calls[{names}]"
            lines.append(f"  #{i} [{role}] {_preview_text(content)}{suffix}")
        logger.info("\n".join(lines))
    except Exception:  # 日志绝不能影响主流程
        logger.debug("LLM 请求日志打印失败", exc_info=True)


def log_llm_response(
    provider: str,
    model: str,
    content: Any,
    *,
    stream: bool,
    tool_calls: list[Any] | None = None,
    elapsed_ms: float | None = None,
    usage: Any = None,
    step: int | None = None,
) -> None:
    """打印 LLM 返回的响应摘要：content 预览 + tool_calls + 耗时 + token 用量。

    与 `log_llm_request` 配对，补齐"只记请求不记响应"的盲区。content 给到
    `_RESP_PREVIEW_LIMIT`（默认 500 字）的较长预览，便于排查模型实际产出；
    ReAct 多轮时附带 step 序号区分是第几轮 LLM 输出。
    """
    try:
        header = f"[LLM 响应] provider={provider} model={model} stream={stream}"
        if step is not None:
            header += f" step={step}"
        if elapsed_ms is not None:
            header += f" elapsed={elapsed_ms:.0f}ms"
        # usage 兼容：openai usage 对象（prompt/completion）、LangChain
        # usage_metadata（input/output），既支持 dict 也支持对象属性
        if usage is not None:
            def _u(*keys: str) -> Any:
                for k in keys:
                    v = usage.get(k) if isinstance(usage, dict) else getattr(usage, k, None)
                    if v is not None:
                        return v
                return None

            pt = _u("prompt_tokens", "input_tokens")
            ct = _u("completion_tokens", "output_tokens")
            tt = _u("total_tokens")
            if pt is not None or ct is not None or tt is not None:
                header += f" tokens(prompt/completion/total)={pt}/{ct}/{tt}"
        # 工具调用：附带工具名 + 入参预览，便于看 ReAct 决策
        tcs = list(tool_calls or [])
        if tcs:
            names = ", ".join(
                str(tc.get("name", "?")) for tc in tcs if isinstance(tc, dict)
            )
            header += f"  →tool_calls[{names}]"
        text = _preview_text(content, limit=_RESP_PREVIEW_LIMIT)
        lines = [header]
        if text:
            lines.append(f"  {text}")
        for tc in tcs:
            if isinstance(tc, dict):
                lines.append(
                    f"  →[{tc.get('name', '?')}] args={_preview_text(tc.get('args'))}"
                )
        logger.info("\n".join(lines))
    except Exception:  # 日志绝不能影响主流程
        logger.debug("LLM 响应日志打印失败", exc_info=True)


class LLMProvider(str, Enum):
    AZURE = "azure"
    VOLCENGINE = "volcengine"
    ALIYUN = "aliyun"


def _build_thinking_kwargs(provider: str, *, stream: bool) -> tuple[dict[str, Any], bool]:
    """按 provider 返回开启「深度思考」需合并进 chat.completions.create() 的 kwargs，
    以及是否仍可发送自定义 temperature（reasoning 模型不接受非默认 temperature）。

    三家机制完全不同：
    - azure (gpt-5.4 系列)：GPT-5 是 reasoning 模型，用 ``reasoning_effort`` 调思考力度；
      reasoning 模型只接受默认 temperature，故返回 keep_temperature=False。
    - volcengine (doubao-seed-2-0)：火山方舟用 ``thinking={"type": "enabled"}``（走 extra_body）。
    - aliyun (qwen3.7)：DashScope 兼容端点用 ``enable_thinking=true``（走 extra_body），
      但**仅流式支持**，非流式开启会 400，故非流式返回空 kwargs（跳过思考）。
    """
    if provider == LLMProvider.AZURE:
        return {"reasoning_effort": settings.THINKING_REASONING_EFFORT}, False
    if provider == LLMProvider.VOLCENGINE:
        return {"extra_body": {"thinking": {"type": "enabled"}}}, True
    if provider == LLMProvider.ALIYUN:
        if not stream:
            logger.info("[thinking] aliyun 非流式不支持 enable_thinking，本次跳过深度思考")
            return {}, True
        return {"extra_body": {"enable_thinking": True}}, True
    return {}, True


def _merge_extra_body(create_kwargs: dict[str, Any], extra: dict[str, Any]) -> None:
    """把 thinking 注入项合并进 create_kwargs；``extra_body`` 做浅合并，避免覆盖调用方已传的项。"""
    for k, v in extra.items():
        if k == "extra_body" and isinstance(create_kwargs.get("extra_body"), dict):
            create_kwargs["extra_body"] = {**create_kwargs["extra_body"], **v}
        else:
            create_kwargs[k] = v


class LLMService:
    """Unified LLM service – all providers use OpenAI-compatible SDK."""

    def __init__(self):
        self._clients: dict[str, AsyncOpenAI] = {}

    def _default_model_for(self, provider: str) -> str:
        """按 provider 取该提供商配置列表里的第一个模型作为默认。

        避免 fallback 到全局 ``settings.DEFAULT_LLM_MODEL`` 导致 provider/model 错搭：
        例如 ``DEFAULT_LLM_MODEL='gpt-5.4-mini'`` 是 Azure 的模型名，调用方传
        ``provider='aliyun'`` 但漏传 ``model`` 时，全局 fallback 会把 ``gpt-5.4-mini``
        发到 DashScope，触发 404 model_not_found。
        """
        if provider == LLMProvider.AZURE:
            models_csv = settings.AZURE_OPENAI_MODELS
        elif provider == LLMProvider.ALIYUN:
            models_csv = settings.ALIYUN_MODELS
        elif provider == LLMProvider.VOLCENGINE:
            models_csv = settings.VOLCENGINE_MODELS
        else:
            return settings.DEFAULT_LLM_MODEL
        first = next((m.strip() for m in models_csv.split(",") if m.strip()), "")
        return first or settings.DEFAULT_LLM_MODEL

    def get_client(self, provider: str) -> AsyncOpenAI:
        if provider in self._clients:
            return self._clients[provider]

        if provider == LLMProvider.AZURE:
            client = AsyncOpenAI(
                base_url=settings.AZURE_OPENAI_BASE_URL,
                api_key=settings.AZURE_OPENAI_API_KEY,
            )
        elif provider == LLMProvider.VOLCENGINE:
            client = AsyncOpenAI(
                base_url=settings.VOLCENGINE_BASE_URL,
                api_key=settings.VOLCENGINE_API_KEY,
            )
        elif provider == LLMProvider.ALIYUN:
            client = AsyncOpenAI(
                base_url=settings.ALIYUN_BASE_URL,
                api_key=settings.ALIYUN_API_KEY,
            )
        else:
            raise ValueError(f"Unknown LLM provider: {provider}")

        self._clients[provider] = client
        return client

    async def chat(
        self,
        messages: list[dict[str, str]],
        provider: str | None = None,
        model: str | None = None,
        *,
        temperature: float = 0.7,
        max_completion_tokens: int = 4096,
        enable_thinking: bool = False,
        **kwargs: Any,
    ) -> str:
        """Non-streaming chat completion."""
        provider = provider or settings.DEFAULT_LLM_PROVIDER
        # 按 provider 取对应默认 model，避免错搭（见 _default_model_for 注释）
        model = model or self._default_model_for(provider)
        client = self.get_client(provider)

        # Qwen(aliyun) 是思考模型，DashScope compatible-mode 下思考模型不支持非流式调用
        # （非流式会 4xx，错误码可能误报为 access_denied）。开启思考时把「非流式」委托给流式聚合：
        # 内部 stream=True 收集全文后整体返回，既能开 enable_thinking 又规避非流式报错。
        # 文章生成走后台任务轮询，前端无需 SSE，此转换对调用方/前端完全透明。
        if enable_thinking and provider == LLMProvider.ALIYUN:
            parts: list[str] = []
            async for tok in self.chat_stream(
                messages, provider=provider, model=model,
                temperature=temperature, max_completion_tokens=max_completion_tokens,
                enable_thinking=True, **kwargs,
            ):
                parts.append(tok)
            return "".join(parts)

        create_kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_completion_tokens": max_completion_tokens,
            "stream": False,
            **kwargs,
        }
        keep_temperature = True
        if enable_thinking:
            think_kw, keep_temperature = _build_thinking_kwargs(provider, stream=False)
            _merge_extra_body(create_kwargs, think_kw)
        if keep_temperature:
            create_kwargs["temperature"] = temperature

        log_llm_request(
            provider, model, messages, stream=False,
            temperature=create_kwargs.get("temperature"),
            max_completion_tokens=max_completion_tokens, thinking=enable_thinking,
        )
        resp = await client.chat.completions.create(**create_kwargs)
        return resp.choices[0].message.content or ""

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        provider: str | None = None,
        model: str | None = None,
        *,
        temperature: float = 0.7,
        max_completion_tokens: int = 4096,
        enable_thinking: bool = False,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        """Streaming chat completion – yields content delta strings."""
        provider = provider or settings.DEFAULT_LLM_PROVIDER
        # 按 provider 取对应默认 model，避免错搭（见 _default_model_for 注释）
        model = model or self._default_model_for(provider)
        client = self.get_client(provider)

        create_kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_completion_tokens": max_completion_tokens,
            "stream": True,
            **kwargs,
        }
        keep_temperature = True
        if enable_thinking:
            think_kw, keep_temperature = _build_thinking_kwargs(provider, stream=True)
            _merge_extra_body(create_kwargs, think_kw)
        if keep_temperature:
            create_kwargs["temperature"] = temperature

        log_llm_request(
            provider, model, messages, stream=True,
            temperature=create_kwargs.get("temperature"),
            max_completion_tokens=max_completion_tokens, thinking=enable_thinking,
        )
        stream = await client.chat.completions.create(**create_kwargs)
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content

    def list_models(self) -> list[dict[str, Any]]:
        """Return available models grouped by provider."""
        result = []
        if settings.AZURE_OPENAI_API_KEY:
            for m in settings.AZURE_OPENAI_MODELS.split(","):
                m = m.strip()
                if m:
                    result.append({"provider": "azure", "model": m})
        if settings.VOLCENGINE_API_KEY:
            for m in settings.VOLCENGINE_MODELS.split(","):
                m = m.strip()
                if m:
                    result.append({"provider": "volcengine", "model": m})
        if settings.ALIYUN_API_KEY:
            for m in settings.ALIYUN_MODELS.split(","):
                m = m.strip()
                if m:
                    result.append({"provider": "aliyun", "model": m})
        return result


llm_service = LLMService()
