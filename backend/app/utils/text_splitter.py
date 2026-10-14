"""文本分块模块。

借鉴 RAGLite 的核心算法创新：
1. 句子分割: wtpsplit 概率分数 + Markdown 标题边界感知 + DP 优化边界选择
2. 语义分块: DP 合并句子时感知 Markdown 标题结构，鼓励在标题前分割
"""

from __future__ import annotations

import logging
import re

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)

_VERSION_LINEBREAK = re.compile(r"(\d\.)\n(\d)")
_SOFT_NEWLINE = re.compile(r"(?<![。！？.!?:\：\n])\n(?!\s*[\n•\-\*\d])")
_HEADING_RE = re.compile(r"^#{1,6}\s", re.MULTILINE)

_sat_model = None


def _get_sat_model():
    """Lazily load the wtpsplit sentence segmentation model.

    sat-1l-sm is a tiny 1-layer model; CPU is fast enough and avoids
    compatibility issues between wtpsplit 2.2.x and transformers 5.x on GPU.
    SaT.half()/to() return the inner nn.Module, dropping wrapper methods
    (predict_proba, split), so we keep the SaT wrapper on CPU.
    """
    global _sat_model
    if _sat_model is None:
        import contextlib
        import io
        import time as _t

        _t0 = _t.monotonic()
        logger.info("正在加载 wtpsplit 句子分割模型: %s (device=cpu) ...", settings.SENTENCE_MODEL)
        from wtpsplit import SaT

        # 抑制 safetensors / tqdm 进度条（会输出到 stderr）
        with contextlib.redirect_stderr(io.StringIO()):
            _sat_model = SaT(settings.SENTENCE_MODEL)
        logger.info(
            "wtpsplit 模型加载完成 (%.1fs), device=cpu", _t.monotonic() - _t0
        )
    return _sat_model


def _normalize_text(text: str) -> str:
    """将 PDF 等排版产生的"软换行"合并为连续文本，保留真正的段落分隔和列表结构。"""
    text = _VERSION_LINEBREAK.sub(r"\1\2", text)
    return _SOFT_NEWLINE.sub("", text)


def split_text(text: str, method: str | None = None) -> list[str]:
    """将文本切分为多个分块。

    支持两种分块策略（由 CHUNK_METHOD 配置决定，默认 semantic）：
    - semantic：语义分块 — wtpsplit 概率 + DP 最优句子分割 + 标题感知合并
    - naive：朴素分块 — 固定滑动窗口切分，不关注语义边界
    """
    method = method or settings.CHUNK_METHOD
    logger.info(
        "分块配置: method=%s, chunk_size=%d, chunk_overlap=%d, 原文长度=%d 字符",
        method,
        settings.CHUNK_SIZE,
        settings.CHUNK_OVERLAP,
        len(text),
    )

    normalized = _normalize_text(text)
    if len(normalized) != len(text):
        logger.info(
            "文本预处理: 合并软换行后 %d → %d 字符", len(text), len(normalized)
        )

    if method == "semantic":
        chunks = _semantic_split(normalized)
    else:
        chunks = _naive_split(normalized)
    return _log_chunks(chunks)


def split_table_text(text: str) -> list[str]:
    """表格专用分块：按预分段的 Markdown 表格 \\n\\n 边界切分。"""
    table_chunk_size = settings.TABLE_CHUNK_SIZE
    segments = [seg.strip() for seg in re.split(r"\n{2,}", text) if seg.strip()]

    final: list[str] = []
    for seg in segments:
        if len(seg) <= table_chunk_size:
            final.append(seg)
        else:
            final.extend(_naive_split(seg, chunk_size=table_chunk_size))

    logger.info(
        "表格分块: TABLE_CHUNK_SIZE=%d, 原文=%d 字符",
        table_chunk_size,
        len(text),
    )
    return _log_chunks(final)


def _log_chunks(chunks: list[str]) -> list[str]:
    logger.info("分块结果: %d 个分块", len(chunks))
    for i, c in enumerate(chunks):
        preview = c[:80].replace("\n", "\\n")
        logger.info("  分块[%d]: %d 字符, 前80字: %s...", i, len(c), preview)
    return chunks


def _naive_split(text: str, *, chunk_size: int | None = None) -> list[str]:
    """朴素分块：固定滑动窗口。"""
    chunk_size = chunk_size or settings.CHUNK_SIZE
    overlap = settings.CHUNK_OVERLAP

    if len(text) <= chunk_size:
        return [text.strip()] if text.strip() else []

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = end - overlap
    return chunks


# ---------------------------------------------------------------------------
# 句子分割：借鉴 RAGLite 的 DP 概率优化 + Markdown 标题边界感知
# ---------------------------------------------------------------------------

def _markdown_heading_boundaries(text: str) -> np.ndarray:
    """从 Markdown 文本中确定已知的句子边界。

    借鉴 RAGLite: 标题行被视为独立句子——标题前强制分割，标题内部不分割。
    返回: 与 text 等长的概率数组, NaN = 使用模型预测, 1.0 = 强制边界, 0.0 = 禁止边界
    """
    boundary_probas = np.full(len(text), np.nan)

    lines = text.split("\n")
    pos = 0
    for line in lines:
        line_end = pos + len(line)
        stripped = line.strip()
        is_heading = bool(re.match(r"^#{1,6}\s", stripped))

        if is_heading:
            # Force boundary before heading start
            if pos > 0:
                boundary_probas[pos - 1] = 1.0
            # No boundaries inside heading
            boundary_probas[pos:line_end] = 0.0
            # Force boundary at heading end
            if line_end - 1 >= 0 and line_end - 1 < len(boundary_probas):
                boundary_probas[line_end - 1] = 1.0

        pos = line_end + 1  # +1 for the \n

    return boundary_probas


def _dp_split_sentences(
    text: str,
    probas: np.ndarray,
    *,
    min_len: int = 4,
    max_len: int | None = None,
) -> list[str]:
    """借鉴 RAGLite 的 DP 最优句子边界选择。

    最大化高概率边界处的分割，同时满足最小/最大句子长度约束。
    """
    threshold = 0.25
    n = len(probas)
    first_valid = min_len - 1
    last_valid = n - min_len - 1

    if last_valid < first_valid:
        return [text]

    scores = probas - threshold

    dp = np.full(n, -np.inf)
    back = np.full(n, -1, dtype=np.intp)

    if max_len is None:
        best_prev = -np.inf
        best_prev_idx = -1
        for i in range(first_valid, last_valid + 1):
            j = i - min_len
            if j >= first_valid and dp[j] > best_prev:
                best_prev = dp[j]
                best_prev_idx = j
            dp[i] = scores[i]
            if best_prev > -np.inf and best_prev + scores[i] > dp[i]:
                dp[i] = best_prev + scores[i]
                back[i] = best_prev_idx
    else:
        from collections import deque

        dq: deque[tuple[float, int]] = deque()
        for i in range(first_valid, last_valid + 1):
            j = i - min_len
            if j >= first_valid and np.isfinite(dp[j]):
                while dq and dq[-1][0] <= dp[j]:
                    dq.pop()
                dq.append((dp[j], j))
            while dq and dq[0][1] < i - max_len:
                dq.popleft()
            if i + 1 <= max_len:
                dp[i] = scores[i]
            if dq and dq[0][0] + scores[i] > dp[i]:
                dp[i] = dq[0][0] + scores[i]
                back[i] = dq[0][1]

    no_boundary_valid = max_len is None or max_len >= n
    best_score = 0.0 if no_boundary_valid else -np.inf
    best_last = -1
    answer_min = first_valid if max_len is None else max(first_valid, n - max_len - 1)
    for i in range(answer_min, last_valid + 1):
        if dp[i] > best_score:
            best_score = dp[i]
            best_last = i

    if best_last == -1:
        return [text]

    boundaries: list[int] = []
    pos = best_last
    while pos >= 0:
        boundaries.append(pos)
        pos = back[pos]
    boundaries.reverse()

    partition_indices = [b + 1 for b in boundaries]
    sentences = []
    prev = 0
    for idx in partition_indices:
        sentences.append(text[prev:idx])
        prev = idx
    if prev < len(text):
        sentences.append(text[prev:])
    return sentences


def _split_sentences_with_wtpsplit(text: str) -> list[str]:
    """使用 wtpsplit 概率分数 + Markdown 标题边界 + DP 优化进行句子分割。

    与简单的 model.split() 不同，这里使用 predict_proba() 获取每个字符的
    句子边界概率，然后用 DP 在满足长度约束的前提下最大化边界质量。
    """
    model = _get_sat_model()

    # 获取逐字符的句子边界概率
    try:
        probas = model.predict_proba(text, stride=128, block_size=256)
    except Exception:
        logger.warning("wtpsplit predict_proba 失败，回退到 split()", exc_info=True)
        return [s.strip() for s in model.split(text) if s.strip()]

    probas = np.array(probas, dtype=np.float32)

    # 用 Markdown 标题边界覆盖模型预测
    known_boundaries = _markdown_heading_boundaries(text)
    finite_mask = np.isfinite(known_boundaries)
    probas[finite_mask] = known_boundaries[finite_mask]

    # 传播边界概率：空白字符的边界应移到尾部
    is_space = np.array([c.isspace() for c in text], dtype=bool)
    for i in range(len(text) - 1):
        if not is_space[i] and is_space[i + 1]:
            # Start of a whitespace run: find end
            j = i + 1
            while j < len(text) and is_space[j]:
                j += 1
            if j < len(text):
                max_p = np.max(probas[i:j])
                probas[i : j - 1] = np.min(probas[i:j])
                probas[j - 1] = max_p

    # DP 优化句子边界
    sentences = _dp_split_sentences(text, probas, min_len=4, max_len=None)

    # 对超长句子进行二次分割
    max_sentence_len = settings.CHUNK_SIZE
    result: list[str] = []
    for sent in sentences:
        if len(sent) <= max_sentence_len:
            if sent.strip():
                result.append(sent)
        else:
            # 带 max_len 约束重新 DP 分割
            start_idx = text.find(sent)
            if start_idx >= 0:
                sub_probas = probas[start_idx : start_idx + len(sent)]
                sub_sents = _dp_split_sentences(
                    sent, sub_probas, min_len=4, max_len=max_sentence_len
                )
                result.extend(s for s in sub_sents if s.strip())
            else:
                result.append(sent)

    return result


# ---------------------------------------------------------------------------
# 语义分块：DP 合并句子 + Markdown 标题感知
# ---------------------------------------------------------------------------

def _dp_merge_sentences(
    sentences: list[str], chunk_size: int, overlap_chars: int
) -> list[str]:
    """使用动态规划将句子合并为最优分块，感知 Markdown 标题结构。

    借鉴 RAGLite 的 split_chunks 理念：
    - 鼓励在 Markdown 标题行前分割（标题开启新 chunk）
    - 避免在标题行后立即分割（标题与后续内容保持在同一 chunk）
    - 目标: 最小化分块数量，同时每 chunk 不超过 chunk_size
    """
    n = len(sentences)
    if n == 0:
        return []

    sent_lens = [len(s) for s in sentences]

    # 检测哪些句子是 Markdown 标题
    is_heading = [bool(re.match(r"^\s*#{1,6}\s", s)) for s in sentences]

    INF = float("inf")
    cost = [INF] * (n + 1)
    cost[0] = 0
    parent = [-1] * (n + 1)

    for i in range(1, n + 1):
        total = 0
        j = i
        while j >= 1:
            total += sent_lens[j - 1]
            sep_chars = i - j
            if total + sep_chars > chunk_size and j < i:
                break

            # 分块质量惩罚：标题开头的 chunk 更优
            penalty = 0.0
            start_sent_idx = j - 1
            if is_heading[start_sent_idx] and j > 1:
                # 当前 chunk 以标题开头且不是文档开头——这是好的分割点
                penalty = -0.5
            elif j > 1 and is_heading[j - 2]:
                # 上一个 chunk 的最后一句是标题——标题与后续内容被分开了，惩罚
                penalty = 1.0

            new_cost = cost[j - 1] + 1 + penalty
            if new_cost < cost[i]:
                cost[i] = new_cost
                parent[i] = j - 1
            j -= 1

    # Reconstruct chunk boundaries
    boundaries: list[int] = []
    pos = n
    while pos > 0:
        boundaries.append(pos)
        pos = parent[pos]
    boundaries.reverse()

    chunks: list[str] = []
    prev_end = 0
    for end in boundaries:
        chunk_sents = sentences[prev_end:end]
        chunk_text = "\n".join(chunk_sents).strip()
        if chunk_text:
            chunks.append(chunk_text)
        prev_end = end

    # Sentence-level overlap
    if overlap_chars > 0 and len(chunks) > 1:
        overlapped: list[str] = [chunks[0]]
        groups: list[list[str]] = []
        prev_end = 0
        for end in boundaries:
            groups.append(sentences[prev_end:end])
            prev_end = end

        for i in range(1, len(groups)):
            prev_group = groups[i - 1]
            overlap_sents: list[str] = []
            overlap_len = 0
            for s in reversed(prev_group):
                if overlap_len + len(s) + 1 > overlap_chars and overlap_sents:
                    break
                overlap_sents.insert(0, s)
                overlap_len += len(s) + 1

            combined = overlap_sents + groups[i]
            chunk_text = "\n".join(combined).strip()
            if chunk_text:
                overlapped.append(chunk_text)
        chunks = overlapped

    return chunks


def _semantic_split(text: str) -> list[str]:
    """语义分块：wtpsplit DP 概率优化句子分割 + 标题感知 DP 合并。

    完整流程（借鉴 RAGLite 核心算法）：
    1. wtpsplit predict_proba() 获取逐字符边界概率
    2. Markdown 标题边界硬约束覆盖
    3. DP 优化选择最优句子边界
    4. DP 将句子合并为 chunk，标题感知避免破坏文档结构
    5. 句子级语义重叠
    """
    try:
        sentences = _split_sentences_with_wtpsplit(text)
    except Exception:
        logger.warning("wtpsplit 句子分割失败，回退到正则分割", exc_info=True)
        sentences = _regex_split_sentences(text)

    sentences = [s for s in sentences if s.strip()]
    logger.info("语义分块: 分割得到 %d 个句子", len(sentences))

    if not sentences:
        logger.info("语义分块: 未提取到有效句子，回退到朴素分块")
        return _naive_split(text)

    chunk_size = settings.CHUNK_SIZE
    chunks = _dp_merge_sentences(sentences, chunk_size, settings.CHUNK_OVERLAP)

    # 对超过 chunk_size 的分块做二次切割
    final: list[str] = []
    for chunk in chunks:
        if len(chunk) <= chunk_size:
            final.append(chunk)
        else:
            final.extend(_naive_split(chunk))

    return final if final else _naive_split(text)


def _regex_split_sentences(text: str) -> list[str]:
    """Fallback: regex-based sentence splitting for when wtpsplit is unavailable."""
    paragraphs = re.split(r"\n{2,}", text)
    sentences: list[str] = []
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        sents = re.split(r"(?<=[。！？；!?;])\s*|(?<=\.)\s+", para)
        sentences.extend(s.strip() for s in sents if s.strip())
    return sentences
