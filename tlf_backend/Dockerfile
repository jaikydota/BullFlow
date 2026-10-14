# ============================================================
# Stage 1: Builder
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

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

WORKDIR /app

EXPOSE 8041

CMD ["uvicorn", "tlf_app.main:app", "--host", "0.0.0.0", "--port", "8041", "--workers", "1"]
