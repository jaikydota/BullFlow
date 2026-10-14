"""内容 → 发布字段 统一映射（自动分发 + 手动发布预填 共用唯一实现）。

「GeneratedContent → 发布字段」映射只在本模块 `build_publish_fields()` 实现，避免两条发布链路
各自维护导致正文取错字段 / 多图丢失 / 封面缺失 / 截断不一致：

- **职责边界**：只做「选哪个字段 + 截断 + 取多图/封面」这层（bug 高发区）。
  各调用方再做各自的收尾——自动分发把 markdown 转 HTML、拼网关 content dict；手动预填直接
  返回可编辑字段给前端表单（前端提交时再 md→html）。这样收尾差异不再产生重复逻辑。
- 字数 / 媒体上限对齐前端权威 `tlfPlatformConstraints.ts`，仅收录「自动分发规则可配置」的平台
  = 11 个国内 popular + 5 个海外；其余落默认。多平台时取最严格上限。
- 改这层映射/上限只改这里一处，自动分发与手动预填同时生效。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.models.generated_content import GeneratedContent
from app.services.minio_service import path_to_url
from app.services.oversea_platforms import is_oversea_platform

# (platform_code, kind) -> (title_max, text_max, images_max, covers_max)
#   title_max  : 标题上限；None=该平台该类型无标题字段
#   text_max   : 主文本上限（article=正文 content.max / dynamic·video=文案 desc.max）；None=不限
#   images_max : 图文动态图片张数上限；None=不限（或不适用）
#   covers_max : 封面张数上限；None=不限
# 值对齐 frontend/src/utils/tlfPlatformConstraints.ts（含 OVERSEA_PLATFORM_CONSTRAINTS）。
_SPEC: dict[tuple[str, str], tuple[int | None, int | None, int | None, int | None]] = {
    ("DouYin", "video"): (30, 1000, None, None),
    ("DouYin", "article"): (30, 8000, None, 1),
    ("DouYin", "dynamic"): (20, 1000, 35, None),
    ("KuaiShou", "video"): (30, 500, None, None),
    ("KuaiShou", "dynamic"): (None, 500, 31, None),
    ("XiaoHongShu", "video"): (20, 1000, None, None),
    ("XiaoHongShu", "dynamic"): (20, 1000, 18, None),
    ("BiLiBiLi", "video"): (80, 2000, None, None),
    ("BiLiBiLi", "article"): (100, 20000, None, None),
    ("BaiJiaHao", "video"): (20, 500, None, None),
    ("BaiJiaHao", "article"): (30, 10000, None, 3),
    ("BaiJiaHao", "dynamic"): (20, 2000, 18, None),
    ("TouTiaoHao", "video"): (30, 500, None, None),
    ("TouTiaoHao", "article"): (30, 20000, None, None),
    ("TouTiaoHao", "dynamic"): (None, 500, 18, None),
    ("XinLangWeiBo", "video"): (20, 500, None, None),
    ("XinLangWeiBo", "article"): (32, 10000, None, None),
    ("XinLangWeiBo", "dynamic"): (None, 500, 18, None),
    ("ShiPinHao", "video"): (20, 1000, None, None),
    ("ShiPinHao", "dynamic"): (22, 1000, 18, None),
    ("ZhiHu", "article"): (100, 10000, None, None),
    ("ZhiHu", "dynamic"): (50, 500, 9, None),
    ("WeiXinGongZhongHao", "article"): (64, None, None, None),
    ("DuoDuoShiPin", "video"): (30, 500, None, None),
    # ── 海外（Composio）──
    ("LinkedIn", "dynamic"): (None, 3000, 20, None),
    ("Facebook", "dynamic"): (None, 5000, 50, None),
    ("Facebook", "video"): (255, 5000, None, None),
    ("Instagram", "dynamic"): (None, 2200, 10, None),
    ("Instagram", "video"): (None, 2200, None, None),
    ("Reddit", "article"): (300, 40000, None, None),
    ("YouTube", "video"): (100, 5000, None, None),
    # X/Twitter：正文 280 为普通账号加权上限；单条最多 4 张图，图与视频不可混用
    ("Twitter", "dynamic"): (None, 280, 4, None),
    ("Twitter", "video"): (None, 280, None, None),
}
_DEFAULT_TITLE_MAX = 30
_DEFAULT_TEXT_MAX = 1000


def _min_opt(a: int | None, b: int | None) -> int | None:
    """两个上限取更严格（更小）的；None 视为「不限」。"""
    if a is None:
        return b
    if b is None:
        return a
    return min(a, b)


@dataclass
class _AggSpec:
    title_max: int
    text_max: int | None
    images_max: int | None
    covers_max: int | None


def _aggregate_spec(platform_codes: list[str], kind: str) -> _AggSpec:
    """多平台取最严格上限；title/text 缺失时落默认（避免 None 导致不截断）。"""
    title_max: int | None = None
    text_max: int | None = None
    images_max: int | None = None
    covers_max: int | None = None
    seen = False
    for code in platform_codes:
        spec = _SPEC.get((code, kind))
        if spec is None:
            continue
        seen = True
        t, x, im, cv = spec
        title_max = _min_opt(title_max, t)
        text_max = _min_opt(text_max, x)
        images_max = _min_opt(images_max, im)
        covers_max = _min_opt(covers_max, cv)
    return _AggSpec(
        title_max=title_max if title_max is not None else _DEFAULT_TITLE_MAX,
        # 收录平台但该字段标 None=不限 → 不截断；完全未收录平台落默认上限兜底
        text_max=text_max if (seen or text_max is not None) else _DEFAULT_TEXT_MAX,
        images_max=images_max,
        covers_max=covers_max,
    )


def _clip(text: str, max_len: int | None) -> tuple[str, bool]:
    """按字符数截断（**保留换行**，对齐前端 clipToMax）。"""
    s = (text or "").strip()
    if max_len is None or len(s) <= max_len:
        return s, False
    return s[:max_len], True


# ── X/Twitter 加权字数 ──
# X 的 280 上限按「加权字符」计：Unicode 0–4351 / 8192–8205 / 8208–8223 / 8242–8247 区间算 1
# （拉丁字母、数字、常见标点），其它（中日韩、emoji）算 2；任意 URL 固定算 23（t.co 缩短后长度）。
# 与前端 tlfPlatformConstraints.xWeightedLength 同规则。
_X_TEXT_LIMIT = 280
_X_URL_WEIGHT = 23
_X_URL_RE = re.compile(r"(?i)(?:https?://|www\.)\S+")


def _x_char_weight(ch: str) -> int:
    cp = ord(ch)
    if cp <= 4351 or 8192 <= cp <= 8205 or 8208 <= cp <= 8223 or 8242 <= cp <= 8247:
        return 1
    return 2


def x_weighted_len(text: str) -> int:
    """按 X 规则计算加权长度（URL 计 23，中日韩 / emoji 计 2，其余计 1）。"""
    total = 0
    pos = 0
    for m in _X_URL_RE.finditer(text):
        total += sum(_x_char_weight(c) for c in text[pos:m.start()]) + _X_URL_WEIGHT
        pos = m.end()
    total += sum(_x_char_weight(c) for c in text[pos:])
    return total


def _x_weighted_clip(text: str, limit: int = _X_TEXT_LIMIT) -> tuple[str, bool]:
    """按 X 加权规则截断：逐字累加权重；URL 整段计 23，放不下则连同其后内容一并截掉。"""
    s = (text or "").strip()
    if x_weighted_len(s) <= limit:
        return s, False
    out: list[str] = []
    used = 0

    def _take(seg: str) -> bool:
        nonlocal used
        for ch in seg:
            w = _x_char_weight(ch)
            if used + w > limit:
                return False
            out.append(ch)
            used += w
        return True

    pos = 0
    for m in _X_URL_RE.finditer(s):
        if not _take(s[pos:m.start()]) or used + _X_URL_WEIGHT > limit:
            return "".join(out).rstrip(), True
        out.append(m.group(0))
        used += _X_URL_WEIGHT
        pos = m.end()
    _take(s[pos:])
    return "".join(out).rstrip(), True


def _strip_tags(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"<[^>]+>", "", text).strip()


@dataclass
class PublishFields:
    """统一的发布字段（已选好字段 + 截断 + URL 化），供两条链路各自收尾。

    body = 主文本（article=原始 markdown 正文；dynamic/video=文案）。调用方按平台决定是否
    转 HTML（国内文章）或原样发 markdown（Reddit）。
    """
    title: str
    body: str
    images: list[str]
    covers: list[str]
    video_url: str | None
    tags: list[str]
    warnings: list[dict] = field(default_factory=list)


def build_publish_fields(
    record: GeneratedContent,
    platform_codes: list[str],
    kind: str,
) -> PublishFields:
    """GeneratedContent → 统一发布字段（唯一实现，自动分发 + 手动预填共用）。

    平台支持区分 article 的国内 HTML / 海外 markdown 由 body 文本统一承载（都先按字符上限截断），
    调用方再做最终转换。多平台 platform_codes 取最严格上限。
    """
    spec = _aggregate_spec(platform_codes, kind)
    warnings: list[dict] = []

    title_raw = (record.title or "").strip()
    title, t_trunc = _clip(title_raw, spec.title_max)
    if t_trunc:
        warnings.append({
            "field": "title", "originalSize": len(title_raw), "truncatedTo": len(title),
            "message": f"标题原文 {len(title_raw)} 字，已自动截断到 {len(title)} 字以符合平台要求",
        })

    # 正文来源对齐前端 autoFillFromContent：
    # - article：正文全文 content 优先（回退 description/title/prompt）
    # - dynamic/video：LLM 发布文案 description 优先（回退 content/title/prompt）
    content_body = (record.content or "").strip()
    desc_body = (record.description or "").strip()
    prompt_text = (record.prompt or "").strip()
    if kind == "article":
        text_raw = content_body or desc_body or title_raw or prompt_text
    else:
        text_raw = desc_body or content_body or title_raw or prompt_text
    # dynamic/video 文案若来自 content（HTML 文章）则去标签；article body 保留 markdown 原文
    if kind != "article":
        text_raw = _strip_tags(text_raw)
    body, b_trunc = _clip(text_raw, spec.text_max)
    if b_trunc:
        warnings.append({
            "field": "content" if kind == "article" else "desc",
            "originalSize": len(text_raw), "truncatedTo": len(body),
            "message": f"正文原文 {len(text_raw)} 字，已自动截断到 {len(body)} 字",
        })
    # X/Twitter 再按加权字数截一次：只按字符数截到 280，中文（每字算 2）仍会超限被平台拒绝
    if "Twitter" in platform_codes and kind != "article":
        body, x_trunc = _x_weighted_clip(body)
        if x_trunc:
            warnings.append({
                "field": "desc",
                "originalSize": x_weighted_len(text_raw), "truncatedTo": x_weighted_len(body),
                "message": f"正文按 X 加权字数（中日韩字符算 2、链接算 23）已截断到 {_X_TEXT_LIMIT} 以内",
            })

    # ── 媒体字段 ──
    file_url = path_to_url(record.file_path)
    thumb_url = path_to_url(record.thumbnail_path)
    media_urls = [u for u in (path_to_url(p) for p in (record.media_urls or [])) if u]

    images: list[str] = []
    covers: list[str] = []
    video_url: str | None = None

    if kind == "video":
        video_url = file_url
        covers = [thumb_url] if thumb_url else []
        if spec.covers_max is not None:
            covers = covers[: spec.covers_max]
    elif kind == "dynamic":
        # 图文分离：全部图（media_urls）优先，回退单图 file_path
        images = media_urls if media_urls else ([file_url] if file_url else [])
        if spec.images_max is not None:
            images = images[: spec.images_max]
        # 注：「图片是否必填」因平台而异（小红书必填、LinkedIn/微博可选），不在此映射层判定，
        #     交由前端表单校验（tlfPlatformConstraints）+ 网关上游校验，避免误报。
    elif kind == "article":
        # 封面：缩略图 > 图文混编正文首图 > 单图
        cover = thumb_url or (media_urls[0] if media_urls else None) or file_url
        covers = [cover] if cover else []
        if spec.covers_max is not None:
            covers = covers[: spec.covers_max]

    tags = [str(t).strip() for t in (record.tags or []) if str(t).strip()]

    return PublishFields(
        title=title, body=body, images=images, covers=covers,
        video_url=video_url, tags=tags, warnings=warnings,
    )
