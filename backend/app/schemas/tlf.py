from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field

# 时间序列化助手统一来源：app/core/time.py
from app.core.time import UtcDateTime  # noqa: F401


# ============ 账号 ============

class TlfAccountResponse(BaseModel):
    id: str
    tlf_account_id: str
    platform_code: str
    platform_user_id: str
    platform_user_name: str | None = None
    platform_avatar: str | None = None
    platform_home_url: str | None = None
    # platform_home_url 是否为用户个人主页：true=用户主页 / false=平台站点首页（网关已兜底，前端直接用）
    home_url_is_profile: bool | None = None
    status: str
    last_authed_at: UtcDateTime | None = None
    last_sync_at: UtcDateTime | None = None
    created_at: UtcDateTime
    updated_at: UtcDateTime

    model_config = {"from_attributes": True}


class RiskConfirmRequest(BaseModel):
    """解除抖音发布风控请求。method=password 用登录密码；method=smscode 用短信验证码。"""
    method: str = Field(..., pattern=r"^(password|smscode)$", description="解除方式")
    password: str | None = Field(None, max_length=200, description="社媒登录密码（method=password 必填，后端不落库）")
    code: str | None = Field(None, max_length=20, description="短信验证码（method=smscode 必填）")


class StartAuthorizationRequest(BaseModel):
    platform_code: str = Field(..., min_length=2, max_length=32, description="平台代码：DouYin / XiaoHongShu …（按上游 Platforms 枚举）")
    password: str | None = Field(
        None,
        min_length=1,
        max_length=200,
        description="社媒平台账号密码（云授权用，DouYin 等平台必填，用于在云端代登录；后端不落库）",
    )
    region: str | None = Field(
        None,
        max_length=64,
        description="代理网络区域（来自 GET /tlf/proxy-regions，如『广东-深圳』）；不传则沿用该用户上次选择或全局分配",
    )


class TlfProxyRegionsResponse(BaseModel):
    """可选代理网络区域 + 该用户上次选择（供扫码绑定前选区域）。"""
    regions: list[str] = Field(default_factory=list)
    last_selected_region: str | None = None


class StartAuthorizationResponse(BaseModel):
    operation_id: str
    qr_code: str | None = None
    scheme: str | None = None
    session_id: str | None = None
    # 海外平台(Composio)OAuth 跳转链接；国内平台为 null（走二维码）
    redirect_url: str | None = None


# ============ 发布 ============

class TlfPublishRequest(BaseModel):
    content_id: str | None = Field(None, description="可选：内容库 GeneratedContent.id；若有则从内容库取素材")
    platform_code: str = Field(..., description="目标平台代码（账号必须同平台）")
    account_ids: list[str] = Field(..., min_length=1, description="本地 TlfAccount.id 数组")
    publish_kind: str = Field("dynamic", pattern=r"^(video|article|dynamic)$", description="发布类型：video / article / dynamic")
    title: str | None = None
    body: str | None = None
    # 视频发布
    video_url: str | None = Field(None, description="视频 URL（publish_kind=video 时必填）")
    cover_urls: list[str] | None = Field(None, description="封面图 URL 数组（video/article 必填，1+ 张）")
    # 动态 / 图文发布
    media_urls: list[str] | None = Field(None, description="图片 URL 数组（publish_kind=dynamic 时使用）")
    # 文章发布
    html_content: str | None = Field(None, description="文章 HTML 正文（publish_kind=article 时使用，缺省回退到 body）")

    # ── 扩展字段（spec 声明的字段才会被服务层透传到上游 publishData）──
    visible_type: int | str | None = Field(None, description="可见性枚举（每平台值不同；0/1/3 等）")
    statement: int | str | None = Field(None, description="创作申明枚举（每平台值不同）")
    pre_pub_time: int | None = Field(None, description="定时发布时间，毫秒级 Unix 时间戳；不填=立即发布")
    topics: list[str] | None = Field(None, description="话题列表（hashtags）")
    tags: list[str] | None = Field(None, description="标签列表（B 站、CSDN 等需要）")
    location: dict | None = Field(None, description="地理位置（free-form 透传到上游）")
    create_type: int | None = Field(None, description="创作类型/原创声明（B 站 / AcFun / 网易号文章 / 车家号文章；走 createType 字段）")
    category: dict | None = Field(None, description="一级分类（部分平台必填，如哔哩哔哩视频）；透传所选分类节点对象")
    sub_category: dict | None = Field(None, description="二级分类（所选一级分类含子类时）")
    extra: dict | None = Field(None, description="海外平台特有发布参数（如 Reddit {subreddit}）；整体透传到网关")


class TlfTaskResponse(BaseModel):
    id: str
    content_id: str | None = None
    content_snapshot: dict | None = None
    tlf_operation_id: str | None = None
    platform_code: str
    target_account_ids: list = Field(default_factory=list)
    account_snapshot: list | None = None
    status: str
    total_count: int
    success_count: int
    failed_count: int
    result_summary: list | None = None
    error_message: str | None = None
    pre_pub_time: int | None = None
    created_at: UtcDateTime
    updated_at: UtcDateTime

    model_config = {"from_attributes": True}


# ============ 数据采集 ============

class TlfMetricResponse(BaseModel):
    snapshot_date: date
    followers: int
    works_count: int
    total_likes: int
    total_views: int
    raw: dict | None = None
    created_at: UtcDateTime

    model_config = {"from_attributes": True}


# ============ 账号同步 / 发布预填 ============

class TlfSyncBatchRequest(BaseModel):
    """批量同步/检查账号状态：传本地账号 id 列表（前端「批量检查所有状态」分批调用）。"""

    account_ids: list[str] = Field(..., min_length=1, description="本地 TlfAccount.id 列表")


class TlfPrefillRequest(BaseModel):
    """手动发布「按内容预填表单」请求：服务端按统一映射(build_publish_fields)返回可编辑字段。"""

    content_id: str = Field(..., description="内容库 GeneratedContent.id")
    platform_codes: list[str] = Field(..., description="目标平台（多平台取最严格上限）")
    kind: str = Field(..., description="发布类型 article / dynamic / video")
