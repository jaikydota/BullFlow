"""SDK 对外 API 的请求/响应 schema。"""
from __future__ import annotations

from datetime import date, datetime

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator

from tlf_app.schemas.common import UtcDateTime


# ============ 授权 ============

class StartAuthorizationRequest(BaseModel):
    platform_code: str = Field(..., description="目标平台代码（DouYin / XiaoHongShu / ...）")
    password: str | None = Field(None, description="云端授权密码，按需")
    external_user_id: str | None = Field(
        None, description="子租户系统内的发起用户 ID（透传，便于事件溯源 + 代理 IP/区域粘性）",
    )
    region: str | None = Field(
        None,
        description="代理区域（来自 GET /proxy/regions，如『广东-深圳』）：该账号将用此区域的代理。"
                    "不传则默认沿用该 external_user_id 上次选择的区域；都没有则按全局负载均衡分配",
    )


class StartAuthorizationResponse(BaseModel):
    operation_id: str
    qr_code: str | None = None
    scheme: str | None = None
    session_id: str | None = None
    # 本次实际生效的代理区域（用户传入 / 继承上次 / 无 → null）。便于平台回显。
    region: str | None = None
    # 海外平台(Composio)授权用：OAuth 跳转链接（让用户在此完成授权）。国内平台为 null（走二维码）。
    redirect_url: str | None = None


class ProxyRegionsResponse(BaseModel):
    """下发给接入平台的可选代理区域。"""
    regions: list[str] = Field(default_factory=list, description="可选代理区域（去重，已过滤不可用/未填区域的代理）")
    last_selected_region: str | None = Field(
        None, description="该 external_user_id 上次选择的区域；若不在 regions 里说明该区域当前无可用代理，平台应让用户重选",
    )


class AuthStatusResponse(BaseModel):
    status: str = Field(..., description="pending / success / failed / timeout（timeout=超时，停止轮询）")
    platform_user_name: str | None = None
    platform_user_id: str | None = None
    # 稳定账号 id（acc_xxx）；lapi_account_id 镜像同值，仅兼容旧轮询。
    account_id: str | None = None
    lapi_account_id: str | None = None
    error_message: str | None = None

    @model_validator(mode="after")
    def _mirror_auth_account_id(self):
        if not self.account_id and self.lapi_account_id:
            self.account_id = self.lapi_account_id
        elif not self.lapi_account_id and self.account_id:
            self.lapi_account_id = self.account_id
        return self


# ============ 账号 ============

class AccountResponse(BaseModel):
    id: str
    # 账号 ID（推量发账号唯一标识）。account_id 为对外字段名；
    # lapi_account_id 与之同值，仅为向后兼容旧接入方保留，新接入请用 account_id。
    account_id: str = ""
    lapi_account_id: str = ""
    platform_code: str
    platform_user_id: str
    platform_user_name: str | None = None
    platform_avatar: str | None = None
    platform_home_url: str | None = None
    # platform_home_url 是否为用户个人主页：true=用户主页 / false=平台站点首页（拼不出用户主页时的
    # 兜底，网关内已完成，下游无需自己兜底）。极少数未收录站点首页的平台可能 home_url 为 null。
    home_url_is_profile: bool | None = None
    proxy_region: str | None = None
    status: str
    # 本次「强制同步」(§4.3) 的登录态检测结果；仅同步接口返回，其它接口为 null：
    #   active=检测有效 / expired=检测失效 / error=检测异常(风控/网络/上游错误，status 未更新，
    #   下游可提示"暂时无法核验")。海外(composio)账号不做此检测，为 null。
    login_check: str | None = None
    custom_label: str | None = None
    last_authed_at: UtcDateTime | None = None
    last_sync_at: UtcDateTime | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _mirror_account_id(self):
        # account_id 与 lapi_account_id 互为镜像：构造时任填其一即可。
        if not self.account_id and self.lapi_account_id:
            self.account_id = self.lapi_account_id
        elif not self.lapi_account_id and self.account_id:
            self.lapi_account_id = self.account_id
        return self


# ============ 抖音发布风控解除 ============

class RiskConfirmRequest(BaseModel):
    """解除发布风控请求。method=password 用社媒登录密码；method=smscode 用短信验证码。"""
    method: str = Field(..., description="解除方式：password（登录密码）/ smscode（短信验证码）")
    password: str | None = Field(None, description="社媒登录密码（method=password 必填，后端不落库）")
    code: str | None = Field(None, description="短信验证码（method=smscode 必填）")


# ============ 发布 ============

class PublishRequest(BaseModel):
    # 同时接受 account_ids（对外字段名）与 lapi_account_ids（向后兼容别名）两种入参。
    model_config = ConfigDict(populate_by_name=True)

    external_content_id: str | None = None
    platform_code: str
    account_ids: list[str] = Field(
        ..., min_length=1, description="目标账号 ID 数组",
        validation_alias=AliasChoices("account_ids", "lapi_account_ids"),
    )
    # 子任务 ID（与 account_ids 等长）：接入方传入则原样用于发布任务，
    # webhook taskId 回流时按此匹配各自 account_snapshot。缺省则网关自生成。
    sub_task_ids: list[str] | None = Field(None, description="与 account_ids 等长的子任务 ID")
    publish_kind: str = Field("dynamic", pattern=r"^(video|article|dynamic)$")

    title: str | None = None
    body: str | None = None
    video_url: str | None = None
    cover_urls: list[str] | None = None
    media_urls: list[str] | None = None
    html_content: str | None = None

    # 平台扩展字段（按平台 spec 过滤）
    visible_type: int | str | None = None
    statement: int | str | None = None
    pre_pub_time: int | None = None
    topics: list[str] | None = None
    tags: list[str] | None = None
    location: dict | None = None
    create_type: int | None = None
    # 内容分类（部分平台必填，如哔哩哔哩视频）：透传所选分类节点对象 {yixiaoerId, yixiaoerName, raw}
    category: dict | None = None
    sub_category: dict | None = None
    # 平台特有发布参数（海外平台用，如 Reddit {"subreddit": "test"}）；composio_spec 据平台取用
    extra: dict | None = None


class PublishTaskResponse(BaseModel):
    id: str
    external_content_id: str | None = None
    platform_code: str
    lapi_operation_id: str | None = None
    # 目标账号 ID 数组。target_account_ids 为对外字段名；target_lapi_account_ids 同值，向后兼容保留。
    target_account_ids: list = []
    target_lapi_account_ids: list = []
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

    @model_validator(mode="after")
    def _mirror_target_ids(self):
        if not self.target_account_ids and self.target_lapi_account_ids:
            self.target_account_ids = self.target_lapi_account_ids
        elif not self.target_lapi_account_ids and self.target_account_ids:
            self.target_lapi_account_ids = self.target_account_ids
        return self


# ============ 指标 ============

class MetricResponse(BaseModel):
    snapshot_date: date
    followers: int
    works_count: int
    total_likes: int
    total_views: int

    model_config = {"from_attributes": True}
