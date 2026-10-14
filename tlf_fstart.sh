#!/usr/bin/env bash
cd "$(dirname "$0")/tlf_frontend"

# 在 WSL 挂载的 Windows 磁盘等文件事件不可靠的环境下启用轮询，其他环境可删除
export CHOKIDAR_USEPOLLING=true
export CHOKIDAR_INTERVAL=1000

npm run dev
