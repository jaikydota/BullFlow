# 后端 AGENTS.md — 推量牛（bullflow）社媒矩阵系统

## 一、系统概述

本后端是一个基于 **FastAPI + SQLAlchemy 2.0 (async)** 构建的企业级 SaaS 平台，核心能力是 **基于企业知识库的 AI 内容生成与社交媒体管理**。系统采用 RAG（检索增强生成）架构，支持多租户隔离、多语言、多 LLM 供应商。

**运行端口**: 本地开发 8020 / 容器内 8021（见 `Dockerfile`）  
**API 前缀**: `/api/v1`

---

## 二、技术架构

### 2.1 技术栈

| 层级 | 技术 |
|------|------|
| Web 框架 | FastAPI (async) + Uvicorn |
| ORM | SQLAlchemy 2.0 (async) + asyncmy |
| 数据库迁移 | Alembic |
| 关系型数据库 | MySQL 8.0 |
| 向量数据库 | Milvus |
| 全文搜索 | Elasticsearch + IK 分词器 |
| 缓存/限流/黑名单 | Redis |
| 对象存储 | MinIO（启动时自动设置 public-read bucket policy） |
| 文本向量化 | BGE-M3 (FlagEmbedding) |
| 图片向量化 | OpenCLIP ViT-L-14/openai (open_clip) |
| 重排序 | BGE-Reranker-v2-m3 |
| 句子分割 | wtpsplit `sat-3l-sm`（CPU 运行） |
| 文档转 Markdown | Pandoc（系统安装）+ pypandoc |
| OCR | PaddleOCR PP-StructureV3 Serving（Docker 独立服务） |
| 音频转录 | WhisperX（外部服务，OpenAI-compatible API） |
| 视频处理 | FFmpeg / FFprobe（缩略图 + 元数据提取） |
| 繁简转换 | opencc-python-reimplemented |
| LLM 集成 | OpenAI SDK (Azure / 火山引擎 / 阿里云) |
| AI Agent | LangChain + LangGraph |
| 认证 | JWT (python-jose) + bcrypt |

### 2.2 分层架构

```
请求 → 中间件 (限流 → 审计 → CORS) → 路由层 (api/v1/) → 服务层 (services/) → 数据层 (models/ + 外部存储)
```

| 层 | 目录 | 职责 |
|----|------|------|
| 路由层 | `app/api/v1/` | 请求参数校验、权限检查、调用服务层、返回响应 |
| Schema 层 | `app/schemas/` | Pydantic 模型，定义 API 请求/响应数据结构 |
| 服务层 | `app/services/` | 核心业务逻辑，不直接处理 HTTP |
| 模型层 | `app/models/` | SQLAlchemy ORM 模型 |
| 核心层 | `app/core/` | 配置、数据库连接、认证、异常、文件校验 |
| Agent 层 | `app/agents/` | RAG 对话 Agent、文章生成 Agent、工具和工作流 |
| 中间件层 | `app/middleware/` | 审计日志、请求限流 |
| 工具层 | `app/utils/` | 文件解析、文本分块 |
| 管理后台 | `app/admin/` | 后台控制台 API（`/api/v1/admin/*`），自带 api/schemas/services/defaults |

---

## 三、目录结构

```
backend/
├── app/
│   ├── main.py                          # 应用入口 (create_app + lifespan)
│   ├── api/v1/                          # 路由层
│   │   ├── router.py                    # 总路由注册
│   │   ├── auth.py                      # 认证 (login/refresh/logout/me)
│   │   ├── users.py                     # 用户管理
│   │   ├── companies.py, brands.py, products.py, customers.py, cases.py
│   │   ├── documents.py                 # 文档管理 + 处理管线（audio transcript 已过滤）
│   │   ├── images.py                    # 图片管理（异步 CLIP，含 status 轮询）
│   │   ├── videos.py                    # 视频管理（异步 FFmpeg，含 status 轮询）
│   │   ├── audios.py                    # 音频管理（异步 Whisper 转录 + RAG 入库）
│   │   ├── tasks.py                     # 异步任务管理
│   │   ├── knowledge.py                 # 知识检索 (混合/向量/全文/图片)
│   │   ├── chat.py                      # AI 对话 (SSE 流式)
│   │   ├── generation.py                # 内容生成 (文章/图片/视频)
│   │   └── system.py                    # 健康检查
│   ├── admin/                           # 管理后台 API（/api/v1/admin/*，admin_frontend 调用）
│   │   ├── router.py                    # 后台总路由（prefix=/admin），挂到 api/v1/router.py
│   │   ├── dependencies.py              # 后台鉴权：get_current_admin_user / console / sales / finance / super_admin
│   │   ├── api/  schemas/  services/  defaults/   # 后台路由 / Schema / 业务逻辑 / 平台配置缺省值
│   │   └── phone.py                     # 手机号归一化（后台账号登录用）
│   ├── core/                            # 基础设施
│   │   ├── config.py                    # Pydantic Settings (读 .env)
│   │   ├── database.py                  # async SQLAlchemy engine + session
│   │   ├── redis.py, milvus.py, elasticsearch.py
│   │   ├── minio_client.py              # MinIO（启动时写入全桶 public-read policy）
│   │   ├── security.py                  # 密码哈希 + JWT
│   │   ├── dependencies.py              # FastAPI 依赖注入
│   │   ├── exceptions.py                # 统一异常体系
│   │   └── file_validators.py           # 上传文件扩展名白名单
│   ├── models/                          # SQLAlchemy ORM
│   │   ├── base.py                      # Base + BaseMixin (id, user_id, timestamps)
│   │   ├── document.py                  # 含 error_message, source_audio_id
│   │   ├── image.py                     # 含 status, error_message
│   │   ├── video.py                     # 含 status, error_message, cover_path, duration 等
│   │   ├── audio.py                     # 音频模型（transcript, segments, language, document_id）
│   │   └── ...其余业务模型
│   ├── services/                        # 业务逻辑
│   │   ├── document_pipeline.py         # 文档处理管线（解析→分块→向量化→入库）
│   │   ├── embedding_service.py         # BGE-M3 文本向量化
│   │   ├── clip_service.py              # OpenCLIP 图片向量化（含详细耗时日志）
│   │   ├── ocr_service.py               # PaddleOCR PP-StructureV3 封装
│   │   ├── whisper_service.py           # WhisperX 转录（中文专用模型 + 繁→简）
│   │   ├── audio_service.py             # 音频后台任务（转录→Document→RAG）
│   │   ├── video_service.py             # 视频后台任务（FFprobe 元数据 + FFmpeg 缩略图）
│   │   ├── minio_service.py             # MinIO 文件上传/下载/删除
│   │   ├── knowledge_service.py         # 混合检索
│   │   └── ...其余服务
│   └── utils/
│       ├── file_parser.py               # 多格式文件解析（见第四节）
│       └── text_splitter.py             # 语义分块（wtpsplit + DP）
├── alembic/versions/
│   ├── b9f0ed565fb1_init.py              # 初始建表
│   └── ...                              # 其余增量迁移（alembic revision --autogenerate 生成）
├── requirements.txt
├── .env / .env.example
└── Dockerfile                           # 含 pandoc apt 安装
```

---

## 四、核心工作流

### 4.1 请求处理流程

```
HTTP 请求
  → RateLimitMiddleware (60 req/min per IP；登录类端点、埋点上报走独立限流桶，健康检查/文档跳过)
  → AuditLogMiddleware (记录 POST/PUT/PATCH/DELETE)
  → CORSMiddleware
  → FastAPI 路由匹配
  → get_current_user 依赖 (JWT 解析 + Redis 黑名单检查 + 用户状态校验)
  → 路由处理函数
  → 服务层业务逻辑
  → 统一响应 {"code": 0, "message": "ok", "data": ...}
```

### 4.2 文档处理管线

> 核心思想：**所有文档统一转换为 Markdown，再执行分割和存储**。

#### 4.2.1 文件解析优先级链（`utils/file_parser.py`）

```
上传文件（任意格式）
  ↓
① PaddleOCR PP-StructureV3（OCR_ENABLED=true，仅 PDF / 图片格式）
      PDF：先用 PyMuPDF 读页数，若 ≤ PDF_MAX_OCR_PAGES(100)页 → 走 OCR
           超过 100 页 → 降级 PyMuPDF，记录 WARNING 日志
      图片(PNG/JPG)：直接 base64 发送（fileType=1）
      OCR 返回原生 Markdown，含布局结构
      ↓ 失败则 WARNING 日志 + 降级
② Pandoc GFM（PANDOC_ENABLED=true，支持 DOCX/HTML/EPUB/RTF/ODT 等）
      调用系统 pandoc 命令，输出 GitHub Flavored Markdown
      ↓ 失败则 WARNING 日志 + 降级
③ 原生解析器（无外部依赖）
      PDF   → PyMuPDF page.get_text("markdown")（输出结构化 Markdown）
      DOCX  → python-docx（段落 + 表格 → Markdown）
      XLSX/XLS → openpyxl（Sheet → Markdown 表格）
      CSV   → 直接读取
      MD/TXT → 直接读取
      PPTX  → python-pptx（文字 + 备注）
               + asyncio.gather 并发 PaddleOCR 识别每张嵌入图片（PPTX_IMAGE_OCR_ENABLED=true）
               图片格式用 magic bytes 检测（JPEG/PNG/BMP → fileType=1）
               忽略音频/视频形状
      ↓ 若所有路径均无文本
④ 二进制检测（magic bytes）→ 拒绝，标记 status=completed / chunk_count=0 / error_message="仅存储"
   文件保留在 MinIO + documents 表，不进 RAG 但可下载
```

#### 4.2.2 语义分块（`utils/text_splitter.py`）

```
Markdown 文本
  → wtpsplit SaT (sat-3l-sm, CPU)：句子级边界检测，输出 chunklet 序列
  → Markdown 标题感知：标题前鼓励断点（× 0.25 惩罚），标题后禁止立即断开
  → DP 最优合并：在 CHUNK_SIZE(2048) 约束下最小化跨块语义损失
  → 表格/代码块保护：整块作为独立 chunklet，不切断
  → 输出：chunk 列表（含标题路径 heading_path）
```

> 相比常见的固定滑动窗口，此策略在语义边界自然断开，标题结构完整保留在 heading_path 中。

#### 4.2.3 向量化与存储

```
chunks
  → BGE-M3 encode（asyncio.to_thread，batch_size=50）
  → 批量写入：
      MySQL  → document_chunks（text, heading_path, chunk_index）
      Milvus → text_embeddings（vector[1024], user_id, doc_id, chunk_id）
      ES     → knowledge_chunks（text, title, tags，IK 分词）
```

### 4.3 知识检索流程（RAG）

```
用户查询
  → BGE-M3 编码查询向量
  → 并行: Milvus 向量召回 (top_k×3) + ES 全文召回 (top_k×3)
      ES 使用 IK 分词：索引 ik_max_word / 搜索 ik_smart
      multi_match：content^1.0 + title^1.5 + tags^1.2（含 highlight）
  → 加权合并去重（向量 0.6 + 全文 0.4，可配置）
  → BGE-Reranker-v2-m3 重排序
  → 返回 top_k 结果（含高亮片段）
```

### 4.4 图片处理流程（异步）

```
上传图片
  → MinIO 存储（status="pending"）→ 立即返回前端
  → BackgroundTask: OpenCLIP ViT-L-14 encode
      → Milvus clip_embeddings 写入
      → 更新 status="completed" / "failed"
前端轮询 status，completed 后显示
```

### 4.5 视频处理流程（异步）

```
上传视频
  → MinIO 存储（status="pending"）→ 立即返回前端
  → BackgroundTask (video_service.process_video):
      ffprobe → 提取时长、分辨率、宽高
      ffmpeg  → 在 10% 处截帧，生成 JPEG 缩略图，上传 MinIO
      → 更新 cover_path + 元数据，status="completed" / "failed"
前端轮询 status，completed 后显示缩略图
```

### 4.6 音频处理流程（异步）

```
上传音频
  → MinIO 存储（status="pending"）→ 立即返回前端
  → BackgroundTask (audio_service.process_audio):
      whisper_service.transcribe():
          language="zh" → 中文专用模型（WHISPERX_MODEL_ZH）
          其他/None     → 通用模型（WHISPERX_MODEL_DEFAULT）
          检测到 zh/yue → opencc T2S 繁→简转换
      → 更新 Audio 记录（transcript, segments, language, duration）
      → 上传转录文本到 MinIO（.txt 文件）
      → 创建 Document 记录（source_audio_id 关联，不出现在文档列表）
      → 触发 document_pipeline.process_document（RAG 全流程入库）
      → status="completed" / "failed"
前端轮询 status，completed 后显示转录文本 + 播放器
音频删除时级联删除：MinIO 文件 + Milvus/ES chunks + Document 记录
```

### 4.7 AI 对话流程（SSE）

```
用户消息
  → 知识库检索 (hybrid_search)
  → 构建 System Prompt（模板 + 检索上下文）
  → LLM 流式调用 (chat_stream)
  → SSE 逐 token 推送: {type: "context"} → {type: "content"} × N → {type: "done"}
```

### 4.8 内容生成：图文混编 / 图片多图（`api/v1/generation.py`）

`GeneratedContent` 除 `content`/`file_path` 外有两个形态字段：
- **`media_urls`**（JSON 多图列表，存 MinIO 路径，响应经 `GeneratedContentResponse._transform_paths` 转完整 URL）：图文分离=全部图；图文混编=正文内嵌图。
- **`layout`**：`"mixed"`（图文混编文章）/ `"dynamic"`（图文分离图片动态）/ `NULL`（普通）。`type` 仍是 article/image。

**图文混编文章（`mixed=True`，异步）**：`generate_article` 端点建 pending 记录 → `_run_mixed_article_async`：
```
generate_article(mixed=True, image_count=N)  # N=random[MIXED_ARTICLE_IMAGE_MIN..MAX]
  → LLM 在正文输出 N 个占位符 [[IMG: 画面描述]]（article_agent 的 MIXED_IMAGE_INSTRUCTION）
  → 正则 _IMG_PLACEHOLDER_RE 解析 → 并发 gpt-image-2 生图（固定 Azure）→ upload_bytes
  → 按出现顺序把占位符替换为内嵌 markdown ![](完整URL)；失败的占位符删除
  → media_urls=[路径...], file_path=首图, metadata_agent（基于去图纯文本）
  → status=completed；计费 = 文章正文(纯文本) + 每张配图
```
内嵌图必须写**完整公开 URL**（`path_to_url`），因 `content` 不经响应转换、`MarkDown2`(markdown-it) 直渲。

**图片多图 / 发布动态（`count` 1–9 clamp `IMAGE_BATCH_MAX`，`as_dynamic`）**：`_run_image_generation_async` 用 `asyncio.gather(return_exceptions=True)` 并发 N 张（Azure 参考图字节预取一次），`media_urls=全部(>1时)`、`file_path=首图`，**按实际成功张数逐张计费**；`as_dynamic=True` 仅打 `layout="dynamic"`，发布文案复用同一次 `metadata_agent` 的 `description`（不重复调 LLM）。预校验 `est_credits × count`。

**Agent 工具**（`agents/graph/tools.py`）：`generate_article_content(mixed=...)`、`generate_image_content(count=, as_dynamic=)`。后台任务用 `_spawn_bg()`（模块级 `_BG_TASKS` 强引用，防裸 `create_task` 被 GC/随请求取消）。`chat.py` 把 `media_urls`/`layout` 回填进 `generation_results[].preview_info`。

> 发布对应（**严格单向，不可混用**）：图文混编(`layout=mixed`)→tlf `article`（html_content 含内嵌 `<img>`，仅发公众号/头条号文章/百家号/知乎/B站专栏等支持文章的平台）；图文分离(`layout=dynamic`)→tlf `dynamic`（`media_urls` 多图 + `description` 文案，发小红书/微博/抖音图文等）。前端 `allowedKindsForContentType(type, layout)` 按 layout 锁定可选发布类型（mixed→仅 article、dynamic→仅 dynamic），防止「混编当动态发」「动态当文章发」。两种异步任务的 `except` 都用**全新 session** 落 `failed`，避免主 session 事务损坏导致状态卡死。

---

## 五、多租户隔离

**所有业务表** 都通过 `BaseMixin` 包含 `user_id` 字段：

```python
class BaseMixin:
    id: str          # UUID v7
    user_id: str     # 租户隔离键
    created_at: datetime
    updated_at: datetime
```

- `BaseCRUDService` 的所有查询自动附加 `user_id` 过滤条件
- Milvus 向量搜索通过 `filter='user_id == "xxx"'` 实现隔离
- ES 全文搜索通过 `term: { user_id: "xxx" }` 实现隔离

---

## 六、认证与权限

- **JWT 双 Token**: access_token (2h) + refresh_token (7d)
- **Token 黑名单**: 登出时写入 Redis `token:blacklist:{token}`
- **三级角色**: `super_admin` > `admin` > `user`
- **权限检查**: `require_role("admin", "super_admin")` 依赖装饰器
- **管理后台 `/api/v1/admin/*`**：鉴权用 `app/admin/dependencies.py`（console = super_admin/admin/sales/finance，按接口再细分）；后台登录 token 有效期 `ADMIN_JWT_ACCESS_TOKEN_EXPIRE_MINUTES`（默认 2 天，无 refresh），与 C 端共用 `JWT_SECRET_KEY` / `users` 表。生产只经管理域名 admin-frontend 的 nginx 暴露，主站 frontend nginx 对该前缀返回 404

---

## 七、统一响应格式

```json
// 成功
{"code": 0, "message": "ok", "data": {...}}

// 分页
{"code": 0, "message": "ok", "data": {"items": [...], "total": 100, "page": 1, "page_size": 20, "pages": 5}}

// 错误
{"code": 40100, "message": "认证失败", "data": null}
```

错误码: `40xxx` 客户端错误, `50xxx` 服务端错误。

---

## 八、关键配置项（`core/config.py` + `.env`）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `OCR_ENABLED` | `true` | 是否启用 PaddleOCR |
| `OCR_SERVICE_URL` | `http://localhost:8866` | PaddleOCR Serving 地址 |
| `PDF_MAX_OCR_PAGES` | `100` | 超过此页数的 PDF 跳过 OCR，降级 PyMuPDF |
| `PANDOC_ENABLED` | `true` | 是否启用 Pandoc 转 Markdown |
| `PPTX_IMAGE_OCR_ENABLED` | `true` | PPTX 内嵌图片是否 OCR |
| `MODEL_PRELOAD_ENABLED` | `false` | `false`=懒加载；`true`=启动时并发预加载 BGE-M3 + wtpsplit + CLIP |
| `SENTENCE_MODEL` | `sat-3l-sm` | wtpsplit 句子分割模型 |
| `CHUNK_SIZE` | `2048` | 最大分块字符数 |
| `TABLE_CHUNK_SIZE` | `4096` | 表格分块最大字符数 |
| `WHISPERX_URL` | `""` | WhisperX API 地址 |
| `WHISPERX_MODEL_ZH` | `flateon/Belle-whisper-large-v3-turbo-zh-ct2` | 中文专用 Whisper 模型 |
| `WHISPERX_MODEL_DEFAULT` | `deepdml/faster-whisper-large-v3-turbo-ct2` | 通用 Whisper 模型 |
| `WHISPERX_ZH_IS_TRADITIONAL` | `true` | 中文模型输出繁体，自动转简体 |
| `HYBRID_VECTOR_WEIGHT` | `0.6` | 混合检索向量权重 |
| `HYBRID_FULLTEXT_WEIGHT` | `0.4` | 混合检索全文权重 |

---

## 九、AI 编码注意事项

### ⚠️ 语言规范（最高优先级）

- **默认语言为简体中文（zh-CN）**，本系统面向中文客户群体
- 后端返回的提示信息、错误消息等 **默认使用中文**
- 如果编码时偶尔遗漏多语言，**默认使用中文**，不要默认英文

### 9.1 代码规范

- **异步优先**: 所有数据库操作、外部 API 调用必须使用 `async/await`
- **类型注解**: 所有函数必须有完整的类型注解
- **导入规范**: 使用 `from __future__ import annotations` 延迟求值
- **多租户**: 新增任何业务表必须继承 `BaseMixin`，包含 `user_id` 字段；所有查询必须过滤 `user_id`
- **错误处理**: 使用 `app.core.exceptions` 中的异常类，不要直接返回 HTTP 错误
- **日志**: 使用 `logging.getLogger(__name__)` 标准日志
- **ML 推理**: 所有模型推理必须放入 `asyncio.to_thread()` 避免阻塞事件循环
- **异步序列化**: `db.flush()` 后必须 `await db.refresh(obj)` 再做 Pydantic `model_validate`，否则触发 `MissingGreenlet` 错误

### 9.1.1 ⚠️ SQLAlchemy flush vs commit — 高频犯错点

> **`flush()` ≠ `commit()`**，混淆二者是后台任务、多 session 协作场景的最常见 bug。

| 操作 | 作用范围 | 其他 session 可见 |
|------|---------|-----------------|
| `await db.flush()` | 仅写入当前事务缓冲（发送 SQL 到 DB，但未提交） | ❌ 不可见 |
| `await db.commit()` | 提交事务，数据持久化 | ✅ 可见 |

**⚠️ 必须 `commit()` 的场景：**

1. **注册 `BackgroundTask` 之前**：background task 使用独立 session，`flush` 的数据对它不可见，会导致查不到记录直接退出。
   ```python
   db.add(record)
   await db.flush()
   await db.commit()  # ← 必须，否则 background task 查不到这条记录
   background_tasks.add_task(some_async_func, record_id=record.id)
   ```

2. **更新状态供其他 session/前端轮询读取时**：例如将任务状态改为 `generating`，若只 `flush` 不 `commit`，前端轮询到的始终是旧状态。
   ```python
   record.status = "generating"
   await db.flush()
   await db.commit()  # ← 必须，否则前端轮询看不到状态变化
   ```

3. **中间步骤需要持久化以便失败恢复时**：长流程中间状态应及时 commit，避免异常后全部回滚。

4. **🔴 任何"写库后返回响应"的 mutation 端点（POST/PUT/PATCH/DELETE）——返回前必须显式 `commit()`。** 这是删除/编辑"偶发不生效、F5 后正常"类 bug 的根因，最容易漏：

   - `get_db()` 依赖确实会在 `yield` 之后 `commit()`，但 **FastAPI 的 yield 依赖收尾是在"HTTP 响应已经发回浏览器之后"才执行的**。
   - 于是出现竞态：handler 只 `flush()` 就返回 → 浏览器收到响应 → **立刻**发起列表/详情刷新 GET → 这个 GET 走连接池里**另一条连接**，此时上一个请求的收尾 `commit()` 还没跑完 → 读到**未提交的旧数据**（被删的还在 / 改的没变）。随后收尾 commit 完成，所以手动 F5 再查就正常了——数据没丢，只是"响应早于提交落库"。
   - **绝不能依赖 `get_db` 收尾兜底提交来保证读写一致**，它只能保证"最终会提交"，保证不了"返回前已提交"。

   ```python
   # ❌ 错误：只 flush 就返回，靠 get_db 收尾 commit（响应发出后才提交 → 前端紧接的刷新读到旧数据）
   await db.delete(obj)
   await db.flush()
   return success(message="已删除")

   # ✅ 正确：返回前显式 commit
   await db.delete(obj)
   await db.commit()
   return success(message="已删除")
   ```

   - **service 只负责 `flush`、由 API handler 统一 `commit`** 是本项目约定（见 `add_message` / `chat_service`）；但这意味着**调用这类 service 的 handler 必须自己补 `commit()` 再返回**，否则同样踩坑。`BaseCRUDService.create/update/delete` 已内置 `commit`，走它的资产页（产品/客户/公司/案例/品牌）天然安全。
   - `expire_on_commit=False`（见 `core/database.py`）已全局设置，所以 **`commit()` 后对象不会失效，可继续 `refresh` / `model_validate`**，放心在返回前提交。
   - 自查：写完一个 mutation 端点，问自己"前端拿到这个响应后会不会马上重新拉数据？"——只要会，返回前就必须有显式 `commit()`。

**✅ 只需 `flush()` 的场景（同一 session 内后续操作需要 ID 时）：**
```python
db.add(obj)
await db.flush()          # 生成自增 ID
await db.refresh(obj)     # 读取 DB 生成的字段
# 同一 session 内继续操作，最后统一 commit
await db.commit()
```

### 9.1.2 ⚠️ BackgroundTasks 使用规范

- **必须传 `async def` 函数**：`BackgroundTasks.add_task()` 原生支持 `async def`，FastAPI 会在主事件循环中调度它
- **严禁在 BackgroundTask 里用 `asyncio.run()`**：会创建新事件循环，与 SQLAlchemy 连接池的事件循环冲突，抛出 `RuntimeError: Future attached to a different loop`
- **Background task 内必须用 `async_session_factory()` 创建独立 session**，不能复用请求的 `db` session（请求结束后 session 已关闭）

```python
# ✅ 正确写法
async def _run_task_async(record_id: str, ...) -> None:
    async with async_session_factory() as db:
        # 独立 session，安全
        ...

background_tasks.add_task(_run_task_async, record_id=record.id)

# ❌ 错误：传 sync wrapper + asyncio.run()
def _run_task_sync(...):
    asyncio.run(_run_task_async(...))  # 事件循环冲突！

background_tasks.add_task(_run_task_sync, ...)
```

### 9.1.3 ⚠️ 外部 HTTP API 日志规范

调用第三方 API（火山引擎、腾讯云等）时，**必须打印请求 URL、请求参数、HTTP 状态码**；**响应 body 截取前 500 字符**（避免控制台刷屏），末尾可标注总长度，便于需要时开 DEBUG 或对端抓包对照。

```python
HTTP_RESP_LOG_MAX = 500

def _resp_preview(text: str, max_len: int = HTTP_RESP_LOG_MAX) -> str:
    if len(text) <= max_len:
        return text
    return f"{text[:max_len]}... (total {len(text)} chars)"

logger.info("[Provider] POST %s | request_params=%s", url, json.dumps(payload, ensure_ascii=False, default=str))

resp = await client.post(url, ...)
logger.info(
    "[Provider] HTTP %s | response_body: %s",
    resp.status_code, _resp_preview(resp.text),
)
resp.raise_for_status()
```

- 请求日志：**请求 URL**、**完整请求参数**（JSON 序列化，敏感字段若需脱敏另行处理）
- 响应日志：HTTP 状态码、**响应 body 截断 500 字符**（`resp.text` → `_resp_preview`）
- 轮询日志：每次轮询打印 URL（或 task id）、elapsed、当前 status、**截断后的响应 body**
- 错误日志：`logger.error()`，错误说明 + **截断后的响应 body**

### 9.1.4 ⚠️ 时间统一 UTC 规范（高频犯错点）

> **全系统时间戳一律 UTC。** 容器 TZ 为 Asia/Shanghai，若代码侧写 UTC 而 DB `func.now()` 按本地时区产北京时间，两者混存会差 8 小时，前端再叠加时区换算会出现"有的快 8h、有的慢 8h"。统一规范如下，**新代码必须遵守**。

**三条铁律：**

1. **写入一律 UTC**——写库时间统一用 `from app.core.time import utcnow`，返回 naive UTC：
   ```python
   from app.core.time import utcnow
   obj.paid_at = utcnow()          # ✅
   # ❌ 禁止：datetime.utcnow()（已弃用）/ datetime.now()（取容器本地=北京，会错 8h）
   ```
   DB 连接已在 `core/database.py` 用 connect 事件统一 `SET time_zone='+00:00'`，所以 `func.now()`（`BaseMixin.created_at/updated_at` 的 server_default）也产 UTC，与代码侧一致。**新模型时间列继续用 `DateTime` + `server_default=func.now()` 即可**（勿用 TIMESTAMP，会被会话 tz 重解释）。

2. **序列化一律带 `+00:00`**——返回前端的 naive datetime 必须补 UTC 时区标记，否则前端 `new Date()` 按本地解析又错 8h：
   - **Pydantic 响应模型**：继承 `app.core.time.UtcModel`（通配序列化所有 datetime 字段；含 `from_attributes=True`）。单字段也可标 `UtcDateTime`。
     ```python
     from app.core.time import UtcModel
     class XxxResponse(UtcModel):   # ✅ 不要直接 (BaseModel)
         created_at: datetime
     ```
   - **裸 dict 接口**（非 Pydantic）：用 `to_utc_iso(dt)`，**禁止裸 `dt.isoformat()`**（丢时区）。
     ```python
     from app.core.time import to_utc_iso
     return success(data={"created_at": to_utc_iso(row.created_at)})
     ```

3. **前端**：把带时区的 ISO 串转浏览器本地显示（现状 date-fns `parseISO` / `new Date()` 已正确，无需改）。

**允许的例外（不要"纠正"它们）：**
- JWT `exp`、第三方签名（如腾讯 TC3 用 `fromtimestamp(ts, timezone.utc)`）本就用 UTC/epoch。
- `time.time()`（epoch，tz 无关）用于队列/缓存/计时。
- MinIO 路径前缀 `datetime.now().strftime("%Y-%m")`、短信流水号等**字符串**，非 DB 时间戳，无所谓时区。
- 按"业务自然日"聚合的 **DATE** 键（如 `TlfAccountMetric.snapshot_date`）用 `date.today()`（北京日），是有意为之——"一天"按用户所在地算，不是 bug。

**自查清单（写时间相关代码后过一遍）：**
- 写库时间是否用了 `utcnow()`？（grep 全仓 `datetime.utcnow(` / `datetime.now(` 应无新增 DB 写入点）
- 新响应模型是否继承了 `UtcModel`？裸 dict 是否用了 `to_utc_iso()`？
- 有没有出现裸 `.isoformat()`（除 `core/time.py` 内部）？

### 9.2 文件解析注意事项

- **解析降级链**: OCR → Pandoc → 原生解析器 → 二进制检测，每一级失败时记录 `WARNING` 日志
- **无文本文件**: 设置 `status=completed`、`chunk_count=0`、`error_message="仅存储"`，文件保留在 MinIO 可下载
- **PaddleOCR API**: `POST /layout-parsing`，JSON 体 `{"file": "<base64>", "fileType": 0}` (PDF) 或 `{"file": "<base64>", "fileType": 1}` (图片)，返回含 `markdown` 字段
- **PPTX**: 不走 Pandoc（Pandoc 对含媒体 PPTX 失败率高），用 python-pptx 提取文字 + asyncio.gather 并发 OCR 图片
- **PyMuPDF**: 使用 `page.get_text("markdown")` 获取结构化 Markdown，不支持图片内文字识别

### 9.3 新增 API 检查清单

1. 在 `app/models/` 创建 SQLAlchemy 模型（继承 `Base, BaseMixin`）
2. 在 `app/models/__init__.py` 导入新模型（Alembic 需要发现）
3. 在 `app/schemas/` 创建 Pydantic 请求/响应模型
4. 在 `app/services/` 创建服务类（可继承 `BaseCRUDService`）
5. 在 `app/api/v1/` 创建路由模块
6. 在 `app/api/v1/router.py` 注册路由
7. 添加权限检查 (`get_current_user`, `require_role`)
8. 确保响应使用 `success()` / `error()` 包装

### 9.4 数据库变更

- 模型变更后运行 `alembic revision --autogenerate -m "描述"`
- 应用迁移: `alembic upgrade head`
- **不要直接修改数据库 schema**，始终通过 Alembic

### 9.5 外部服务集成

| 服务 | 入口文件 | 说明 |
|------|----------|------|
| LLM | `services/llm_service.py` | 多供应商统一接口 |
| 文本向量化 | `services/embedding_service.py` | BGE-M3，支持懒加载/预加载 |
| 图片向量化 | `services/clip_service.py` | OpenCLIP，懒加载 |
| OCR | `services/ocr_service.py` | PaddleOCR PP-StructureV3 |
| 音频转录 | `services/whisper_service.py` | WhisperX，含繁→简 |
| 视频处理 | `services/video_service.py` | FFmpeg/FFprobe |
| 文件存储 | `services/minio_service.py` | MinIO |
| 生图/生视频 | `services/doubao_client.py` / `tencent_vod_client.py` | 第三方 API |

### 9.6 性能注意

- 数据库查询使用 `select()` 而非 `.query()`（SQLAlchemy 2.0 风格）
- 批量操作注意分批（Milvus 插入 batch_size=50）
- ML 模型推理放到 `asyncio.to_thread()` 避免阻塞事件循环
- PPTX 多图片 OCR 使用 `asyncio.gather()` 并发，避免串行等待
- `MODEL_PRELOAD_ENABLED=true` 时 BGE-M3 + wtpsplit **并发**加载，节省启动时间

### 9.7 日志规范

- transformers 库的 `Accessing \`yv\`` FutureWarning 已在 `main.py` 通过 `warnings.filterwarnings` 过滤
- wtpsplit 加载时的 tqdm 进度条已用 `redirect_stderr` 抑制，仅保留"开始加载 / 加载完成"两行日志
- PaddleOCR / Whisper 等外部调用均有"开始 / 完成 / 错误"三类日志，包含耗时

### 9.8 环境配置

- 所有配置通过 `.env` 文件管理，由 `app.core.config.Settings` 读取
- 新增配置项必须在 `Settings` 类中声明，并在 `.env.example` 中添加注释
- **绝不硬编码** API 密钥、数据库密码等敏感信息

### 9.9 关键文件速查

| 需求 | 文件 |
|------|------|
| 添加新 API | `api/v1/router.py` → 新路由模块 |
| 修改数据库模型 | `models/` → `models/__init__.py` → Alembic |
| 修改认证逻辑 | `core/dependencies.py` + `core/security.py` |
| 修改 LLM 调用 | `services/llm_service.py` |
| 修改检索策略 | `services/knowledge_service.py` |
| 修改文档解析 | `utils/file_parser.py` |
| 修改分块策略 | `utils/text_splitter.py` |
| 修改 OCR 调用 | `services/ocr_service.py` |
| 修改音频转录 | `services/whisper_service.py` |
| 修改视频处理 | `services/video_service.py` |
| 修改限流规则 | `middleware/rate_limit.py` |
| 全局配置 | `core/config.py` + `.env` |

---

## 十、外部服务依赖

| 服务 | 默认地址 | 启动方式 | 备注 |
|------|----------|----------|------|
| MySQL | `localhost:3306` | docker compose | 主数据库 |
| Redis | `localhost:6379` | docker compose | 缓存/限流/JWT 黑名单 |
| Milvus | `localhost:19530` | docker compose | 向量数据库 |
| Elasticsearch | `localhost:9200` | docker compose | 全文检索 |
| MinIO | `localhost:9000` | docker compose | 对象存储（启动自动设置 public-read） |
| PaddleOCR | `localhost:8866` | `docker-compose.paddleocr.yml` | PP-StructureV3 Serving |
| WhisperX | 外部服务地址 | 独立部署 | OpenAI-compatible API |

---

## 十一、启动命令

```bash
cd backend
source venv/bin/activate
cp .env.example .env  # 编辑填入实际配置
alembic upgrade head   # 初始化/迁移数据库
uvicorn app.main:app --host 0.0.0.0 --port 8020 --reload
```

Docker 启动（含所有依赖）:
```bash
cd ..  # 项目根目录
docker compose up -d
# 独立启动 PaddleOCR（GPU）
docker compose -f docker-compose.paddleocr.yml up -d
```
