"""PaddleOCR PP-StructureV3 文档解析服务。

API 端点（PaddleX 3.x serving）：
  POST /layout-parsing
  Content-Type: application/json
  Body: {"file": "<base64>", "fileType": 0|1}

  fileType:
    0 = PDF 文档
    1 = 图片（jpg / png / bmp 等）

响应结构：
  {
    "result": {
      "layoutParsingResults": [
        {"markdown": {"text": "..."}}
      ]
    },
    "errorCode": 0,
    "errorMsg": "Success"
  }

支持格式：
  - PDF       → fileType=0，直接发送
  - PNG/JPG 等 → fileType=1，直接发送（无需转 PDF）

PPTX/DOCX 由各自专用解析器处理，不经过此接口。
"""

from __future__ import annotations

import base64
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# fileType 映射（0=PDF，1=图片）
_FILE_TYPE_CODE: dict[str, int] = {
    "pdf":  0,
    "png":  1,
    "jpg":  1,
    "jpeg": 1,
    "bmp":  1,
    "tiff": 1,
    "tif":  1,
    "webp": 1,
}


async def parse_document_with_ocr(file_bytes: bytes, file_type: str) -> str:
    """使用 PaddleOCR PP-StructureV3 解析文档，返回 Markdown 文本。

    支持 PDF（fileType=0）和常见图片格式（fileType=1）。
    PPTX/DOCX 应使用各自专用解析器，不调用此函数。
    """
    if not settings.OCR_ENABLED:
        raise RuntimeError("OCR 未启用（OCR_ENABLED=false）")

    file_type = file_type.lower().strip(".")
    file_type_code = _FILE_TYPE_CODE.get(file_type)
    if file_type_code is None:
        raise ValueError(
            f"PaddleOCR 不支持 '{file_type}' 格式，"
            f"支持格式：{list(_FILE_TYPE_CODE)}"
        )

    url = f"{settings.OCR_SERVICE_URL}/layout-parsing"
    payload = {
        "file": base64.b64encode(file_bytes).decode("utf-8"),
        "fileType": file_type_code,
    }

    logger.info(
        "PaddleOCR 请求: POST %s [文件类型=%s, fileType=%d, 大小=%.1f KB]",
        url, file_type, file_type_code, len(file_bytes) / 1024,
    )

    async with httpx.AsyncClient(timeout=settings.OCR_TIMEOUT) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()

    markdown = _extract_markdown_from_response(data)
    logger.info(
        "PaddleOCR 解析完成 [%s]: 输出 %d 字符",
        file_type, len(markdown),
    )
    return markdown


def _extract_markdown_from_response(data: dict) -> str:
    """从 PP-StructureV3 /layout-parsing 响应中提取 Markdown 文本。

    响应结构：
      result.layoutParsingResults[].markdown.text
    """
    result = data.get("result", {})
    pages = result.get("layoutParsingResults", [])

    texts: list[str] = []
    for page in pages:
        md_obj = page.get("markdown", {})
        text = md_obj.get("text", "").strip()
        if text:
            texts.append(text)

    if texts:
        return "\n\n".join(texts)

    logger.warning(
        "PaddleOCR 响应中未找到 Markdown 内容，响应顶层 keys: %s",
        list(data.keys()),
    )
    return ""
