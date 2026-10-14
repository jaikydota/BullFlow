"""海外平台发帖规格：(platform_code, kind) → (action_slug, arguments)。

对应灵径的 `publish_spec`。**action slug 已用 `composio.tools.get_raw_composio_tools` 实测核对**。
注意各平台必填参数差异极大（已查 input schema）：
- LinkedIn `LINKEDIN_CREATE_LINKED_IN_POST`：required author(成员 URN) + commentary
- Facebook `FACEBOOK_CREATE_POST`：required page_id(发到 Page) + message
- Reddit   `REDDIT_CREATE_REDDIT_POST`：required subreddit + title（+ kind=self + text）
- Instagram `INSTAGRAM_CREATE_POST`：required ig_user_id + creation_id（须先建 media container 且必须有图，两步流程见 publish.py `_instagram_publish`）
- Twitter `TWITTER_CREATION_OF_A_POST`：text + media_media_ids（最多 4 个，须先上传换 id）
- TikTok：暂未启用

平台特定必填字段（author URN / subreddit 等）来自**真实连接数据**或请求的 `extra`；
Facebook / Instagram / X 的多步流程由 publish.py 的专用 helper 完成，其余平台由本模块 build_arguments 组参。
"""
from __future__ import annotations

from typing import Any, Callable

# (platform_code, kind) -> action_slug（实测核对）
_ACTIONS: dict[tuple[str, str], str] = {
    ("LinkedIn", "dynamic"): "LINKEDIN_CREATE_LINKED_IN_POST",
    ("Facebook", "dynamic"): "FACEBOOK_CREATE_POST",
    ("Facebook", "video"): "FACEBOOK_CREATE_VIDEO_POST",
    ("Reddit", "dynamic"): "REDDIT_CREATE_REDDIT_POST",
    ("Instagram", "dynamic"): "INSTAGRAM_CREATE_POST",
    # Instagram 单视频走 Reels（Graph API 已废弃单视频 VIDEO 类型）；发布层 helper 内处理两步
    ("Instagram", "video"): "INSTAGRAM_CREATE_POST",
    ("YouTube", "video"): "YOUTUBE_UPLOAD_VIDEO",
    # X/Twitter：自建 OAuth app（Composio 不提供托管凭证）。发帖只收已上传的 media id，
    # 故图片/视频要先经 TWITTER_UPLOAD_MEDIA(_LARGE) 换 id，两步流程在 publish.py 的 helper 里。
    ("Twitter", "dynamic"): "TWITTER_CREATION_OF_A_POST",
    ("Twitter", "video"): "TWITTER_CREATION_OF_A_POST",
}

# 海外平台默认 kind：YouTube 是视频，其余按 dynamic（短帖/图文）
_DEFAULT_KIND: dict[str, str] = {"YouTube": "video"}


def _text(content: dict) -> str:
    return (content.get("body") or content.get("title") or "").strip()


def _linkedin(content: dict, extras: dict, account: dict) -> dict:
    # author = urn:li:person:{sub}，sub 是落账时调 /v2/userinfo 拿到的稳定 member id（存 platform_user_id）
    args: dict[str, Any] = {"commentary": _text(content), "visibility": "PUBLIC", "lifecycleState": "PUBLISHED"}
    puid = account.get("platform_user_id")
    if puid:
        args["author"] = f"urn:li:person:{puid}"
    # 图片：images 是 file_uploadable 数组（最多 20 张），auto-upload 开启后可直接传 URL，
    # SDK 自动下载→上传→转 s3key；LinkedIn 单图走 media、多图走 multiImage（由上游自动判定）
    imgs = [m for m in (content.get("mediaUrls") or content.get("covers") or []) if m]
    if imgs:
        args["images"] = imgs[:20]
    return args


def _reddit(content: dict, extras: dict, account: dict) -> dict:
    # subreddit 由请求 extra 指定；text 为正文（self 帖）
    return {
        "kind": "self",
        "subreddit": (extras.get("subreddit") or "").strip(),
        "title": (content.get("title") or "").strip(),
        "text": (content.get("body") or "").strip(),
    }


def _twitter(content: dict, extras: dict, account: dict) -> dict:
    """X/Twitter 纯文本兜底。带图/视频时 publish.py 的 `_twitter_publish` 会先上传素材、
    再补 `media_media_ids`（最多 4 个），不走这里。"""
    return {"text": _text(content)}


def _youtube(content: dict, extras: dict, account: dict) -> dict:
    # videoFilePath 传 video_url（URL），SDK 已开启 auto-upload 自动下载转 s3key。
    # categoryId 默认 22（People & Blogs）；privacyStatus 默认 public。
    return {
        "title": (content.get("title") or "视频").strip()[:100],
        "description": (content.get("body") or "").strip(),
        "tags": extras.get("tags") or [],
        "categoryId": str(extras.get("categoryId") or "22"),
        "privacyStatus": extras.get("privacyStatus") or "public",
        "videoFilePath": content.get("videoUrl"),
    }


_BUILDERS: dict[tuple[str, str], Callable[[dict, dict, dict], dict]] = {
    ("LinkedIn", "dynamic"): _linkedin,
    ("Reddit", "dynamic"): _reddit,
    ("YouTube", "video"): _youtube,
    ("Twitter", "dynamic"): _twitter,
}


def supported_kinds(platform_code: str) -> list[str]:
    """该海外平台已登记发帖 action 的 kind 列表（后台「平台能力」展示用；未登记 → 空）。"""
    return sorted({kind for (code, kind) in _ACTIONS if code == platform_code})


def default_kind(platform_code: str) -> str:
    """海外平台默认 kind：YouTube=video，其余=dynamic（短帖/图文）。"""
    return _DEFAULT_KIND.get(platform_code, "dynamic")


def resolve_action(platform_code: str, kind: str) -> str | None:
    """该平台该 kind 的 action slug；未登记返回 None（发布层据此报不支持）。"""
    return _ACTIONS.get((platform_code, kind)) or _ACTIONS.get((platform_code, default_kind(platform_code)))


def build_arguments(platform_code: str, kind: str, content: dict, extras: dict | None, account: dict | None = None) -> dict:
    """组 action arguments。account={platform_user_id,...} 供平台特定字段（如 LinkedIn author）使用。"""
    builder = _BUILDERS.get((platform_code, kind)) or _BUILDERS.get((platform_code, default_kind(platform_code)))
    return builder(content, extras or {}, account or {}) if builder else {}
