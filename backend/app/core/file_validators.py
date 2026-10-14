"""上传文件扩展名白名单（按扩展名区分文件类别）。"""
from __future__ import annotations

ALLOWED_DOCUMENT_EXTENSIONS = {
    "pdf", "docx", "xlsx", "txt", "csv", "md",
}
ALLOWED_IMAGE_EXTENSIONS = {
    "png", "jpg", "jpeg", "webp", "gif", "svg",
}
ALLOWED_VIDEO_EXTENSIONS = {
    "mp4", "webm", "mov", "avi",
}
ALLOWED_AUDIO_EXTENSIONS = {
    "mp3", "wav", "ogg", "flac", "m4a", "aac", "wma", "opus",
}
