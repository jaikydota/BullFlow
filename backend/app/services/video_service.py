"""视频后台处理：ffprobe 提取元数据 + ffmpeg 生成缩略图。"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
import time

logger = logging.getLogger(__name__)


async def probe_video(file_bytes: bytes) -> dict:
    """用 ffprobe 解析视频元数据，返回 duration(秒)、width、height、resolution。"""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".tmp") as f:
        f.write(file_bytes)
        tmp_path = f.name

    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
            tmp_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f"ffprobe 失败: {stderr.decode()[:300]}")

        info = json.loads(stdout.decode())
        result: dict = {}

        # 时长（秒，取整）
        fmt_duration = info.get("format", {}).get("duration")
        if fmt_duration:
            result["duration"] = int(float(fmt_duration))

        # 分辨率：取第一条视频流
        for stream in info.get("streams", []):
            if stream.get("codec_type") == "video":
                w = stream.get("width")
                h = stream.get("height")
                if w and h:
                    result["width"] = w
                    result["height"] = h
                    result["resolution"] = f"{w}x{h}"
                break

        return result
    finally:
        os.unlink(tmp_path)


async def extract_thumbnail(file_bytes: bytes, seek_sec: float = 5.0) -> bytes:
    """用 ffmpeg 在指定时间戳截取一帧，返回 JPEG 字节。"""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".tmp") as f:
        f.write(file_bytes)
        input_path = f.name

    out_fd, out_path = tempfile.mkstemp(suffix=".jpg")
    os.close(out_fd)

    try:
        # -ss 放在 -i 前面走快速 seek（keyframe），不精确但速度快
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-ss", str(seek_sec),
            "-i", input_path,
            "-vframes", "1",
            "-q:v", "3",        # JPEG 质量（2=最高，5=平衡）
            "-vf", "scale='min(640,iw)':-2",  # 最大宽 640px，保持比例
            "-y",               # 覆盖输出
            out_path,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg 截图失败: {stderr.decode()[-300:]}")

        with open(out_path, "rb") as fh:
            return fh.read()
    finally:
        os.unlink(input_path)
        if os.path.exists(out_path):
            os.unlink(out_path)


async def extract_image_thumbnail(file_bytes: bytes, max_width: int = 480) -> bytes:
    """用 ffmpeg 将任意常见图片格式压成等比缩小的 JPEG 缩略图。"""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".tmp") as f:
        f.write(file_bytes)
        input_path = f.name

    out_fd, out_path = tempfile.mkstemp(suffix=".jpg")
    os.close(out_fd)

    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-i", input_path,
            "-vf", f"scale='min({max_width},iw)':-2",
            "-q:v", "3",
            "-y",
            out_path,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg 图片缩略图失败: {stderr.decode()[-300:]}")

        with open(out_path, "rb") as fh:
            return fh.read()
    finally:
        os.unlink(input_path)
        if os.path.exists(out_path):
            os.unlink(out_path)


async def probe_image(file_bytes: bytes) -> dict:
    """用 ffprobe 读取图片的宽度和高度。
    ffprobe 把图片当作单帧视频流处理，codec_type='video'。
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".tmp") as f:
        f.write(file_bytes)
        tmp_path = f.name

    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            tmp_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()

        if proc.returncode != 0:
            return {}

        info = json.loads(stdout.decode())
        for stream in info.get("streams", []):
            w = stream.get("width")
            h = stream.get("height")
            if w and h:
                return {"width": w, "height": h}
        return {}
    finally:
        os.unlink(tmp_path)


async def process_image(image_id: str, user_id: str, file_bytes: bytes) -> None:
    """后台任务：ffprobe 宽高 + ffmpeg 缩略图 + CLIP 向量化 + 写库。"""
    from app.core.database import async_session_factory
    from app.models.image import Image
    from app.services.clip_service import encode_image, insert_image_embedding
    from app.services.minio_service import MinIOService
    from sqlalchemy import select

    logger.info("图片处理开始 [ID=%s, 大小=%.1f KB]", image_id, len(file_bytes) / 1024)
    t0 = time.perf_counter()

    async with async_session_factory() as session:
        result = await session.execute(select(Image).where(Image.id == image_id))
        img = result.scalar_one_or_none()
        if not img:
            return

        try:
            img.status = "processing"
            await session.flush()

            # ── 1. ffprobe 宽高 ────────────────────────────────────────
            try:
                meta = await probe_image(file_bytes)
                if meta.get("width"):
                    img.width = meta["width"]
                    img.height = meta["height"]
                    logger.info(
                        "ffprobe 完成 [ID=%s]: %dx%d",
                        image_id, img.width, img.height,
                    )
            except Exception as exc:
                logger.warning("ffprobe 图片宽高获取失败 [ID=%s]: %s", image_id, exc)

            # ── 2. ffmpeg 生成缩略图 ───────────────────────────────────
            try:
                thumb_bytes = await extract_image_thumbnail(file_bytes, max_width=480)
                minio_svc = MinIOService()
                thumb_path = await minio_svc.upload_bytes(
                    thumb_bytes, "images/thumbnails", user_id,
                    ext="jpg", content_type="image/jpeg",
                )
                img.thumbnail_path = thumb_path
                logger.info(
                    "缩略图已上传 [ID=%s]: %.1f KB → %s",
                    image_id, len(thumb_bytes) / 1024, thumb_path,
                )
            except Exception as exc:
                logger.warning("ffmpeg 图片缩略图生成失败 [ID=%s]: %s", image_id, exc)

            # ── 3. CLIP 向量化 ─────────────────────────────────────────
            try:
                embedding = await encode_image(file_bytes, image_id=image_id)
                await insert_image_embedding(image_id, user_id, embedding)
                img.milvus_id = image_id
                logger.info("CLIP 完成 [ID=%s]，已写入 Milvus", image_id)
            except Exception as exc:
                logger.error("CLIP 向量化失败 [ID=%s]: %s", image_id, exc)
                # CLIP 失败不阻止整体完成，仅记录

            img.status = "completed"
            logger.info(
                "图片处理完成 [ID=%s] 总耗时=%.2fs",
                image_id, time.perf_counter() - t0,
            )
        except Exception as exc:
            logger.error("图片处理失败 [ID=%s]: %s", image_id, exc)
            img.status = "failed"
            img.error_message = str(exc)[:500]

        await session.commit()


async def process_video(video_id: str, user_id: str, file_bytes: bytes) -> None:
    """后台任务入口：探针元数据 + 截图 + 写库。"""
    from app.core.database import async_session_factory
    from app.models.video import Video
    from app.services.minio_service import MinIOService
    from sqlalchemy import select

    logger.info("视频处理开始 [ID=%s, 大小=%.1f MB]", video_id, len(file_bytes) / 1024 / 1024)
    t0 = time.perf_counter()

    async with async_session_factory() as session:
        result = await session.execute(select(Video).where(Video.id == video_id))
        vid = result.scalar_one_or_none()
        if not vid:
            return

        try:
            vid.status = "processing"
            await session.flush()

            # ── 1. ffprobe 元数据 ──────────────────────────────────────
            logger.info("ffprobe 解析元数据 [ID=%s]", video_id)
            meta = await probe_video(file_bytes)
            if "duration" in meta:
                vid.duration = meta["duration"]
            if "resolution" in meta:
                vid.resolution = meta["resolution"]
            logger.info(
                "ffprobe 完成 [ID=%s]: duration=%ss, resolution=%s",
                video_id, meta.get("duration"), meta.get("resolution"),
            )

            # ── 2. ffmpeg 生成缩略图 ───────────────────────────────────
            duration = meta.get("duration", 0)
            seek = min(5.0, duration * 0.1) if duration > 0 else 0.0
            logger.info("ffmpeg 截图 [ID=%s]: seek=%.1fs", video_id, seek)
            thumb_bytes = await extract_thumbnail(file_bytes, seek_sec=seek)

            minio_svc = MinIOService()
            cover_path = await minio_svc.upload_bytes(
                thumb_bytes, "videos/covers", user_id,
                ext="jpg",
                content_type="image/jpeg",
            )
            vid.cover_path = cover_path
            logger.info(
                "缩略图已上传 [ID=%s]: path=%s (%.1f KB)",
                video_id, cover_path, len(thumb_bytes) / 1024,
            )

            vid.status = "completed"
            logger.info(
                "视频处理完成 [ID=%s] 总耗时=%.2fs",
                video_id, time.perf_counter() - t0,
            )
        except Exception as exc:
            logger.error("视频处理失败 [ID=%s]: %s", video_id, exc)
            vid.status = "failed"
            vid.error_message = str(exc)[:500]

        await session.commit()
