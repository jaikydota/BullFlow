from __future__ import annotations

import csv
import io
import logging
import os
import re
import tempfile
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)

# Pandoc 支持的格式（优先走 Pandoc → GFM，XLSX/CSV/PPTX 保留内置专用解析）
# 注意：PPTX/PPT 不在此列，改用 python-pptx 原生解析，避免音视频二进制污染
_PANDOC_TYPES: frozenset[str] = frozenset({
    "docx", "doc",          # Word
    "html", "htm",          # HTML
    "epub",                 # 电子书
    "rtf",                  # Rich Text
    "odt",                  # OpenDocument
    "rst",                  # reStructuredText
    "latex", "tex",         # LaTeX
})

# OCR 支持的格式（PaddleOCR PP-StructureV3 原生支持：PDF + 图片）
# PPTX/DOCX 由专用解析器处理，不通过 OCR 接口（OCR 不直接接受这些格式）
_OCR_TYPES: frozenset[str] = frozenset({
    "pdf", "png", "jpg", "jpeg",
})

# 二进制格式特征：非文本文件不允许进入纯文本兜底路径
# 若文件头匹配这些 magic bytes，说明是二进制，直接拒绝而非乱码处理
_BINARY_MAGIC: list[bytes] = [
    b"PK\x03\x04",   # ZIP / Office Open XML (docx, pptx, xlsx)
    b"\xd0\xcf\x11\xe0",  # OLE2 / 旧版 Office (doc, ppt, xls)
    b"%PDF",         # PDF
    b"\x89PNG",      # PNG
    b"\xff\xd8\xff", # JPEG
    b"GIF8",         # GIF
    b"RIFF",         # WAV / AVI
    b"ID3",          # MP3
    b"\x1f\x8b",     # gzip
    b"BM",           # BMP
]


@dataclass
class HeadingInfo:
    level: int
    title: str
    start_pos: int


@dataclass
class ParseResult:
    text: str
    headings: list[HeadingInfo] = field(default_factory=list)


async def parse_file(file_bytes: bytes, file_type: str) -> ParseResult:
    """根据文件类型提取纯文本内容和标题层级。

    解析优先级（由高到低）：
      1. PaddleOCR  – PDF/图片/DOCX/PPTX（启用时）
      2. Pandoc     – DOCX/PPTX/HTML/EPUB/RTF/ODT 等（启用时）
      3. 内置解析器  – PDF(PyMuPDF) / XLSX / CSV / MD / TXT
      4. 纯文本兜底  – 未知格式

    每一层失败时均输出 WARNING 日志后降级到下一层。
    """
    from app.core.config import settings

    file_type = file_type.lower().strip(".")

    # ── 路径 1：PaddleOCR ──────────────────────────────────────────────
    if settings.OCR_ENABLED and file_type in _OCR_TYPES:
        _do_ocr = True
        if file_type == "pdf" and settings.PDF_MAX_OCR_PAGES > 0:
            # 通过 xref 目录读页数，不渲染任何页面，耗时 < 5ms
            import fitz
            with fitz.open(stream=file_bytes, filetype="pdf") as _doc:
                _page_count = len(_doc)
            if _page_count > settings.PDF_MAX_OCR_PAGES:
                logger.warning(
                    "⚠️ [跳过OCR] PDF 共 %d 页，超过上限 %d 页，降级使用 PyMuPDF 解析",
                    _page_count, settings.PDF_MAX_OCR_PAGES,
                )
                _do_ocr = False

        if _do_ocr:
            try:
                from app.services.ocr_service import parse_document_with_ocr
                text = await parse_document_with_ocr(file_bytes, file_type)
                headings = _extract_headings_from_markdown(text)
                logger.info(
                    "PaddleOCR 解析完成 [%s]: %d 字符, %d 个标题",
                    file_type, len(text), len(headings),
                )
                return ParseResult(text=text, headings=headings)
            except Exception as exc:
                logger.warning(
                    "⚠️ [降级] PaddleOCR 解析失败，将尝试下一级解析器 "
                    "[文件类型=%s] 原因: %s",
                    file_type, exc,
                )
                if not settings.OCR_FALLBACK_TO_PYMUPDF:
                    raise

    # ── 路径 2：Pandoc → GFM（子进程调用，放线程池避免阻塞事件循环） ──
    import asyncio as _aio
    if settings.PANDOC_ENABLED and file_type in _PANDOC_TYPES:
        try:
            return await _aio.to_thread(_parse_with_pandoc, file_bytes, file_type)
        except Exception as exc:
            logger.warning(
                "⚠️ [降级] Pandoc 解析失败，将尝试内置解析器 "
                "[文件类型=%s] 原因: %s",
                file_type, exc,
            )
            # fall through to built-in parsers

    # ── 路径 3：内置解析器 ─────────────────────────────────────────────
    # _parse_pptx 是 async（并发 OCR），其余为同步函数，统一放线程池
    sync_parsers = {
        "pdf":      _parse_pdf,
        "docx":     _parse_docx,
        "doc":      _parse_docx,
        "xlsx":     _parse_xlsx,
        "xls":      _parse_xlsx,
        "txt":      _parse_text,
        "csv":      _parse_csv,
        "md":       _parse_markdown,
        "markdown": _parse_markdown,
    }
    if file_type in ("pptx", "ppt"):
        try:
            return await _parse_pptx(file_bytes)
        except Exception as exc:
            logger.warning(
                "⚠️ [降级] 内置解析器失败 [文件类型=%s] 原因: %s",
                file_type, exc,
            )
    parser = sync_parsers.get(file_type)
    if parser is not None:
        try:
            return await _aio.to_thread(parser, file_bytes)
        except Exception as exc:
            logger.warning(
                "⚠️ [降级] 内置解析器失败 [文件类型=%s] 原因: %s",
                file_type, exc,
            )

    # ── 路径 4：纯文本兜底（严格限制：二进制文件直接拒绝） ─────────────
    if _is_binary(file_bytes):
        logger.error(
            "❌ [拒绝] 检测到二进制文件内容，放弃解析 [文件类型=%s]。"
            "请开启 OCR 或提供可解析格式（PDF/DOCX/MD/TXT 等）。",
            file_type,
        )
        return ParseResult(text="", headings=[])

    logger.warning(
        "⚠️ [降级] 使用纯文本兜底解析 [文件类型=%s]，"
        "建议确认该格式是否需要专用解析器",
        file_type,
    )
    return ParseResult(text=_parse_text_raw(file_bytes), headings=[])


# ──────────────────────────────────────────────────────────────────────
# Pandoc 解析
# ──────────────────────────────────────────────────────────────────────

_PANDOC_SUFFIX_MAP: dict[str, str] = {
    "doc": ".doc", "docx": ".docx",
    "ppt": ".ppt", "pptx": ".pptx",
    "html": ".html", "htm": ".htm",
    "epub": ".epub", "rtf": ".rtf",
    "odt": ".odt", "rst": ".rst",
    "latex": ".tex", "tex": ".tex",
}


def _parse_with_pandoc(data: bytes, file_type: str) -> ParseResult:
    """使用系统 Pandoc 将文档转换为 GitHub Flavored Markdown。

    Pandoc 需要读取磁盘文件，因此使用临时文件传入数据。
    输出 GFM 格式，heading、粗体、列表、表格均被完整保留。
    """
    import pypandoc

    suffix = _PANDOC_SUFFIX_MAP.get(file_type, f".{file_type}")

    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(data)
            tmp_path = f.name

        text: str = pypandoc.convert_file(
            tmp_path,
            to="gfm",
            extra_args=["--wrap=none"],  # 不自动换行，保留原始段落结构
        )
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    # 清理 Pandoc 可能产生的多余空行
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    headings = _extract_headings_from_markdown(text)
    logger.info(
        "Pandoc 解析完成 [%s]: %d 字符, %d 个标题",
        file_type, len(text), len(headings),
    )
    return ParseResult(text=text, headings=headings)


# ──────────────────────────────────────────────────────────────────────
# 工具函数
# ──────────────────────────────────────────────────────────────────────

def _is_binary(data: bytes) -> bool:
    """检测数据是否为二进制文件（通过 magic bytes 匹配）。"""
    for magic in _BINARY_MAGIC:
        if data[:len(magic)] == magic:
            return True
    return False


def _extract_headings_from_markdown(text: str) -> list[HeadingInfo]:
    """从 Markdown 文本中提取所有标题行及其位置。"""
    headings: list[HeadingInfo] = []
    for m in _HEADING_RE.finditer(text):
        headings.append(HeadingInfo(
            level=len(m.group(1)),
            title=m.group(2).strip(),
            start_pos=m.start(),
        ))
    return headings


# ──────────────────────────────────────────────────────────────────────
# 内置解析器（作为 Pandoc / OCR 的 fallback）
# ──────────────────────────────────────────────────────────────────────

async def _parse_pptx(data: bytes) -> ParseResult:
    """PowerPoint 解析：python-pptx 提取文字 + 并发 OCR 幻灯片图片。

    处理策略：
    - 每张幻灯片标题 → Markdown H2 标题
    - 文本框内容 → 正文段落
    - 演讲者备注 → "> 备注：..." 追加到幻灯片末尾
    - 嵌入图片 → asyncio.gather 并发 OCR（需 PPTX_IMAGE_OCR_ENABLED=true 且 OCR 服务可用）
    - 音频/视频 → 完全忽略（无法提取文字）
    """
    import asyncio

    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    from app.core.config import settings

    prs = Presentation(io.BytesIO(data))

    # ── 第一步：收集每张幻灯片的文字内容和图片字节 ────────────────────────
    SlideData = tuple[int, str, list[str], str, list[bytes]]
    slides_data: list[SlideData] = []
    skipped_media = 0
    total_images = 0

    for slide_idx, slide in enumerate(prs.slides, start=1):
        slide_parts: list[str] = []
        slide_title = ""
        image_blobs: list[bytes] = []

        for shape in slide.shapes:
            # 音频/视频：完全忽略
            if shape.shape_type in (
                MSO_SHAPE_TYPE.MEDIA,
                MSO_SHAPE_TYPE.LINKED_OLE_OBJECT,
                MSO_SHAPE_TYPE.EMBEDDED_OLE_OBJECT,
            ):
                skipped_media += 1
                continue

            # 嵌入图片：收集字节，稍后并发 OCR
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                try:
                    image_blobs.append(shape.image.blob)
                    total_images += 1
                except Exception:
                    pass
                continue

            # 文字 shape
            if not shape.has_text_frame:
                continue
            text = shape.text_frame.text.strip()
            if not text:
                continue

            is_title = (
                shape.is_placeholder
                and shape.placeholder_format is not None
                and shape.placeholder_format.idx == 0
            )
            if is_title and not slide_title:
                slide_title = text
            else:
                slide_parts.append(text)

        notes_text = ""
        if slide.has_notes_slide:
            notes_text = slide.notes_slide.notes_text_frame.text.strip()

        slides_data.append((slide_idx, slide_title, slide_parts, notes_text, image_blobs))

    # ── 第二步：并发 OCR 所有图片 ─────────────────────────────────────────
    # ocr_map: (slide_idx, img_idx) → ocr_text
    ocr_map: dict[tuple[int, int], str] = {}

    use_image_ocr = (
        settings.PPTX_IMAGE_OCR_ENABLED
        and settings.OCR_ENABLED
        and total_images > 0
    )

    if use_image_ocr:
        from app.services.ocr_service import parse_document_with_ocr

        async def _ocr_one(blob: bytes) -> str:
            try:
                # 通过文件头判断实际格式，只发送 PaddleOCR 支持的图片类型
                if blob[:3] == b"\xff\xd8\xff":
                    fmt = "jpeg"
                elif blob[:4] == b"\x89PNG":
                    fmt = "png"
                elif blob[:2] in (b"BM",):
                    fmt = "bmp"
                else:
                    # EMF/WMF/SVG 等矢量格式 PaddleOCR 不支持，直接跳过
                    logger.debug("PPTX 图片格式不支持 OCR，已跳过（magic=%s）", blob[:4].hex())
                    return ""
                return await parse_document_with_ocr(blob, fmt)
            except Exception as exc:
                logger.debug("PPTX 图片 OCR 单张失败（已跳过）: %s", exc)
                return ""

        # 构建 (key, coro) 列表，asyncio.gather 并发执行
        keys: list[tuple[int, int]] = []
        coros = []
        for slide_idx, _, _, _, blobs in slides_data:
            for img_idx, blob in enumerate(blobs):
                keys.append((slide_idx, img_idx))
                coros.append(_ocr_one(blob))

        try:
            results = await asyncio.gather(*coros)
            ocr_map = dict(zip(keys, results))
        except Exception as exc:
            logger.warning("PPTX 图片 OCR 批量失败，跳过所有图片: %s", exc)

        success_count = sum(1 for v in ocr_map.values() if v.strip())
        logger.info(
            "PPTX 图片 OCR 完成: %d 张图片，成功提取 %d 张",
            total_images, success_count,
        )

    # ── 第三步：组装 Markdown ─────────────────────────────────────────────
    parts: list[str] = []
    headings: list[HeadingInfo] = []
    current_pos = 0

    for slide_idx, slide_title, slide_parts, notes_text, image_blobs in slides_data:
        heading_text = slide_title or f"幻灯片 {slide_idx}"
        headings.append(HeadingInfo(level=2, title=heading_text, start_pos=current_pos))

        block_lines: list[str] = [f"## {heading_text}"]
        block_lines.extend(slide_parts)

        for img_idx in range(len(image_blobs)):
            ocr_text = ocr_map.get((slide_idx, img_idx), "").strip()
            if ocr_text:
                block_lines.append(ocr_text)

        if notes_text:
            block_lines.append(f"\n> 备注：{notes_text}")

        block = "\n\n".join(block_lines)
        parts.append(block)
        current_pos += len(block) + 2

    if skipped_media > 0:
        logger.info("PPTX 解析：已跳过 %d 个音频/视频对象", skipped_media)

    text = "\n\n".join(parts)
    logger.info(
        "PPTX 解析完成: %d 张幻灯片, %d 张图片(OCR=%s), %d 个标题, %d 字符",
        len(prs.slides), total_images,
        "开启" if use_image_ocr else "关闭",
        len(headings), len(text),
    )
    return ParseResult(text=text, headings=headings)


def _parse_pdf(data: bytes) -> ParseResult:
    """PDF 解析：PyMuPDF 逐页提取 Markdown 格式文本。

    PyMuPDF 1.24+ 的 get_text("markdown") 模式会根据字体大小推断标题级别，
    输出带 # 标题标记的 GFM Markdown，比纯文本更适合后续分块和检索。
    适用于含文字层的 PDF；纯扫描件无文字层时输出为空，应由 OCR 处理。
    """
    import fitz

    with fitz.open(stream=data, filetype="pdf") as doc:
        page_count = len(doc)
        pages: list[str] = [page.get_text("markdown") for page in doc]

    text = "\n\n".join(p for p in pages if p.strip())
    headings = _extract_headings_from_markdown(text)
    logger.info(
        "PyMuPDF 解析完成: %d 页, %d 字符, %d 个标题",
        page_count, len(text), len(headings),
    )
    return ParseResult(text=text, headings=headings)


def _parse_docx(data: bytes) -> ParseResult:
    """Word 文档解析（fallback）：按文档顺序提取段落和表格，输出 Markdown 格式。"""
    from docx import Document

    doc = Document(io.BytesIO(data))
    parts: list[str] = []
    headings: list[HeadingInfo] = []
    current_pos = 0

    for element in doc.element.body:
        tag = element.tag.split("}")[-1] if "}" in element.tag else element.tag

        if tag == "p":
            text = ""
            style_name = ""
            for para in doc.paragraphs:
                if para._element is element:
                    text = para.text.strip()
                    style_name = para.style.name if para.style else ""
                    break
            if text:
                heading_level = _docx_style_to_heading_level(style_name)
                if heading_level > 0:
                    md_prefix = "#" * heading_level
                    formatted = f"{md_prefix} {text}"
                    headings.append(HeadingInfo(
                        level=heading_level,
                        title=text,
                        start_pos=current_pos,
                    ))
                    parts.append(formatted)
                    current_pos += len(formatted) + 2
                else:
                    parts.append(text)
                    current_pos += len(text) + 2

        elif tag == "tbl":
            for table in doc.tables:
                if table._element is element:
                    rows_data: list[list[str]] = []
                    for row in table.rows:
                        cells = [cell.text.strip() for cell in row.cells]
                        if any(cells):
                            rows_data.append(cells)
                    if rows_data:
                        max_cols = max(len(r) for r in rows_data)
                        for r in rows_data:
                            r.extend([""] * (max_cols - len(r)))
                        header = rows_data[0]
                        md_lines = ["| " + " | ".join(h or " " for h in header) + " |"]
                        md_lines.append("| " + " | ".join(["---"] * max_cols) + " |")
                        for row_data in rows_data[1:]:
                            md_lines.append(
                                "| " + " | ".join(c or " " for c in row_data) + " |"
                            )
                        table_text = "\n".join(md_lines)
                        parts.append(table_text)
                        current_pos += len(table_text) + 2
                    break

    text = "\n\n".join(parts)
    logger.info(
        "python-docx 解析完成 (fallback): %d 个段落/表格块, %d 个标题, %d 字符",
        len(parts), len(headings), len(text),
    )
    return ParseResult(text=text, headings=headings)


def _docx_style_to_heading_level(style_name: str) -> int:
    """将 DOCX 段落样式名称转换为标题级别（0 表示非标题）。"""
    if not style_name:
        return 0
    style_lower = style_name.lower().strip()
    for i in range(1, 7):
        if style_lower in (f"heading {i}", f"heading{i}", f"标题 {i}", f"标题{i}"):
            return i
    if style_lower in ("title", "标题"):
        return 1
    if style_lower in ("subtitle", "副标题"):
        return 2
    return 0


def _parse_xlsx(data: bytes) -> ParseResult:
    """Excel 解析：智能处理合并单元格，输出分段 Markdown 表格。"""
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(data), data_only=True)
    all_segments: list[str] = []
    headings: list[HeadingInfo] = []
    current_pos = 0

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        total_cols = ws.max_column or 1

        sheet_heading = f"# {sheet_name}"
        headings.append(HeadingInfo(level=1, title=sheet_name, start_pos=current_pos))
        all_segments.append(sheet_heading)
        current_pos += len(sheet_heading) + 2

        standalone_texts: list[str] = []
        large_merge_cells: set[tuple[int, int]] = set()
        small_merge_skip: set[tuple[int, int]] = set()

        for mr in ws.merged_cells.ranges:
            val = ws.cell(mr.min_row, mr.min_col).value
            col_span = mr.max_col - mr.min_col + 1
            is_large = col_span > max(2, total_cols * 0.5)

            if is_large:
                if val is not None:
                    standalone_texts.append(str(val).strip())
                for r in range(mr.min_row, mr.max_row + 1):
                    for c in range(mr.min_col, mr.max_col + 1):
                        large_merge_cells.add((r, c))
            else:
                for r in range(mr.min_row, mr.max_row + 1):
                    for c in range(mr.min_col, mr.max_col + 1):
                        if (r, c) != (mr.min_row, mr.min_col):
                            small_merge_skip.add((r, c))

        rows_data: list[list[str]] = []
        for row in ws.iter_rows(min_row=1, max_row=ws.max_row):
            cells: list[str] = []
            row_has_data = False
            for cell in row:
                key = (cell.row, cell.column)
                if key in large_merge_cells or key in small_merge_skip:
                    cells.append("")
                elif cell.value is not None:
                    text = str(cell.value).strip().replace("\n", " ")
                    cells.append(text)
                    if text:
                        row_has_data = True
                else:
                    cells.append("")
            if row_has_data:
                rows_data.append(cells)

        if rows_data:
            n_cols = max(len(r) for r in rows_data)
            for r in rows_data:
                r.extend([""] * (n_cols - len(r)))
            keep_cols = [
                j
                for j in range(n_cols)
                if any(rows_data[i][j] for i in range(len(rows_data)))
            ]
            if len(keep_cols) < n_cols:
                rows_data = [[r[j] for j in keep_cols] for r in rows_data]

        for txt in standalone_texts:
            if txt.strip():
                all_segments.append(txt.strip())
                current_pos += len(txt.strip()) + 2

        if len(rows_data) > 1:
            header = rows_data[0]
            data_rows = rows_data[1:]
            segments = _table_to_segmented_markdown(
                header, data_rows, title=f"Sheet: {sheet_name}"
            )
            for seg in segments:
                all_segments.append(seg)
                current_pos += len(seg) + 2
        elif len(rows_data) == 1:
            seg = " | ".join(rows_data[0])
            all_segments.append(seg)
            current_pos += len(seg) + 2

    wb.close()
    result = "\n\n".join(all_segments)
    logger.info(
        "Excel 解析完成: %d 个 Sheet, %d 个分段, %d 字符",
        len(wb.sheetnames), len(all_segments), len(result),
    )
    return ParseResult(text=result, headings=headings)


def _parse_csv(data: bytes) -> ParseResult:
    """CSV 解析：输出分段 Markdown 表格，每段都带表头。"""
    text = data.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = [row for row in reader if any(cell.strip() for cell in row)]

    if not rows:
        return ParseResult(text="", headings=[])

    headers = rows[0]
    data_rows = rows[1:]

    if not data_rows:
        return ParseResult(text=" | ".join(headers), headings=[])

    max_cols = max(len(headers), *(len(r) for r in data_rows))
    while len(headers) < max_cols:
        headers.append(f"列{len(headers) + 1}")
    for r in data_rows:
        r.extend([""] * (max_cols - len(r)))

    segments = _table_to_segmented_markdown(headers, data_rows)
    result = "\n\n".join(segments)
    logger.info(
        "CSV 解析完成: %d 行 × %d 列, %d 个分段",
        len(data_rows), max_cols, len(segments),
    )
    return ParseResult(text=result, headings=[])


def _parse_markdown(data: bytes) -> ParseResult:
    """Markdown 解析：UTF-8 解码 + 标题提取。"""
    text = data.decode("utf-8", errors="replace")
    headings = _extract_headings_from_markdown(text)
    return ParseResult(text=text, headings=headings)


def _parse_text(data: bytes) -> ParseResult:
    """纯文本解析：UTF-8 解码。"""
    text = data.decode("utf-8", errors="replace")
    headings = _extract_headings_from_markdown(text)
    return ParseResult(text=text, headings=headings)


def _parse_text_raw(data: bytes) -> str:
    return data.decode("utf-8", errors="replace")


# ──────────────────────────────────────────────────────────────────────
# 表格分段工具
# ──────────────────────────────────────────────────────────────────────

def _table_to_segmented_markdown(
    headers: list[str],
    data_rows: list[list[str]],
    title: str | None = None,
) -> list[str]:
    """将表格转为分段 Markdown，每段带表头，每段 <= TABLE_CHUNK_SIZE 字符。"""
    from app.core.config import settings

    chunk_size = settings.TABLE_CHUNK_SIZE
    header_line = "| " + " | ".join(h or " " for h in headers) + " |"
    sep_line = "| " + " | ".join(["---"] * len(headers)) + " |"
    header_block = header_line + "\n" + sep_line
    if title:
        header_block = f"## {title}\n{header_block}"
    header_len = len(header_block) + 1

    segments: list[str] = []
    current_rows: list[str] = []
    current_size = header_len

    for row in data_rows:
        row_line = "| " + " | ".join(c or " " for c in row) + " |"
        row_len = len(row_line) + 1

        if current_size + row_len > chunk_size and current_rows:
            segments.append(header_block + "\n" + "\n".join(current_rows))
            current_rows = [row_line]
            current_size = header_len + row_len
        else:
            current_rows.append(row_line)
            current_size += row_len

    if current_rows:
        segments.append(header_block + "\n" + "\n".join(current_rows))

    return segments
