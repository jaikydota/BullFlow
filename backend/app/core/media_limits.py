"""各生图 / 生视频模型支持的参考图数量上限（产品侧统一口径）。

依据各模型线上文档（Seedream 5.0 ≤14、Nano Banana 2 ≤14、GPT-Image-2 ≤16），
产品侧把图片参考图统一收敛到 8 张：避免过多参考图导致变慢/变贵，并与对话
「挂载参考素材」(最多 8) 对齐。

视频走"首帧 + 尾帧"语义（最多 2 张、带角色），不是平铺的 N 张，故单列。
前端 `src/utils/mediaLimits.ts` 保持同一份数字。
"""
from __future__ import annotations

import io
import logging

logger = logging.getLogger(__name__)

# gpt-image edits 输入图约束：统一 RGB PNG，单边不超过此像素（过大既可能触发 Azure 限制又拖慢上传）
REF_IMAGE_MAX_EDGE = 2048

# 图片各 provider 参考图上限（当前统一 8，保留 per-provider 以便日后按模型放开）
IMAGE_REF_MAX: dict[str, int] = {
    "azure": 8,    # GPT-Image-2（edits，文档上限 16）
    "doubao": 8,   # Seedream 5.0（文档上限 14）
    "tencent": 8,  # Nano Banana 2（文档上限 14）
}
IMAGE_REF_DEFAULT = 8


def image_ref_limit(provider: str) -> int:
    """返回某图片 provider 支持的参考图最大数量。"""
    return IMAGE_REF_MAX.get(provider, IMAGE_REF_DEFAULT)


def clamp_image_refs(provider: str, urls: list[str] | None) -> list[str]:
    """按 provider 上限裁剪参考图 URL 列表（去空、截断）。"""
    cleaned = [u for u in (urls or []) if u]
    return cleaned[: image_ref_limit(provider)]


def normalize_ref_image_bytes(raw: bytes) -> bytes | None:
    """把任意参考图标准化为 Azure gpt-image edits 可接受的 RGB PNG。

    Azure gpt-image-2 edits 对输入图较严：非 RGB 模式（带 alpha 的 RGBA、CMYK、
    调色板 P、灰度 L/LA 等）或 WebP/HEIC 等格式会被拒，报
    `invalid_image_file: Invalid image file or mode`。本函数统一处理：
    - EXIF 方向校正（手机照片）；
    - 转 RGB（去 alpha / CMYK / P / 灰度）；
    - 等比缩放到单边 <= REF_IMAGE_MAX_EDGE（显著降字节、加速上传）；
    - 重编码为 PNG。
    解析失败（损坏 / 非图片）返回 None，由调用方跳过该张。
    注意：内部是 CPU 密集的 PIL 操作，异步上下文请用 asyncio.to_thread 调用。
    """
    try:
        from PIL import Image, ImageOps

        with Image.open(io.BytesIO(raw)) as im:
            im = ImageOps.exif_transpose(im)
            if im.mode != "RGB":
                im = im.convert("RGB")
            longest = max(im.size)
            if longest > REF_IMAGE_MAX_EDGE:
                scale = REF_IMAGE_MAX_EDGE / longest
                im = im.resize(
                    (max(1, round(im.width * scale)), max(1, round(im.height * scale))),
                    Image.LANCZOS,
                )
            out = io.BytesIO()
            im.save(out, format="PNG")
            return out.getvalue()
    except Exception:
        logger.warning("[media] 参考图标准化失败，跳过该张", exc_info=True)
        return None
