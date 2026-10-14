"""admin API schema。"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from tlf_app.schemas.common import UtcDateTime


class PlatformPolicyUpdateRequest(BaseModel):
    """后台修改平台发布策略。"""
    allow_links: bool = Field(..., description="是否允许发布含链接的内容（URL / 裸域名）")
    note: str | None = Field(None, max_length=500, description="备注（如关闭原因）")


class LapiAccountAdminResponse(BaseModel):
    """底层稳定账号（MediaAccount）视图：一行 = 一个物理社媒号。"""
    id: str
    account_id: str = ""                    # 对外稳定 id（acc_xxx）
    lapi_account_id: str | None = None      # 当前底层灵径会话 id（current_lapi_account_id）
    platform_code: str
    platform_user_id: str
    platform_user_name: str | None = None
    platform_avatar: str | None = None
    platform_home_url: str | None = None
    status: str
    provider: str = "lapi"              # lapi=灵径(国内扫码) / composio=海外(OAuth，无底层会话/代理)
    proxy_id: str | None = None
    proxy_name: str | None = None       # 当前会话所用代理节点名
    proxy_server: str | None = None     # 当前会话所用代理 ip:port
    proxy_region: str | None = None     # 该账号选定的分发代理区域（媒体号级，故障转移按此优先同区域）
    last_authed_at: UtcDateTime | None = None
    last_sync_at: UtcDateTime | None = None
    binding_count: int = 0
    created_at: UtcDateTime
    updated_at: UtcDateTime

    model_config = {"from_attributes": True}


class TenantBindingAdminResponse(BaseModel):
    id: str
    app_id: str
    app_name: str | None = None
    account_id: str | None = None           # 对外稳定 id（acc_xxx）
    lapi_account_id: str | None = None       # 遗留：历史灵径会话 id
    platform_code: str | None = None
    platform_user_name: str | None = None
    custom_label: str | None = None
    status: str
    bound_at: UtcDateTime | None = None
    created_at: UtcDateTime

    model_config = {"from_attributes": True}


class ProxyCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    region: str | None = Field(None, max_length=64)
    server_add: str = Field(..., min_length=1, max_length=255)
    server_port: int = Field(..., ge=1, le=65535)
    proxy_type: str = Field("socks5", pattern=r"^(socks5|http)$")
    user_name: str | None = Field(None, max_length=120)
    password: str | None = Field(None, max_length=255)
    max_users: int | None = Field(None, ge=1, le=100000)
    expires_at: datetime | None = None
    status: str = Field("active", pattern=r"^(active|expired|disabled)$")
    sort_order: int = Field(0, description="下发/展示排序权重，越大越靠前")
    order_no: str | None = Field(None, max_length=64, description="采购订单号")
    notes: str | None = Field(None, max_length=2000, description="备注")


class ProxyPatchRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    region: str | None = Field(None, max_length=64)
    server_add: str | None = Field(None, min_length=1, max_length=255)
    server_port: int | None = Field(None, ge=1, le=65535)
    proxy_type: str | None = Field(None, pattern=r"^(socks5|http)$")
    user_name: str | None = Field(None, max_length=120)
    # 空字符串视为「不修改」（不要把已有密码清成空）
    password: str | None = Field(None, max_length=255)
    max_users: int | None = Field(None, ge=1, le=100000)
    expires_at: datetime | None = None
    status: str | None = Field(None, pattern=r"^(active|expired|disabled)$")
    sort_order: int | None = Field(None, description="下发/展示排序权重，越大越靠前")
    order_no: str | None = Field(None, max_length=64)
    notes: str | None = Field(None, max_length=2000)


class SetAccountProxyRequest(BaseModel):
    """修改某稳定账号当前会话所用代理；proxy_id=null 表示解绑（下次自动分配）。"""
    proxy_id: str | None = None


class ProxyBulkRow(BaseModel):
    """批量导入单行（必填基本字段，可选共享字段由 shared 合并补全）。"""
    name: str = Field(..., min_length=1, max_length=100)
    server_add: str = Field(..., min_length=1, max_length=255)
    server_port: int = Field(..., ge=1, le=65535)
    region: str | None = Field(None, max_length=64)
    user_name: str | None = Field(None, max_length=120)
    password: str | None = Field(None, max_length=255)


class ProxyBulkShared(BaseModel):
    """共享字段：批量行没填则用这里。"""
    region: str | None = None
    proxy_type: str | None = Field(None, pattern=r"^(socks5|http)$")
    user_name: str | None = None
    password: str | None = None
    max_users: int | None = Field(None, ge=1, le=100000)
    expires_at: datetime | None = None
    sort_order: int | None = None
    order_no: str | None = None
    notes: str | None = None


class ProxyBulkImportRequest(BaseModel):
    rows: list[ProxyBulkRow] = Field(..., min_length=1, max_length=500)
    shared: ProxyBulkShared | None = None


class ProxyResponse(BaseModel):
    id: str
    name: str
    region: str | None = None
    server_add: str
    server_port: int
    proxy_type: str
    user_name: str | None = None
    max_users: int | None = None
    effective_max_users: int = Field(50, description="生效容量（max_users 或全局默认 50）")
    current_account_count: int = 0
    expires_at: UtcDateTime | None = None
    status: str
    # 连通性健康（周期巡检维护）
    health: str = "unknown"
    last_check_at: UtcDateTime | None = None
    last_latency_ms: int | None = None
    fail_count: int = 0
    # 被屏蔽的平台（某平台封了该代理 IP；代理对其它平台仍可用）
    blocked_platforms: list[str] = []
    sort_order: int = 0
    order_no: str | None = None
    notes: str | None = None
    created_at: UtcDateTime
    updated_at: UtcDateTime

    model_config = {"from_attributes": True}


class WebhookEventAdminResponse(BaseModel):
    id: str
    app_id: str | None = None
    lapi_event_type: str
    signature_ok: int
    forward_status: str
    forward_attempts: int
    forwarded_at: UtcDateTime | None = None
    last_error: str | None = None
    created_at: UtcDateTime

    model_config = {"from_attributes": True}
