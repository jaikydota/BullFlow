#!/usr/bin/env bash
cd "$(dirname "$0")/tlf_backend"
source venv/bin/activate

exec uvicorn tlf_app.main:app --host 0.0.0.0 --port 8041 --reload --reload-dir tlf_app
