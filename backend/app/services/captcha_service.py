"""自研滑块拼图人机验证（Pillow 生成 + Redis 校验 + 一次性 ticket）

Redis 键约定：
  captcha:slider:{captchaId}   拼图答案与尝试次数 {"x": 正确位移, "tries": n}，TTL=CAPTCHA_TTL
  captcha:ticket:{ticket}      验证通过凭证（一次性），TTL=CAPTCHA_TICKET_TTL

业务端点（发送短信验证码 / 渐进式登录）只认 ticket，不关心验证形式。
日后若换腾讯云 TCaptcha，只需替换 verify_slider 内部为云端校验即可，ticket 流程不变。
"""
from __future__ import annotations

import base64
import io
import json
import secrets

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

from app.core.config import settings
from app.core.exceptions import BadRequestError, TooManyRequestsError
from app.core.redis import get_redis

# 失败计数累计窗口（秒）：窗口内连续失败超过 CAPTCHA_FAIL_MAX 即锁定
_FAIL_WINDOW = 600

# 画布与拼图块尺寸（前端按此等比展示）
_W, _H = 320, 160
_PIECE = 50


def _rand(n: int) -> int:
    return secrets.randbelow(max(1, n))


def _to_dataurl(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _rand_color(lo: int = 40, hi: int = 215) -> tuple[int, int, int]:
    span = hi - lo
    return (lo + _rand(span), lo + _rand(span), lo + _rand(span))


def _vertical_gradient(c1: tuple[int, int, int], c2: tuple[int, int, int]) -> Image.Image:
    """竖向双色渐变（用 1×H 再拉伸，避免逐像素双层循环）。"""
    grad = Image.new("RGB", (1, _H))
    for y in range(_H):
        f = y / _H
        grad.putpixel((0, y), tuple(int(c1[i] + (c2[i] - c1[i]) * f) for i in range(3)))
    return grad.resize((_W, _H))


def _bg_gradient_circles() -> Image.Image:
    bg = _vertical_gradient(_rand_color(), _rand_color())
    d = ImageDraw.Draw(bg)
    for _ in range(7):
        x, y, r = _rand(_W), _rand(_H), _rand(36) + 12
        d.ellipse([x - r, y - r, x + r, y + r], outline=_rand_color(), width=2)
    return bg


def _bg_polygons() -> Image.Image:
    """低多边形（随机三角形铺叠）。"""
    bg = _vertical_gradient(_rand_color(), _rand_color())
    d = ImageDraw.Draw(bg)
    for _ in range(14):
        pts = [(_rand(_W), _rand(_H)) for _ in range(3)]
        d.polygon(pts, fill=_rand_color())
    return bg


def _bg_stripes() -> Image.Image:
    """斜向条纹。"""
    c1, c2 = _rand_color(), _rand_color()
    bg = Image.new("RGB", (_W, _H), c1)
    d = ImageDraw.Draw(bg)
    w = _rand(12) + 12
    for x in range(-_H, _W, w * 2):
        d.line([(x, 0), (x + _H, _H)], fill=c2, width=w)
    return bg


def _bg_dots() -> Image.Image:
    """渐变 + 彩色圆点阵。"""
    bg = _vertical_gradient(_rand_color(), _rand_color())
    d = ImageDraw.Draw(bg)
    for gx in range(0, _W, 20):
        for gy in range(0, _H, 20):
            r = _rand(5) + 2
            d.ellipse([gx - r, gy - r, gx + r, gy + r], fill=_rand_color())
    return bg


def _bg_blocks() -> Image.Image:
    """马赛克色块。"""
    bg = Image.new("RGB", (_W, _H), _rand_color())
    d = ImageDraw.Draw(bg)
    cell = _rand(18) + 24
    for gx in range(0, _W, cell):
        for gy in range(0, _H, cell):
            d.rectangle([gx, gy, gx + cell, gy + cell], fill=_rand_color())
    return bg


def _bg_lines() -> Image.Image:
    """渐变 + 随机交叉线。"""
    bg = _vertical_gradient(_rand_color(), _rand_color())
    d = ImageDraw.Draw(bg)
    for _ in range(10):
        d.line(
            [(_rand(_W), _rand(_H)), (_rand(_W), _rand(_H))],
            fill=_rand_color(),
            width=_rand(3) + 1,
        )
    return bg


_BG_STYLES = (
    _bg_gradient_circles,
    _bg_polygons,
    _bg_stripes,
    _bg_dots,
    _bg_blocks,
    _bg_lines,
)


def _make_bg() -> Image.Image:
    """随机挑一种背景风格，保证缺口可辨识。"""
    return _BG_STYLES[_rand(len(_BG_STYLES))]()


def _piece_mask() -> Image.Image:
    """生成拼图块形状蒙版（圆角方块 + 随机一侧凸/凹的卡扣），bbox 固定 _PIECE×_PIECE。"""
    p = _PIECE
    mask = Image.new("L", (p, p), 0)
    d = ImageDraw.Draw(mask)
    pad, r = 6, 8
    d.rounded_rectangle([pad, pad, p - pad, p - pad], radius=6, fill=255)
    mid = p // 2
    centers = {0: (mid, pad), 1: (p - pad, mid), 2: (mid, p - pad), 3: (pad, mid)}
    cx, cy = centers[_rand(4)]
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255 if _rand(2) == 0 else 0)
    return mask


async def generate_slider() -> dict:
    """生成一道滑块拼图题，答案写入 Redis，返回前端展示所需数据（不含正确 x）。"""
    bg = _make_bg()
    p = _PIECE
    correct_x = p + 10 + _rand(_W - 2 * p - 20)
    y = 10 + _rand(_H - p - 20)

    mask = _piece_mask()
    # 1px 描边环（蒙版 - 收缩后的蒙版），让缺口与拼图块边缘更清晰
    outline = ImageChops.subtract(mask, mask.filter(ImageFilter.MinFilter(3)))
    white = Image.new("RGB", (p, p), (255, 255, 255))

    region = bg.crop((correct_x, y, correct_x + p, y + p)).convert("RGB")

    # 拼图块：按形状抠出 + 白色描边，放到与 bg 等高、宽 _PIECE 的画布的 y 行
    shaped = Image.new("RGBA", (p, p), (0, 0, 0, 0))
    shaped.paste(region, (0, 0), mask)
    shaped.paste(white, (0, 0), outline)
    piece = Image.new("RGBA", (p, _H), (0, 0, 0, 0))
    piece.paste(shaped, (0, y))

    # 真实缺口：按形状压暗（比之前更浅，仍隐约可见纹理）+ 白色描边
    bg.paste(ImageEnhance.Brightness(region).enhance(0.62), (correct_x, y), mask)
    bg.paste(white, (correct_x, y), outline)

    # 干扰用「终点框」：2 个更浅的假缺口（不入库、仅迷惑机器），同形状同行、互不重叠
    lo, hi = p + 10, _W - p - 10
    used = [correct_x]
    for _ in range(2):
        dx = None
        for _try in range(40):
            cand = lo + _rand(hi - lo + 1)
            if all(abs(cand - u) >= p + 6 for u in used):
                dx = cand
                break
        if dx is None:
            continue
        decoy = bg.crop((dx, y, dx + p, y + p)).convert("RGB")
        bg.paste(ImageEnhance.Brightness(decoy).enhance(0.92), (dx, y), mask)
        bg.paste(white, (dx, y), outline)
        used.append(dx)

    captcha_id = secrets.token_urlsafe(16)
    redis = get_redis()
    await redis.set(
        f"captcha:slider:{captcha_id}",
        json.dumps({"x": correct_x, "tries": 0}),
        ex=settings.CAPTCHA_TTL,
    )

    return {
        "captchaId": captcha_id,
        "bg": _to_dataurl(bg),
        "puzzle": _to_dataurl(piece),
        "y": y,
        "pieceSize": _PIECE,
        "width": _W,
        "height": _H,
    }


async def _issue_ticket() -> str:
    ticket = secrets.token_urlsafe(24)
    await get_redis().set(f"captcha:ticket:{ticket}", "1", ex=settings.CAPTCHA_TICKET_TTL)
    return ticket


async def verify_slider(captcha_id: str, x: int, ip: str | None = None) -> str:
    """校验滑块位移，通过则签发一次性 ticket。

    失败累计：同一 IP 在窗口内连续失败超过 CAPTCHA_FAIL_MAX 次后锁定
    CAPTCHA_LOCK_SECONDS 秒，期间一律拒绝（抛 TooManyRequestsError）。
    """
    if not settings.CAPTCHA_ENABLED:
        return await _issue_ticket()

    redis = get_redis()
    lock_key = f"captcha:lock:{ip}" if ip else None
    fail_key = f"captcha:fail:{ip}" if ip else None

    # 锁定期内直接拒绝
    if lock_key and await redis.get(lock_key):
        ttl = await redis.ttl(lock_key)
        raise TooManyRequestsError(
            f"验证失败次数过多，请 {ttl if ttl and ttl > 0 else settings.CAPTCHA_LOCK_SECONDS} 秒后再试"
        )

    key = f"captcha:slider:{captcha_id}"
    raw = await redis.get(key)
    if not raw:
        raise BadRequestError("验证已过期，请重试")

    data = json.loads(raw)
    if abs(int(x) - int(data["x"])) <= settings.CAPTCHA_TOLERANCE:
        await redis.delete(key)
        if fail_key:
            await redis.delete(fail_key)  # 通过即清零
        return await _issue_ticket()

    # 单题作废（前端会重新拉题）
    await redis.delete(key)

    # 按 IP 累计失败，超过上限则锁定一段时间让用户等待
    if fail_key:
        fails = await redis.incr(fail_key)
        if fails == 1:
            await redis.expire(fail_key, _FAIL_WINDOW)
        if fails > settings.CAPTCHA_FAIL_MAX:
            await redis.set(lock_key, "1", ex=settings.CAPTCHA_LOCK_SECONDS)
            await redis.delete(fail_key)
            raise TooManyRequestsError(
                f"验证失败次数过多，请 {settings.CAPTCHA_LOCK_SECONDS} 秒后再试"
            )

    raise BadRequestError("验证失败，请重试")


async def pop_ticket(ticket: str | None) -> bool:
    """一次性消费 ticket：有效则删除并返回 True；CAPTCHA 关闭时直接放行。"""
    if not settings.CAPTCHA_ENABLED:
        return True
    if not ticket:
        return False
    redis = get_redis()
    key = f"captcha:ticket:{ticket}"
    val = await redis.get(key)
    if not val:
        return False
    await redis.delete(key)
    return True


async def consume_ticket(ticket: str | None) -> None:
    """消费 ticket，无效则抛错（用于「发送短信验证码」等始终校验的场景）。"""
    if not await pop_ticket(ticket):
        raise BadRequestError("请先完成人机验证")
