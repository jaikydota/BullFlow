"""平台账号 → 用户主页 URL（可扩展映射）。

主页 URL 有两种来源：
1. **直接用 `platform_user_id` 拼**（多数平台）：小红书/快手/B站/微博/知乎/豆瓣/简书/AcFun 等，
   platform_user_id 本身就是主页路径里的 id。**无需网络、不依赖登录 cookie**，授权成功即可拼。
   （与前端 `frontend/src/utils/tlfPlatformUrls.ts` 的 PROFILE_URL 保持一致。）
2. **需作者信息接口才能拼**（少数平台）：抖音主页需 sec_uid（≠ platform_user_id），要调灵径
   「获取媒体号作者信息」拿 raw.sec_uid。best-effort，cookie 失效时取不到则留空。

注：**快手 web 主页用 eid（加密短 id）**，灵径 `media-accounts` 与「获取作者信息」均不返回该字段
（raw 里只有数字 `userId`(=platform_user_id) 和常为 null 的 `userKwaiId`），故快手不拼用户主页，
由 `finalize_home_url` 兜底到快手站点首页。

新增平台只在对应的 _USER_ID_HOME_BUILDERS / _AUTHOR_INFO_HOME_BUILDERS 里加一条。拼不出统一返回
None，再由 `finalize_home_url` 兜底到平台站点首页。
"""
from __future__ import annotations

from collections.abc import Callable


# ============ 1) platform_user_id 直接拼主页（无需网络） ============
# 与前端 tlfPlatformUrls.ts PROFILE_URL 对齐——新增/改动两边都要同步。
_USER_ID_HOME_BUILDERS: dict[str, Callable[[str], str]] = {
    "XiaoHongShu": lambda uid: f"https://www.xiaohongshu.com/user/profile/{uid}",
    "XiaoHongShuShangJiaHao": lambda uid: f"https://www.xiaohongshu.com/user/profile/{uid}",
    # 快手**不在此列**：web 个人页用 eid（≠ 数字 platform_user_id），且灵径接口拿不到 eid（见文件头注），
    #   由 finalize_home_url 兜底到快手站点首页。
    "BiLiBiLi": lambda uid: f"https://space.bilibili.com/{uid}",
    "BiliBiliComic": lambda uid: f"https://space.bilibili.com/{uid}",
    "XinLangWeiBo": lambda uid: f"https://weibo.com/u/{uid}",
    "DouBan": lambda uid: f"https://www.douban.com/people/{uid}/",
    "JianShu": lambda uid: f"https://www.jianshu.com/u/{uid}",
    "ACFun": lambda uid: f"https://www.acfun.cn/u/{uid}",
    # 知乎 platform_user_id 即 url_token（32 位 hex），可直达个人主页
    "ZhiHu": lambda uid: f"https://www.zhihu.com/people/{uid}",
}


def build_home_url_from_user_id(platform_code: str, platform_user_id: str | None) -> str | None:
    """用 platform_user_id 直接拼主页 URL；不支持的平台 / 缺 id → None。"""
    uid = (platform_user_id or "").strip()
    if not uid:
        return None
    builder = _USER_ID_HOME_BUILDERS.get(platform_code)
    if builder is None:
        return None
    try:
        return builder(uid) or None
    except Exception:  # noqa: BLE001 — best-effort
        return None


# ============ 2) 需作者信息接口才能拼主页 ============

def _find_in_nodes(info: dict, *keys: str) -> str | None:
    """在 author_info 的几层常见嵌套（顶层 / raw / data / data.raw）里找首个非空 key 值。"""
    nodes: list[dict] = []
    for node in (info, info.get("raw"), info.get("data")):
        if isinstance(node, dict):
            nodes.append(node)
    data_node = info.get("data")
    if isinstance(data_node, dict) and isinstance(data_node.get("raw"), dict):
        nodes.append(data_node["raw"])
    for node in nodes:
        for k in keys:
            v = node.get(k)
            if v:
                return str(v)
    return None


def _douyin(info: dict) -> str | None:
    sec_uid = _find_in_nodes(info, "sec_uid", "secUid", "secuid")
    return f"https://www.douyin.com/user/{sec_uid}" if sec_uid else None


# 平台 code → 从 author_info(dict) 拼主页 URL 的函数。新增平台在此加一条即可。
# 注：快手不在此列——其 web 主页需 eid，但灵径作者信息 raw 里拿不到（见文件头注）。
_AUTHOR_INFO_HOME_BUILDERS: dict[str, Callable[[dict], str | None]] = {
    "DouYin": _douyin,
}


def needs_author_info(platform_code: str) -> bool:
    """该平台是否需要调作者信息接口才能拼主页（无法用 platform_user_id 直接拼）。"""
    return platform_code in _AUTHOR_INFO_HOME_BUILDERS


def build_home_url_from_author_info(platform_code: str, author_info: dict | None) -> str | None:
    """按平台从作者信息拼用户主页 URL；不支持的平台 / 拿不到所需字段 → None。"""
    if not author_info or not isinstance(author_info, dict):
        return None
    builder = _AUTHOR_INFO_HOME_BUILDERS.get(platform_code)
    if builder is None:
        return None
    try:
        return builder(author_info) or None
    except Exception:  # noqa: BLE001 — best-effort
        return None


# ============ 3) 平台站点首页（拼不出用户主页时的兜底，网关内完成，下游不再兜底） ============
# 与前端 tlfPlatformUrls.ts SITE_HOME 对齐。覆盖所有支持的国内 + 海外平台。
_SITE_HOME: dict[str, str] = {
    # ── 国内 ──
    "DouYin": "https://www.douyin.com",
    "KuaiShou": "https://www.kuaishou.com",
    "XiaoHongShu": "https://www.xiaohongshu.com",
    "XiaoHongShuShangJiaHao": "https://www.xiaohongshu.com",
    "BiLiBiLi": "https://www.bilibili.com",
    "BiliBiliComic": "https://manga.bilibili.com",
    "BaiJiaHao": "https://baijiahao.baidu.com",
    "TouTiaoHao": "https://mp.toutiao.com",
    "XinLangWeiBo": "https://weibo.com",
    "ShiPinHao": "https://channels.weixin.qq.com",
    "ZhiHu": "https://www.zhihu.com",
    "WeiXinGongZhongHao": "https://mp.weixin.qq.com",
    "XueQiuHao": "https://xueqiu.com",
    "KuaiChuanHao": "https://kuaichuan.uc.cn",
    "ACFun": "https://www.acfun.cn",
    "YiCheHao": "https://www.yiche.com",
    "DuoDuoShiPin": "https://www.pinduoduo.com",
    "MeiPai": "https://www.meipai.com",
    "AiQiYi": "https://www.iqiyi.com",
    "SouHuShiPin": "https://tv.sohu.com",
    "TengXunWeiShi": "https://weishi.qq.com",
    "DouBan": "https://www.douban.com",
    "JianShu": "https://www.jianshu.com",
    # ── 海外（Composio）──
    "LinkedIn": "https://www.linkedin.com",
    "Facebook": "https://www.facebook.com",
    "Instagram": "https://www.instagram.com",
    "Reddit": "https://www.reddit.com",
    "YouTube": "https://www.youtube.com",
    "Twitter": "https://x.com",
    "TikTok": "https://www.tiktok.com",
}


def finalize_home_url(platform_code: str, profile_url: str | None) -> tuple[str | None, bool]:
    """把「用户主页 URL（可能为 None）」收敛成对下游友好的最终结果 `(home_url, is_profile)`：

    - 有用户主页 → (profile_url, True)
    - 没有 → 退到平台站点首页 (site_url, False)
    - 站点首页也没收录 → (None, False)

    兜底在网关内完成，下游直接用 home_url + is_profile，无需自己拼/兜底。
    """
    if profile_url:
        return profile_url, True
    site = _SITE_HOME.get(platform_code)
    return (site, False) if site else (None, False)


__all__ = [
    "build_home_url_from_user_id",
    "needs_author_info",
    "build_home_url_from_author_info",
    "finalize_home_url",
]
