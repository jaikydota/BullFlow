"""WhisperX 语音转录服务封装。

调用远程 WhisperX Serving（OpenAI-compatible API）将音频转为文字。
响应格式：verbose_json，包含 text、language、duration、segments。

模型策略：
  - language="zh"  → 中文专用模型（WHISPERX_MODEL_ZH），输出可能是繁体；
                     若 WHISPERX_ZH_IS_TRADITIONAL=true 则自动转换为简体
  - language=其他/None → 通用模型（WHISPERX_MODEL_DEFAULT），自动检测语言；
                          若实际检测为中文且 WHISPERX_ZH_IS_TRADITIONAL=true，
                          同样做一次繁→简保险转换
"""
from __future__ import annotations

import logging
import time

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# 繁体→简体转换器，懒加载（opencc-python-reimplemented）
_t2s_converter = None


def _get_t2s():
    """懒加载 OpenCC 繁→简转换器。"""
    global _t2s_converter
    if _t2s_converter is None:
        try:
            import opencc
            _t2s_converter = opencc.OpenCC("t2s")
            logger.debug("OpenCC t2s 转换器已加载")
        except ImportError:
            logger.warning("opencc-python-reimplemented 未安装，繁→简转换不可用")
            _t2s_converter = False  # 标记为"加载失败"，避免重复尝试
    return _t2s_converter if _t2s_converter else None


def _convert_to_simplified(result: dict) -> dict:
    """将 Whisper 返回结果中所有 text 字段由繁体转为简体。"""
    converter = _get_t2s()
    if converter is None:
        return result
    if isinstance(result.get("text"), str):
        result["text"] = converter.convert(result["text"])
    for seg in result.get("segments", []):
        if isinstance(seg.get("text"), str):
            seg["text"] = converter.convert(seg["text"])
    return result


async def transcribe(file_bytes: bytes, file_name: str, language: str | None = None) -> dict:
    """
    调用 WhisperX 服务转录音频。

    Args:
        file_bytes: 音频文件字节
        file_name: 原始文件名（含扩展名，用于 MIME 推断）
        language: 可选，明确指定语言代码如 "zh"/"en"，None 则自动检测

    Returns:
        {
            "text": "完整转录文本（中文已统一为简体）",
            "language": "zh",
            "duration": 26.1,
            "segments": [{"start": 0.8, "end": 4.2, "text": "..."}, ...]
        }
    """
    if not settings.WHISPERX_URL:
        raise RuntimeError("WHISPERX_URL 未配置，无法调用语音转录服务")

    # 根据语言选择模型
    use_zh_model = language == "zh"
    model = settings.WHISPERX_MODEL_ZH if use_zh_model else settings.WHISPERX_MODEL_DEFAULT

    logger.info(
        "Whisper 转录开始 [文件=%s, 大小=%.1f KB, 语言=%s, 模型=%s]",
        file_name, len(file_bytes) / 1024, language or "auto", model,
    )
    t0 = time.perf_counter()

    form_data: dict = {
        "model": model,
        "response_format": "verbose_json",
    }
    if language:
        form_data["language"] = language

    async with httpx.AsyncClient(timeout=settings.WHISPERX_TIMEOUT) as client:
        resp = await client.post(
            settings.WHISPERX_URL,
            files={"file": (file_name, file_bytes)},
            data=form_data,
        )
        resp.raise_for_status()
        result: dict = resp.json()

    elapsed = time.perf_counter() - t0
    detected_lang = result.get("language", "?")
    duration = result.get("duration", 0)
    text_len = len(result.get("text", ""))
    seg_count = len(result.get("segments", []))

    logger.info(
        "Whisper 转录完成 [文件=%s]: 语言=%s, 时长=%.1fs, 文字=%d 字, 分段=%d, 耗时=%.2fs",
        file_name, detected_lang, duration, text_len, seg_count, elapsed,
    )

    # 繁→简：中文专用模型（输出繁体） 或 通用模型检测到中文时均做转换
    need_t2s = settings.WHISPERX_ZH_IS_TRADITIONAL and (
        use_zh_model or detected_lang in ("zh", "yue")
    )
    if need_t2s:
        result = _convert_to_simplified(result)
        logger.debug("Whisper 繁→简转换完成 [文件=%s]", file_name)

    return result
