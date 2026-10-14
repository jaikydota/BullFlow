"""文章导出服务

将已生成文章转换为 PDF 或 DOCX，上传至 MinIO，返回公网可访问 URL。
所有阻塞 I/O（pypandoc / weasyprint）在线程池中执行，不阻塞事件循环。
"""
from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_SUPPORTED_FORMATS = {"pdf", "docx"}


async def export_article(
    generation_id: str,
    user_id: str,
    fmt: str,
    db: AsyncSession,
) -> str:
    """生成导出文件并上传 MinIO，返回公网 URL。

    Args:
        generation_id: GeneratedContent 记录 ID
        user_id:       用户 ID（用于鉴权和 MinIO 路径）
        fmt:           导出格式，"pdf" 或 "docx"
        db:            数据库会话

    Returns:
        MinIO 公网 URL（str）

    Raises:
        ValueError: 内容不存在 / 非文章 / 格式不支持
        RuntimeError: 导出或上传失败
    """
    if fmt not in _SUPPORTED_FORMATS:
        raise ValueError(f"不支持的导出格式：{fmt}，仅支持 pdf / docx")

    from app.models.generated_content import GeneratedContent
    from app.services.minio_service import MinIOService, path_to_url

    result = await db.execute(
        select(GeneratedContent).where(
            GeneratedContent.id == generation_id,
            GeneratedContent.user_id == user_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise ValueError("内容不存在或无权限")
    if record.type != "article":
        raise ValueError("仅文章内容支持导出")

    content = record.content or ""
    title = (record.title or "article").replace("/", "-").replace("\\", "-")[:80]

    # 在线程池中执行阻塞的文件转换
    loop = asyncio.get_event_loop()
    file_bytes: bytes = await loop.run_in_executor(
        None, _convert_sync, content, title, fmt
    )

    # 上传到 MinIO
    date_prefix = datetime.now().strftime("%Y-%m")
    ext = fmt
    object_name = f"{user_id}/exports/{date_prefix}/{generation_id}_{uuid.uuid4().hex[:8]}.{ext}"

    content_type = (
        "application/pdf"
        if fmt == "pdf"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )

    minio = MinIOService()
    await loop.run_in_executor(
        None,
        lambda: minio.client.put_object(
            minio.bucket,
            object_name,
            __import__("io").BytesIO(file_bytes),
            length=len(file_bytes),
            content_type=content_type,
        ),
    )

    return path_to_url(object_name)  # type: ignore[return-value]


def _convert_sync(content: str, title: str, fmt: str) -> bytes:
    """同步执行 pandoc / weasyprint 转换（运行于线程池）。"""
    import pypandoc

    if fmt == "docx":
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
            tmp_path = f.name
        try:
            pypandoc.convert_text(
                content, "docx", format="md", outputfile=tmp_path,
                extra_args=["--metadata", f"title={title}"],
            )
            with open(tmp_path, "rb") as f:
                return f.read()
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    # PDF
    import weasyprint

    html_body = pypandoc.convert_text(content, "html", format="md")
    escaped_title = title.replace("<", "&lt;").replace(">", "&gt;")
    full_html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>{escaped_title}</title>
<style>
  @page {{ margin: 20mm 18mm; }}
  body {{ font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
         font-size: 13px; line-height: 1.75; color: #222; max-width: 100%; }}
  h1 {{ font-size: 22px; margin: 0 0 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }}
  h2 {{ font-size: 17px; margin: 24px 0 10px; }}
  h3 {{ font-size: 14px; margin: 18px 0 8px; }}
  p  {{ margin: 0 0 10px; }}
  ul, ol {{ padding-left: 22px; margin: 0 0 10px; }}
  li {{ margin-bottom: 4px; }}
  code {{ background: #f3f4f6; padding: 1px 5px; border-radius: 3px;
          font-family: "Courier New", monospace; font-size: 12px; }}
  pre  {{ background: #f3f4f6; border-radius: 6px; padding: 12px 16px;
          overflow: auto; font-size: 12px; margin: 0 0 12px; }}
  blockquote {{ border-left: 4px solid #d1d5db; margin: 0 0 12px 0;
               padding: 6px 14px; color: #555; background: #f9fafb; }}
  table {{ border-collapse: collapse; width: 100%; margin-bottom: 12px; font-size: 12px; }}
  th, td {{ border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; }}
  th {{ background: #f3f4f6; font-weight: 600; }}
</style>
</head>
<body>
<h1>{escaped_title}</h1>
{html_body}
</body>
</html>"""
    return weasyprint.HTML(string=full_html).write_pdf()
