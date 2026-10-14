from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- App ----
    APP_DEBUG: bool = True

    # ---- JWT ----
    JWT_SECRET_KEY: str = "change-me-jwt-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    #: 管理后台（/api/v1/admin/*）登录签发的 access token 有效期；后台无 refresh 流程，默认 2 天
    ADMIN_JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 2880

    # ---- Super Admin ----
    SUPER_ADMIN_EMAIL: str = "admin@matrix365.com"
    SUPER_ADMIN_PASSWORD: str = "Admin@2025"

    # ---- MySQL ----
    MYSQL_HOST: str = "localhost"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "root"
    MYSQL_PASSWORD: str = "root123456"
    MYSQL_DATABASE: str = "matrix365"

    @property
    def MYSQL_URL(self) -> str:
        return (
            f"mysql+asyncmy://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"
            f"?charset=utf8mb4"
        )

    @property
    def MYSQL_URL_SYNC(self) -> str:
        """Alembic needs a sync-style URL (uses asyncmy driver in NullPool)."""
        return self.MYSQL_URL

    # ---- Redis ----
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = ""
    REDIS_DB: int = 1

    @property
    def REDIS_URL(self) -> str:
        password_part = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
        return f"redis://{password_part}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    # ---- Milvus ----
    MILVUS_HOST: str = "localhost"
    MILVUS_PORT: int = 19530

    # ---- Elasticsearch ----
    ES_HOST: str = "localhost"
    ES_PORT: int = 9200
    ES_USER: str = "elastic"
    ES_PASSWORD: str = ""

    @property
    def ES_URL(self) -> str:
        return f"http://{self.ES_HOST}:{self.ES_PORT}"

    # ---- MinIO ----
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin123"
    MINIO_BUCKET_NAME: str = "knowledge"
    MINIO_SECURE: bool = False
    # 浏览器直接访问 MinIO 的公开基础 URL（用于静态资源如 Logo、封面图）
    # 生产环境配置为对外域名，如 https://static.example.com
    MINIO_PUBLIC_URL: str = "http://localhost:9000"

    # ---- Embedding / Reranker / CLIP ----
    EMBEDDING_MODEL: str = "BAAI/bge-m3"
    EMBEDDING_DEVICE: str = "cuda"
    RERANKER_ENABLED: bool = False
    RERANKER_MODEL: str = "BAAI/bge-reranker-v2-m3"
    RERANKER_DEVICE: str = "cuda"
    CLIP_MODEL: str = "openai/clip-vit-large-patch14"
    CLIP_DEVICE: str = "cuda"
    # 图片语义检索分数下限（CLIP 余弦相似度），低于此值不返回（0 = 不过滤）
    IMAGE_SCORE_THRESHOLD: float = 0.20

    # ---- 分块策略 ----
    CHUNK_METHOD: str = "semantic"
    CHUNK_SIZE: int = 2048
    CHUNK_OVERLAP: int = 128
    TABLE_CHUNK_SIZE: int = 4096
    SENTENCE_MODEL: str = "sat-3l-sm"
    SENTENCE_DEVICE: str = "cpu"

    # ---- 混合检索 ----
    # 合并模式: "rrf"（默认，只看排名不看分值，更稳定）| "weighted"（归一化加权求和）
    HYBRID_MERGE_MODE: str = "rrf"
    RRF_K: int = 60                           # RRF 常数 k，越大排名影响越平滑
    HYBRID_VECTOR_WEIGHT: float = 0.6         # weighted 模式专用
    HYBRID_FULLTEXT_WEIGHT: float = 0.4       # weighted 模式专用
    # 向量召回原始分下限（BGE-M3 余弦相似度），低于此值视为不相关直接丢弃
    VECTOR_SCORE_THRESHOLD: float = 0.40
    # 送入重排序的最大候选数，超出部分按 RRF/加权分截断丢弃（防止大数据量卡死）
    RERANKER_TOP_N: int = 20
    # 重排序后分数下限，低于此值不返回给前端/LLM（0 = 不过滤）
    RERANKER_SCORE_THRESHOLD: float = 0.05

    # ---- 自适应检索 ----
    ADAPTIVE_RETRIEVAL_ENABLED: bool = True
    # 留空则自动沿用当前对话的模型；可配置为轻量模型以降低成本
    ADAPTIVE_RETRIEVAL_MODEL: str = ""

    # ---- Query Adapter ----
    QUERY_ADAPTER_ENABLED: bool = False
    QUERY_ADAPTER_PATH: str = "data/query_adapter.npy"

    # ---- LLM: Azure ----
    AZURE_OPENAI_BASE_URL: str = ""
    AZURE_OPENAI_API_KEY: str = ""
    AZURE_OPENAI_MODELS: str = "gpt-5.4-mini,gpt-5.4-nano,gpt-5.4"

    # ---- LLM: Volcengine ----
    VOLCENGINE_BASE_URL: str = "https://ark.cn-beijing.volces.com/api/v3"
    VOLCENGINE_API_KEY: str = ""
    VOLCENGINE_MODELS: str = "doubao-seed-2-0-pro-260215,doubao-seed-2-0-lite-260215,doubao-seed-2-0-mini-260215"

    # ---- LLM: Aliyun ----
    ALIYUN_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    ALIYUN_API_KEY: str = ""
    ALIYUN_MODELS: str = "qwen3.6-flash,qwen3.7-plus,qwen3.7-max"

    # ---- Default LLM ----
    DEFAULT_LLM_PROVIDER: str = "azure"
    DEFAULT_LLM_MODEL: str = "gpt-5.4-mini"

    # ---- LLM thinking / reasoning（深度思考）----
    # 文章生成是否统一开启「深度思考」。三家机制不同，由 llm_service 按 provider 注入：
    #   azure(gpt-5.4 系列) → reasoning_effort（reasoning 模型，开启后不再发自定义 temperature）
    #   volcengine(doubao-seed) → extra_body.thinking.type=enabled
    #   aliyun(qwen3.7)     → extra_body.enable_thinking=true（仅流式支持，非流式自动跳过避免 400）
    # 开启会显著增加延迟与 token 成本；如需回退设为 false。
    ARTICLE_THINKING_ENABLED: bool = True
    # azure GPT-5 系列 reasoning 力度：minimal / low / medium / high（越高越慢越贵）
    THINKING_REASONING_EFFORT: str = "medium"
    # 文章正文 token 上限（仅上限非目标，写完即停）。设 32K：覆盖几千字长文 + reasoning 占用，
    # 且 9 个模型均支持（最小 32K / 最大 128K 输出）。需更长可上调至 65536 / 131072。
    ARTICLE_MAX_COMPLETION_TOKENS: int = 32768

    # ---- 生图/生视频: Doubao ----
    ARK_API_KEY: str = ""
    DOUBAO_BASE_URL: str = "https://ark.cn-beijing.volces.com/api/v3"
    DOUBAO_IMAGE_MODEL: str = "doubao-seedream-5-0-260128"
    DOUBAO_VIDEO_MODEL: str = "doubao-seedance-2-0-260128"

    # ---- 生图/生视频: Tencent ----
    TENCENT_SECRET_ID: str = ""
    TENCENT_SECRET_KEY: str = ""
    TENCENT_VOD_SUB_APP_ID: int = 0

    # ---- 生图: Azure gpt-image-2 ----
    # 完整 endpoint URL（含 deployment + api-version 查询参数）
    # 例：https://{host}/openai/deployments/gpt-image-2/images/generations?api-version=2024-02-01
    AZURE_IMAGE_GENERATIONS_URL: str = ""
    # 图生图 edits 端点；例：https://{host}/openai/deployments/gpt-image-2/images/edits?api-version=2024-02-01
    AZURE_IMAGE_EDITS_URL: str = ""
    # 部署名，仅用于日志 / 计费 model id 记录；与 URL 中的 deployment 保持一致
    AZURE_IMAGE_MODEL: str = "gpt-image-2"
    # 请求超时（秒），生图响应可能较慢
    AZURE_IMAGE_TIMEOUT: int = 300

    # ---- 图文混编 / 多图 ----
    # 图文混编文章自动配图的随机张数区间（含端点），固定走 gpt-image-2
    MIXED_ARTICLE_IMAGE_MIN: int = 1
    MIXED_ARTICLE_IMAGE_MAX: int = 3
    # 图片生成「一次生成多张」的上限（对应发布动态多图）
    IMAGE_BATCH_MAX: int = 9

    # ---- 轮询 ----
    VIDEO_POLL_INTERVAL: int = 5
    VIDEO_POLL_TIMEOUT: int = 1800

    # ---- 模型加载策略 ----
    # True  = 后端启动时立即并发预加载 BGE-M3 + wtpsplit（首次请求零等待）
    # False = 首次使用时懒加载（启动快，首次文档处理/检索时有一次性等待）
    MODEL_PRELOAD_ENABLED: bool = False

    # ---- IndexTTS 语音合成 ----
    INDEX_TTS_URL: str = ""                          # POST JSON，返回 WAV 字节流
    INDEX_REFERENCE_AUDIO: str = "reference.wav"     # TTS 服务端上的参考音频路径
    INDEX_TTS_TIMEOUT: int = 120                     # 单次合成最长等待秒数

    # ---- WhisperX 语音转录 ----
    WHISPERX_URL: str = ""          # POST multipart/form-data，OpenAI-compatible
    WHISPERX_TIMEOUT: int = 300     # 单文件最长等待秒数
    WHISPERX_MODEL_DEFAULT: str = "deepdml/faster-whisper-large-v3-turbo-ct2"
    WHISPERX_MODEL_ZH: str = "flateon/Belle-whisper-large-v3-turbo-zh-ct2"  # 中文专用，输出繁体
    WHISPERX_ZH_IS_TRADITIONAL: bool = True   # 中文专用模型输出繁体，自动转换为简体

    # ---- OCR (PaddleOCR PP-StructureV3) ----
    OCR_SERVICE_URL: str = "http://localhost:8866"
    OCR_ENABLED: bool = True
    OCR_TIMEOUT: int = 120
    OCR_FALLBACK_TO_PYMUPDF: bool = True
    # PDF 超过此页数时跳过 OCR，直接用 PyMuPDF 解析（0 = 不限制）
    # 注意：PyMuPDF 不能 OCR 图片，超限 PDF 中的嵌入图片文字将丢失
    PDF_MAX_OCR_PAGES: int = 100

    # ---- Pandoc 文档转 Markdown ----
    # 对 DOCX/PPTX/HTML/EPUB/RTF/ODT 等格式优先用 Pandoc 转为 GFM Markdown，
    # 失败时自动降级到内置解析器。需要系统安装 pandoc 命令行工具。
    PANDOC_ENABLED: bool = True

    # ---- PPTX 图片 OCR ----
    # 开启后，_parse_pptx() 会提取每张幻灯片中的嵌入图片，
    # 并发调用 PaddleOCR 识别图中文字，追加到对应幻灯片内容。
    # 依赖 OCR_ENABLED=true 且 PaddleOCR 服务可用，否则自动跳过。
    PPTX_IMAGE_OCR_ENABLED: bool = True

    # ---- 国内分发：推量发网关（多租户网关，背后再连推量发）----
    # 主 backend 作为网关的「默认子租户」，通过网关 SDK API 完成国内分发。
    TLF_BASE_URL: str = "http://tlf-backend:8041/api/sdk/v1"
    TLF_APP_ID: str = ""
    TLF_APP_KEY: str = ""
    TLF_HTTP_TIMEOUT: int = 35
    # 推量发转发事件回本服务时的 webhook 签名密钥（= 推量发后台为本租户分配的 webhook_secret）
    TLF_WEBHOOK_SECRET: str = ""
    # ---- 接收推量发转发的 tlf 事件 webhook（path 仍为 /api/v1/webhooks/tlf）----
    TLF_REDIS_PREFIX: str = "tlf:"          # auth-op 状态缓存键前缀
    TLF_WEBHOOK_MAX_AGE: int = 300           # webhook 时间戳防重放窗口（秒）
    # 发布任务「无回调」超时（分钟）：pending/publishing 状态超过此时长仍未收到
    # 任一终态 webhook，则在读取任务时兜底判定为失败/超时（前端据此停止轮询）。
    # 适用场景：推量发/上游未推 webhook，避免前端无限轮询「分发中」浪费算力。
    TLF_TASK_TIMEOUT_MINUTES: int = 30
    # 海外平台（Composio）发布是同步完成的（秒级），结果靠网关主动转发 publishResult 回流。
    # 若转发彻底失败，无需等国内的 30 分钟——用更短窗口兜底为失败，体验更好。
    TLF_OVERSEA_TASK_TIMEOUT_MINUTES: int = 5
    # 数据采集每日触发时间（24h 制，本地时区）—— 主 backend 调度，调用经推量发
    TLF_METRICS_DAILY_HOUR: int = 2
    TLF_METRICS_DAILY_MINUTE: int = 0

    # 埋点每日聚合任务触发时间（Asia/Shanghai）：统计昨天完整数据 + 刷新今天滚动值
    ANALYTICS_DAILY_HOUR: int = 1
    ANALYTICS_DAILY_MINUTE: int = 10

    # ---- 梦网国际短信 ----
    # false 时跳过真实发送，仅在日志打印验证码，方便本地开发
    SMS_ENABLED: bool = True
    SMS_PROVIDER_USERID: str = ""
    SMS_PROVIDER_PWD: str = ""
    SMS_SINGLE_URL: str = "http://sms.umsapi.int-montnets.com:6651/sms/v2/std/message"
    SMS_BATCH_URL: str = "http://sms.umsapi.int-montnets.com:6651/sms/v2/std/batchmessage"
    # 短信签名（前缀），需与短信平台已报备的签名一致
    SMS_SIGNATURE: str = "【中巨量科技】"
    SMS_HTTP_TIMEOUT: int = 8
    # 验证码有效期（秒）
    SMS_VERIFY_CODE_TTL: int = 300
    # 同一手机号 60 秒内最多发送次数
    SMS_RATE_PHONE_60S: int = 1
    # 同一手机号 1 小时内最多发送次数
    SMS_RATE_PHONE_HOUR: int = 5
    # 同一手机号 24 小时内最多发送次数
    SMS_RATE_PHONE_DAY: int = 10
    # 同一 IP 1 小时内最多发送次数
    SMS_RATE_IP_HOUR: int = 20
    # 验证码错误尝试上限，超过则锁定（秒）
    SMS_VERIFY_MAX_FAIL: int = 5
    SMS_VERIFY_LOCK_SECONDS: int = 900

    # ---- 邮件 / SMTP（管理后台：发票开具后发邮件给收票邮箱）----
    #: false 时跳过真实发送，仅打日志（本地开发用）
    EMAIL_ENABLED: bool = True
    SMTP_HOST: str = ""          # SMTP 服务器，如 smtpdm-ap-southeast-1.aliyun.com
    SMTP_PORT: int = 465         # 465=SSL / 587=STARTTLS
    SMTP_USER: str = ""          # SMTP 登录账号（同时作为发件人地址）
    SMTP_PASSWORD: str = ""      # SMTP 登录密码
    SMTP_FROM_NAME: str = "推量牛"  # 发件人显示名
    SMTP_TIMEOUT: int = 15       # 发送超时（秒）

    # ---- 人机验证（自研滑块拼图） ----
    # false 时全流程不弹验证、登录不拦（便于本地/压测，可一键回滚）
    CAPTCHA_ENABLED: bool = True
    # 拼图题有效期（秒）
    CAPTCHA_TTL: int = 120
    # 验证通过凭证 ticket 有效期（秒），一次性消费
    CAPTCHA_TICKET_TTL: int = 300
    # 滑块允许的像素误差
    CAPTCHA_TOLERANCE: int = 6
    # 单题最大尝试次数，超过作废需重新拉题
    CAPTCHA_MAX_TRIES: int = 5
    # 同一 IP 验证失败超过该次数则锁定一段时间（让用户等待）
    CAPTCHA_FAIL_MAX: int = 5
    # 锁定时长（秒）
    CAPTCHA_LOCK_SECONDS: int = 120
    # 账号密码登录：同 IP+账号连续失败达到该次数后才要求人机验证（渐进式）
    CAPTCHA_LOGIN_THRESHOLD: int = 3

    # ---- 通联支付 AllinPay ----
    # 沙箱: https://syb-test.allinpay.com    生产: https://vsp.allinpay.com
    ALLINPAY_BASE_URL: str = "https://syb-test.allinpay.com"
    ALLINPAY_CUSID: str = ""                # 商户号（15位）
    ALLINPAY_APPID: str = ""                # 应用 ID（8位）
    ALLINPAY_PRIVATE_KEY: str = ""          # 商户 RSA 私钥（PKCS#8 PEM 单行 base64 或多行；多行时 .env 用 """ 包裹）
    ALLINPAY_PUBLIC_KEY: str = ""           # 通联平台 RSA 公钥（验证回调签名用）
    ALLINPAY_NOTIFY_URL: str = ""           # 异步回调地址，必须公网可达，如 https://example.com/api/v1/webhooks/allinpay
    ALLINPAY_SIGN_TYPE: str = "RSA"         # 签名算法，默认 RSA（SHA1WithRSA）
    ALLINPAY_HTTP_TIMEOUT: int = 15
    # 默认 paytype 映射（前端只暴露 alipay/wechat 两种语义）
    ALLINPAY_DEFAULT_ALIPAY_PAYTYPE: str = "A01"
    ALLINPAY_DEFAULT_WECHAT_PAYTYPE: str = "W01"
    # 回调来源 IP 白名单（逗号分隔，留空表示不校验）
    ALLINPAY_CALLBACK_IP_WHITELIST: str = ""

    # ---- 订阅 / 订单 ----
    # 订单超时（分钟），pending 状态超过此时间自动取消
    SUBSCRIPTION_ORDER_TIMEOUT_MINUTES: int = 30
    # 订阅到期检查 cron（小时:分钟，UTC）
    SUBSCRIPTION_EXPIRY_CHECK_HOUR: int = 0
    SUBSCRIPTION_EXPIRY_CHECK_MINUTE: int = 5
    # 订单超时清理 cron（分钟间隔）
    ORDER_CLEANUP_INTERVAL_MINUTES: int = 5


settings = Settings()
