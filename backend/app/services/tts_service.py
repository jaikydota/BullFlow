"""IndexTTS 语音合成服务。

调用流程：
  1. POST 文本到 INDEX_TTS_URL，获取 WAV 字节流
  2. 用 ffmpeg 将 WAV 转为 128k AAC .m4a
  3. 上传到 MinIO，路径 {user_id}/tts/{YYYY-MM}/{uuid}.m4a
  4. 返回 MinIO 对象路径（由调用方转换为公开 URL）
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import tempfile
import uuid
from datetime import datetime
from functools import lru_cache

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_md_parser():
    """懒加载并缓存 markdown-it-py 纯文本解析器（线程安全，只初始化一次）。

    使用 gfm-like 预设以支持 GitHub Flavored Markdown（表格、删除线等），
    配合 mdit-plain 的纯文本渲染器，输出无任何标记的干净文本。
    """
    # 屏蔽 markdown_it 内部的噪音日志（仅保留 WARNING 及以上）
    logging.getLogger("markdown_it").setLevel(logging.WARNING)

    from markdown_it import MarkdownIt
    from mdit_plain.renderer import RendererPlain
    try:
        # gfm-like 支持表格、strikethrough（需要 linkify-it-py，尝试加载）
        parser = MarkdownIt("gfm-like", renderer_cls=RendererPlain)
    except Exception:
        # 回退到 commonmark，手动开启表格
        parser = MarkdownIt("commonmark", renderer_cls=RendererPlain).enable("table")
    return parser


def _strip_markdown(text: str) -> str:
    """将 LLM 返回的 Markdown 文本转为适合 TTS 朗读的纯文本。

    策略：
    1. 预处理：先用正则移除 mdit-plain 无法正确处理的代码块（输出原样）和 URL
    2. 用 markdown-it-py + mdit-plain 做 AST 级解析
       （正确处理嵌套、引用块、表格等复杂结构）
    3. 后处理：去除 mdit-plain 保留的无序列表 "- " 标记、规范数字列表、清理空白
    """
    # ── 预处理（AST 解析前）────────────────────────────────────────
    # 围栏代码块 → 替换为语音提示（mdit-plain 会原样输出代码内容）
    text = re.sub(r'```[\s\S]*?```', '\n（代码已省略）\n', text)
    # 行内代码 → 去除（保留内容，去掉反引号）
    text = re.sub(r'`([^`\n]+)`', r'\1', text)
    # URL → 去除（避免朗读长网址）
    text = re.sub(r'https?://\S+', '', text)

    # ── AST 解析：去除标题/粗斜体/引用/表格等 Markdown 语法 ────────
    try:
        parser = _get_md_parser()
        text = parser.render(text)
    except Exception:
        # 解析失败降级：保底简单清理
        text = re.sub(r'[#*_~\[\]>]', '', text)

    # ── 后处理（AST 渲染后）───────────────────────────────────────
    # 去除残留 HTML 标签和实体
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'&[a-zA-Z]+;', ' ', text)

    # 无序列表 "- 内容" 或 "  - 内容"（嵌套）→ "内容"（mdit-plain 保留 - 标记）
    text = re.sub(r'(?m)^\s*-\s+', '', text)

    # 有序列表 "1. 内容" → "1、内容"
    text = re.sub(r'(?m)^(\d+)\.\s+', r'\1、', text)

    # 表格残留 | 符号 → 空格
    text = re.sub(r'\|', ' ', text)
    # 表格分隔行 "--- ---" → 去除整行
    text = re.sub(r'(?m)^\s*[-:\s]+\s*$', '', text)

    # 多余空格和制表符
    text = re.sub(r'[ \t]{2,}', ' ', text)

    # 3 个以上连续换行 → 最多 2 个
    text = re.sub(r'\n{3,}', '\n\n', text)

    # 每行首尾空白
    lines = [l.strip() for l in text.splitlines()]
    lines = [l for l in lines if l]

    # 尾部无标点的行补句号，避免 TTS 将相邻行连读
    # 中英文常见结束标点：。！？；，、.!?;,…）】」
    _end_punct = re.compile(r'[。！？；，、：:.!?;,…）】」\d]$')
    result = []
    for line in lines:
        if line and not _end_punct.search(line):
            line = line + '。'
        result.append(line)

    text = '\n'.join(result)
    return text.strip()


async def _wav_to_m4a(wav_bytes: bytes) -> bytes:
    """用 ffmpeg 将 WAV 转为 128k AAC m4a。

    mp4/m4a 容器写入时需要 seek（写 moov atom），stdout pipe 不可 seek，
    因此使用临时文件作为输出，读取后删除。
    """
    # 创建两个临时文件：输入 wav、输出 m4a
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as fin:
        fin.write(wav_bytes)
        in_path = fin.name

    out_path = in_path.replace(".wav", ".m4a")
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-y",
            "-i", in_path,
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            out_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            err = stderr.decode(errors="replace")[:800]
            raise RuntimeError(f"ffmpeg 转换失败 (code={proc.returncode}): {err}")

        with open(out_path, "rb") as f:
            return f.read()
    finally:
        os.unlink(in_path)
        if os.path.exists(out_path):
            os.unlink(out_path)


async def generate_tts(text: str, user_id: str) -> str:
    """
    生成语音合成音频，返回 MinIO 对象路径（非完整 URL）。

    Args:
        text:    要合成的文本
        user_id: 用于组织 MinIO 路径

    Returns:
        MinIO 对象路径，如 "abc123/tts/2026-04/uuid.m4a"

    Raises:
        RuntimeError: TTS 服务未配置或调用失败
    """
    if not settings.INDEX_TTS_URL:
        raise RuntimeError("INDEX_TTS_URL 未配置，无法调用 TTS 服务")

    # 去除 Markdown 格式，只保留纯文字和标点
    clean_text = _strip_markdown(text)
    if not clean_text:
        raise RuntimeError("TTS 文本为空，跳过合成")

    # ── 1. 调用 IndexTTS 获取 WAV ──────────────────────────────
    payload = {
        "text": clean_text,
        "audio_paths": [settings.INDEX_REFERENCE_AUDIO],
    }
    logger.info("TTS 合成开始 [user=%s, 原始=%d字, 清洗后=%d字]", user_id, len(text), len(clean_text))
    logger.debug("TTS 清洗后文本:\n%s", clean_text)

    async with httpx.AsyncClient(timeout=settings.INDEX_TTS_TIMEOUT) as client:
        resp = await client.post(settings.INDEX_TTS_URL, json=payload)
        resp.raise_for_status()
        wav_bytes = resp.content

    logger.info("TTS WAV 获取成功 [user=%s, size=%.1f KB]", user_id, len(wav_bytes) / 1024)

    # ── 2. WAV → 128k AAC m4a ─────────────────────────────────
    m4a_bytes = await _wav_to_m4a(wav_bytes)
    logger.info("TTS m4a 转换完成 [user=%s, size=%.1f KB]", user_id, len(m4a_bytes) / 1024)

    # ── 3. 上传 MinIO ─────────────────────────────────────────
    from app.core.minio_client import get_minio

    date_prefix = datetime.now().strftime("%Y-%m")
    object_name = f"{user_id}/tts/{date_prefix}/{uuid.uuid4()}.m4a"

    import io

    minio = get_minio()
    minio.put_object(
        settings.MINIO_BUCKET_NAME,
        object_name,
        io.BytesIO(m4a_bytes),
        length=len(m4a_bytes),
        content_type="audio/mp4",
    )
    logger.info("TTS 上传 MinIO 完成 [user=%s, path=%s]", user_id, object_name)
    return object_name
