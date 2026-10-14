#!/usr/bin/env bash
cd "$(dirname "$0")/backend"
source venv/bin/activate

# 屏蔽 HuggingFace Hub 的所有网络检查，使用本地已下载的模型
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
export HF_DATASETS_OFFLINE=1

uvicorn app.main:app --host 0.0.0.0 --port 8020 --reload --reload-dir app
