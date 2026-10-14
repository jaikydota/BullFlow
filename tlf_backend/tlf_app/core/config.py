"""推量发后端全局配置。

- 独立数据库 matrix365_tlf（与主 backend 隔离）
- 灵径 lapi.cc 的真实 appId/secret 仅在此处保存（外部子租户不再持有）
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── JWT（tlf 自有密钥，自己签发自己校验） ──
    JWT_SECRET_KEY: str = "change-me-tlf-jwt-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 2880  # 2 天

    # ── 首次启动 seed 第一个超级管理员（admin_users 表为空时触发） ──
    TLF_ADMIN_INIT_EMAIL: str = "admin@tlf.local"
    TLF_ADMIN_INIT_PASSWORD: str = "ChangeMe@2026"
    TLF_ADMIN_INIT_NAME: str = "推量发管理员"

    # ── 独立数据库 ──
    MYSQL_HOST: str = "localhost"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "root"
    MYSQL_PASSWORD: str = "root123456"
    MYSQL_DATABASE: str = "matrix365_tlf"

    # ── Redis（用于 webhook 防重放 + auth-op 状态缓存） ──
    REDIS_URL: str = "redis://localhost:6379/3"
    TLF_REDIS_PREFIX: str = "tlf:"
    # 扫码授权进度（auth-op）在 Redis 的存活时长。纯轮询接入方靠 GET /auth/status 读它，
    # 需覆盖扫码窗口；过期后改用 GET /accounts 兜底发现已绑账号。
    AUTH_OP_STATE_TTL_SECONDS: int = 1800
    # 扫码授权超时（秒）：超过此时长仍未收到上游结果，/auth/status 返回 status=timeout，
    # 告知接入方停止轮询（避免上游静默时无限轮询浪费算力）。须 <= AUTH_OP_STATE_TTL_SECONDS。
    AUTH_OP_TIMEOUT_SECONDS: int = 600
    # 发布任务超时（秒）：自「生效起点」（立即发布=创建时间；定时发布=pre_pub_time）起
    # 超过此时长仍未到终态，GET /tasks/{id} 惰性判定为超时 → 未回报的子任务标记 failed、
    # 任务落终态（failed/partial），告知接入方停止轮询。
    PUBLISH_TASK_TIMEOUT_SECONDS: int = 3600

    # ── 灵径 lapi.cc 真实凭据 ──
    LAPI_BASE_URL: str = "https://app.lapi.cc"
    LAPI_APP_ID: str = ""
    LAPI_SECRET: str = ""
    LAPI_WEBHOOK_SECRET: str = ""
    LAPI_HTTP_TIMEOUT: int = 30
    LAPI_WEBHOOK_MAX_AGE: int = 300
    # 调用灵径接口的日志单段最大字符数（参数 / 响应超长时截断），0 = 不截断
    LAPI_LOG_MAX_CHARS: int = 1000

    # ── Composio（海外平台 OAuth + 发帖；managed 模式只需 1 个 API key） ──
    COMPOSIO_API_KEY: str = ""
    # 留空使用 SDK 内置 production host = https://backend.composio.dev
    COMPOSIO_BASE_URL: str = ""
    # 用户授权完成后回跳的前端地址（OAuth callback）；query 会带 connection 状态
    COMPOSIO_CALLBACK_URL: str = ""
    # dashboard 配 webhook 后下发的验签密钥（连接过期/激活事件）
    COMPOSIO_WEBHOOK_SECRET: str = ""
    # 显式登记各 toolkit 的 auth config id，形如 `twitter=ac_xxx,linkedin=ac_yyy`（toolkit 小写）。
    # **自建 OAuth app 的平台必须在此登记**：如 X/Twitter，Composio 不提供其托管凭证，
    # 网关若按 managed 新建配置必然失败，只能取用 dashboard 里手工建好的自建配置。
    # 🔴 Composio 的 API key 是 **project 级**：此处 ac_id 必须与 COMPOSIO_API_KEY 属于同一个
    # project，否则查询返回 404 Auth_Config_NotFound（在另一个 project 建的配置这边看不见）。
    COMPOSIO_AUTH_CONFIG_IDS: str = ""

    # ── 代理健康检查（周期检测 + 不健康自动换） ──
    PROXY_HEALTH_CHECK_ENABLED: bool = True
    PROXY_HEALTH_CHECK_INTERVAL: int = 1200    # 本机巡检周期（秒），默认 20 分钟（灵径侧失败标记已兜住真实坏代理）
    PROXY_HEALTH_TARGET: str = "https://www.baidu.com"  # 经代理访问的探测目标
    PROXY_HEALTH_TIMEOUT: float = 8.0          # 单代理探测超时（秒）
    PROXY_SLOW_MS: int = 3000                  # 出口延迟超过此值判为 slow
    PROXY_DEAD_FAIL_THRESHOLD: int = 3         # 本机巡检连续失败达此次数才判 dead（防抖动）
    PROXY_UPSTREAM_FAIL_THRESHOLD: int = 2     # 灵径侧用该代理连续失败(超时/网络异常)达此次数→禁用+迁移
    PROXY_HEALTH_CONCURRENCY: int = 8          # 并发探测数
    # 用户粘性的**单代理单平台**账号上限：同一终端用户在同一 IP 上、同一平台的账号达到此值后，
    # 新增该平台账号改分配到**同区域另一个 IP**（降低同 IP 同平台账号扎堆的风控风险）。
    # 不同平台各自计数、互不影响；同区域无其它可用 IP 时仍留在原 IP（宁可扎堆也不跨区）。0=不限。
    PROXY_STICKY_MAX_PER_PLATFORM: int = 15

    # ── 批量同步账号 (/accounts/sync-batch) ──
    SYNC_BATCH_MAX_ACCOUNTS: int = 20   # 单次最多同步账号数（灵径无批量，逐账号检测，防下游超时）
    SYNC_BATCH_CONCURRENCY: int = 5     # 批量同步的并发度（既避免串行超时，又不并发轰炸灵径）

    # ── 不活跃账号自动回收（灵径按会话按天扣费，长期不用/已掉线的账号持续扣费不划算） ──
    # 超过 N 天「未使用」（无发布/取分类/风控操作，也未重新扫码授权）的灵径账号：
    # 自动在灵径侧 revoke（停止扣费）+ 本地标 expired（下游账号仍在、登录态显示掉线，重新扫码即恢复，
    # acc_xxx 不变）。注意「使用」不含登录态轮询检查与触发指标采集（均为下游定时任务常态，
    # 若计入会让账号被每日续命、机制形同虚设）。0=禁用。
    INACTIVE_ACCOUNT_REVOKE_DAYS: int = 14
    INACTIVE_REVOKE_INTERVAL_HOURS: int = 12   # 后台巡检周期（小时）

    # ── webhook 转发到子租户的重试 ──
    WEBHOOK_FORWARD_MAX_RETRIES: int = 3
    WEBHOOK_FORWARD_TIMEOUT: int = 10
    WEBHOOK_FORWARD_BACKOFF_SECONDS: str = "1,3,10"  # 逗号分隔

    # ── CORS（管理后台/SDK 调用 origin） ──
    CORS_ORIGINS: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:5391,http://127.0.0.1:5391,"
        "http://localhost:8040,http://127.0.0.1:8040"
    )
    CORS_EXTRA_ORIGINS: str = ""
    CORS_ALLOW_LOCALHOST_REGEX: bool = True
    CORS_ALLOW_PRIVATE_LAN_REGEX: bool = True

    @property
    def MYSQL_URL(self) -> str:
        return (
            f"mysql+asyncmy://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"
            "?charset=utf8mb4"
        )

    def cors_origin_list(self) -> list[str]:
        chunks: list[str] = []
        for raw in (self.CORS_ORIGINS, self.CORS_EXTRA_ORIGINS):
            if raw and raw.strip():
                chunks.extend([o.strip() for o in raw.split(",") if o.strip()])
        seen: set[str] = set()
        out: list[str] = []
        for o in chunks:
            if o not in seen:
                seen.add(o)
                out.append(o)
        return out

    def cors_origin_regex(self) -> str | None:
        chunks: list[str] = []
        if self.CORS_ALLOW_LOCALHOST_REGEX:
            chunks.append(r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?")
        if self.CORS_ALLOW_PRIVATE_LAN_REGEX:
            chunks.append(
                r"https?://("
                r"10(?:\.\d{1,3}){3}|"
                r"192\.168(?:\.\d{1,3}){2}|"
                r"172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}"
                r")(?:\:\d+)?"
            )
        if not chunks:
            return None
        return "^(" + "|".join(chunks) + ")$"

    def forward_backoff_seconds(self) -> list[int]:
        return [int(x.strip()) for x in self.WEBHOOK_FORWARD_BACKOFF_SECONDS.split(",") if x.strip()]

    def composio_auth_config_map(self) -> dict[str, str]:
        """解析 COMPOSIO_AUTH_CONFIG_IDS → {toolkit_slug(小写): ac_id}。格式非法的片段静默跳过。"""
        out: dict[str, str] = {}
        for chunk in (self.COMPOSIO_AUTH_CONFIG_IDS or "").split(","):
            key, sep, value = chunk.strip().partition("=")
            if not sep:
                continue
            key, value = key.strip().lower(), value.strip()
            if key and value:
                out[key] = value
        return out


settings = Settings()
