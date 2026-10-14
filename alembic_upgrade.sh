#!/usr/bin/env bash
cd "$(dirname "$0")/backend"
source venv/bin/activate
alembic upgrade head
