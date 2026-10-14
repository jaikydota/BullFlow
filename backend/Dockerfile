# ============================================================
# Stage 1: Builder – install Python dependencies
# ============================================================
FROM python:3.12-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install \
    --timeout 300 --retries 5 \
    -r requirements.txt

# ============================================================
# Stage 2: Runtime
# ============================================================
FROM python:3.12-slim AS runtime

WORKDIR /app

# - libgl1 / libglib2.0-0: OpenCV / PaddleOCR 等 ML 库
# - pandoc: 文档解析降级链
# - curl: 健康检查 / 调试
# - libpango-1.0-0 / libpangoft2-1.0-0 / libcairo2 / libgdk-pixbuf-2.0-0:
#   WeasyPrint PDF 导出底层系统库（Python `weasyprint` 包只是 cffi 绑定，
#   必须配合 Pango / Cairo / GDK-PixBuf 才能渲染）
# - shared-mime-info: WeasyPrint 检测内嵌资源 MIME 类型
# - fonts-noto-cjk: PDF 中文渲染（缺则中文显示为方框）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    pandoc \
    curl \
    libpango-1.0-0 libpangoft2-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
    shared-mime-info fonts-noto-cjk fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Python packages
COPY --from=builder /install /usr/local

# FFmpeg / FFprobe（预编译二进制，直接拷入；获取方式见根目录 README「构建后端镜像」）
COPY docker_file/ffmpeg  /usr/local/bin/ffmpeg
COPY docker_file/ffprobe /usr/local/bin/ffprobe
RUN chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

# HuggingFace 模型（构建时打入，运行时零下载；下载方式见根目录 README）
COPY docker_file/models/ /root/.cache/huggingface/hub/

# 应用代码（精确拷贝，docker_file/ 不进 /app 避免重复存储模型）
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8021

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8021", "--workers", "1"]
