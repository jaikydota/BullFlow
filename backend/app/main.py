from __future__ import annotations

import logging
import warnings
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import AppException, app_exception_handler

logging.basicConfig(
    level=logging.DEBUG if settings.APP_DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)

# 在应用其余模块导入前先压制 passlib，避免导入阶段输出 DEBUG 噪声
for _name in ("passlib", "passlib.utils.compat", "passlib.registry"):
    logging.getLogger(_name).setLevel(logging.WARNING)

# 提前过滤 transformers 库产生的大量 FutureWarning/UserWarning
# （"Accessing `yv` from `.models.*`" 和 "`use_return_dict` is deprecated" 等）
warnings.filterwarnings("ignore", message=r"Accessing `.*` from `.*models.*`")
warnings.filterwarnings("ignore", message=r".*use_return_dict.*is deprecated")
warnings.filterwarnings("ignore", category=FutureWarning, module=r"transformers.*")

logger = logging.getLogger(__name__)


def _suppress_noisy_loggers() -> None:
    """压制第三方库的冗余 INFO/DEBUG 日志。

    必须在所有模块（包括 SQLAlchemy engine）导入完毕后调用，
    因为 create_async_engine(echo=False) 会将 sqlalchemy.engine.Engine
    的 level 重置为 NOTSET，若在 engine 创建前调用则会被覆盖。
    """
    _noisy = (
        "sqlalchemy.engine",
        "sqlalchemy.engine.Engine",
        "sqlalchemy.pool",
        "sqlalchemy.dialects",
        "passlib",
        "urllib3",
        "elastic_transport",
        # HTTP 客户端底层日志（httpx/httpcore 发请求时的逐包 DEBUG 日志）
        "httpcore",
        "httpcore.connection",
        "httpcore.http11",
        "httpcore.http2",
        "httpx",
        # FastAPI 文件上传 multipart 解析的逐字节 DEBUG 日志
        "python_multipart",
        "python_multipart.multipart",
        "multipart",
        # markdown-it-py 解析器内部日志
        "markdown_it",
        # openai SDK 的 Request options DEBUG 全量日志（含完整 messages，会刷屏）
        # 我们在 llm_service 自己打印截断版请求摘要，故此处压制 SDK 原始噪声
        "openai",
        "openai._base_client",
        "httpx._client",
    )
    for name in _noisy:
        logging.getLogger(name).setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    import time as _time
    _t_start = _time.perf_counter()
    _t_prev = _t_start

    def _stage(label: str) -> None:
        """打印阶段耗时（自上一次调用以来的毫秒数 + 累计毫秒数）。"""
        nonlocal _t_prev
        _now = _time.perf_counter()
        logger.info(
            "[startup] %s | +%.0fms (累计 %.0fms)",
            label,
            (_now - _t_prev) * 1000,
            (_now - _t_start) * 1000,
        )
        _t_prev = _now

    logger.info("Starting ...")

    # 1. Redis — init + 预热连接池（rate_limit 和 JWT blacklist 并发访问时不再冷建连接）
    from app.core.redis import init_redis, close_redis, get_redis as _get_redis
    await init_redis()
    _redis = _get_redis()
    import asyncio as _aio_redis
    _REDIS_WARMUP = 5
    await _aio_redis.gather(*[_redis.ping() for _ in range(_REDIS_WARMUP)])
    _stage(f"Redis connected & pool warmed ({_REDIS_WARMUP} connections)")

    # 2. Milvus
    from app.core.milvus import init_milvus, close_milvus
    init_milvus()
    _stage("Milvus initialised")

    # 3. MinIO
    from app.core.minio_client import init_minio
    init_minio()
    _stage("MinIO initialised")

    # 4. Elasticsearch
    from app.core.elasticsearch import init_elasticsearch, close_elasticsearch
    await init_elasticsearch()
    _stage("Elasticsearch initialised")

    # 5. DB 连接池预热 + Super admin
    import asyncio as _aio2
    from sqlalchemy import text as _text
    from app.core.database import async_session_factory, engine as _db_engine
    from app.services.user_service import UserService
    _stage("DB modules imported")

    # app.core.database 在此处才会导入并创建 engine，需再次压制 SQLAlchemy logger
    # 否则 create_async_engine 可能将 logger level 重置为 NOTSET，重新透传到 root(DEBUG)
    _suppress_noisy_loggers()

    # 并发预建 DB 连接，避免首批请求排队等待 pool 冷启动
    # pool_size=20，预热 10 条；超过峰值并发时其余请求从 max_overflow 借用
    _POOL_WARMUP = 10

    async def _warm_db_conn():
        async with _db_engine.connect() as _c:
            await _c.execute(_text("SELECT 1"))

    await _aio2.gather(*[_warm_db_conn() for _ in range(_POOL_WARMUP)])
    _stage(f"DB 连接池预热完成（{_POOL_WARMUP} 条）")

    async with async_session_factory() as session:
        svc = UserService(session)
        admin = await svc.ensure_super_admin(
            email=settings.SUPER_ADMIN_EMAIL,
            password=settings.SUPER_ADMIN_PASSWORD,
        )
        await session.commit()
        _stage(f"Super admin ready: {admin.email}")

    # 5.1 管理后台种子数据：SaaS 套餐目录（空表时）+ platform_settings 缺省键合并
    from app.admin.services.platform_settings_svc import merge_settings_defaults
    from app.admin.services.saas_seed import seed_saas_catalog_if_empty
    async with async_session_factory() as session:
        try:
            await seed_saas_catalog_if_empty(session)
            await merge_settings_defaults(session)
            await session.commit()
            _stage("Admin seed data ready")
        except Exception as e:
            await session.rollback()
            logger.warning("管理后台种子数据初始化失败: %s", e)

    # 6. Pre-load models (可选，受 MODEL_PRELOAD_ENABLED 控制)
    import asyncio as _aio
    if settings.MODEL_PRELOAD_ENABLED:
        from app.services.embedding_service import preload_model as _preload_emb
        from app.utils.text_splitter import _get_sat_model
        from app.services.clip_service import preload_clip as _preload_clip
        preload_tasks = [
            _aio.to_thread(_preload_emb),
            _aio.to_thread(_get_sat_model),
            _aio.to_thread(_preload_clip),
        ]
        preload_desc = "BGE-M3 + wtpsplit + CLIP"
        if settings.RERANKER_ENABLED:
            from app.services.reranker_service import preload_model as _preload_reranker
            preload_tasks.append(_aio.to_thread(_preload_reranker))
            preload_desc = "BGE-M3 + Reranker + wtpsplit + CLIP"
        logger.info("预加载模型中（%s 并发加载）...", preload_desc)
        await _aio.gather(*preload_tasks)
        _stage(f"{preload_desc} 预加载完成")
    else:
        _stage("模型懒加载已启用（MODEL_PRELOAD_ENABLED=false），首次请求时自动加载")

    # 7. Load Query Adapter if enabled
    # 注意：未启用时直接跳过 import，避免触发 query_adapter_service 模块加载（间接拉起 scipy 等重型依赖）
    if settings.QUERY_ADAPTER_ENABLED:
        from app.services.query_adapter_service import load_adapter as _load_adapter
        if _load_adapter():
            _stage("Query Adapter loaded successfully")
        else:
            _stage("Query Adapter not loaded (file not found)")
    else:
        _stage("Query Adapter 已禁用（QUERY_ADAPTER_ENABLED=false）")

    # 8. 自动内容生成调度器（APScheduler）
    from app.services.schedule_service import scheduler_service
    await scheduler_service.startup()
    _stage("Generation scheduler ready")

    logger.info(
        "All services ready. (启动总耗时 %.0fms)",
        (_time.perf_counter() - _t_start) * 1000,
    )

    yield

    # ---- Shutdown ----
    logger.info("Shutting down ...")
    scheduler_service.shutdown()
    close_milvus()
    await close_elasticsearch()
    await close_redis()

    from app.core.database import engine
    await engine.dispose()
    logger.info("Shutdown complete")


OPENAPI_TAGS = [
    {"name": "系统", "description": "健康检查、系统信息"},
    {"name": "认证", "description": "登录、登出、Token 刷新、个人信息"},
    {"name": "用户管理", "description": "用户 CRUD（管理员功能）"},
    {"name": "公司管理", "description": "公司信息 CRUD"},
    {"name": "品牌管理", "description": "品牌信息 CRUD"},
    {"name": "产品管理", "description": "产品信息 CRUD"},
    {"name": "客户管理", "description": "客户信息 CRUD"},
    {"name": "案例管理", "description": "案例信息 CRUD"},
    {"name": "文档管理", "description": "文档上传、处理管线、分块查看"},
    {"name": "异步任务", "description": "后台任务状态查询与管理"},
    {"name": "图片管理", "description": "图片上传、CLIP 向量化、语义搜索"},
    {"name": "视频管理", "description": "视频上传与管理"},
    {"name": "知识检索", "description": "混合检索（向量+全文+重排序）、图片语义检索"},
    {"name": "AI 对话", "description": "知识库 RAG 对话、SSE 流式、会话管理"},
    {"name": "内容生成", "description": "AI 生文章/生图/生视频、发布状态管理"},
]


def create_app() -> FastAPI:
    app = FastAPI(
        title="推量牛-全域AI流量经营平台",
        description="基于企业知识库的 AI 社交媒体内容生成与管理平台",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.APP_DEBUG else None,
        redoc_url="/redoc" if settings.APP_DEBUG else None,
        openapi_tags=OPENAPI_TAGS,
    )

    # Middleware (order matters: last added = outermost)
    from app.middleware.audit_log import AuditLogMiddleware
    from app.middleware.rate_limit import RateLimitMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(AuditLogMiddleware)
    app.add_middleware(RateLimitMiddleware, rate=60, window=60)

    # Exception handlers
    app.add_exception_handler(AppException, app_exception_handler)

    # Routes
    from app.api.v1.router import api_router
    app.include_router(api_router)

    return app


app = create_app()

# 所有模块导入完毕后再压制，防止被 SQLAlchemy engine 初始化覆盖
_suppress_noisy_loggers()
