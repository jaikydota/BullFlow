# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作的指南。

> ⚠️ **修改任一端代码前，必须先读对应的 `AGENTS.md`**（`backend/AGENTS.md` / `frontend/AGENTS.md`）。本文件是入口摘要，详细规范以二级文档为准。

---

## 一、项目概述

**推量牛（bullflow）社媒矩阵营销平台** — 基于 RAG 的企业级 SaaS，提供知识库管理、AI 对话、内容生成（文章/图片/视频/音频）、多平台分发。

- **架构**：前后端分离 —— `backend/`（FastAPI + SQLAlchemy 2.0 async）+ `frontend/`（React 19 + Vite + TS）
- **推量发网关**：`tlf_backend/` + `tlf_frontend/`（独立服务，对接上游发布平台，提供 SDK + Webhook，详见 `tlf_backend/README.md`）
- **管理后台**：`admin_frontend/` 调用的后台 API 已并入 `backend/app/admin/`（`/api/v1/admin/*`）；生产 admin-frontend nginx 只反代 `/api/v1/admin/` → backend:8021
- **多租户**：所有业务表通过 `BaseMixin` 携带 `user_id`，**所有 MySQL 查询 / Milvus 向量检索 / ES 全文检索都必须按 `user_id` 隔离**
- **默认语言**：简体中文（zh-CN）。新增用户可见文本必须同时在 `public/locales/zh-CN/` 和 `en/` 添加翻译键；遗漏时**默认中文**而非英文
- **API 前缀**：`/api/v1`；统一响应 `{code, message, data}`，`40xxx` 客户端错误 / `50xxx` 服务端错误
- **前端视觉**：**浅色精致（白底）+ shadcn/ui new-york 风格 + Radix UI**，支持双主题切换（默认浅色 / 可选深色）

---

## 二、必读的二级文档

| 文档 | 内容要点 |
|------|---------|
| `backend/AGENTS.md` | 后端架构、文件解析降级链、RAG 流程、**`flush vs commit` 陷阱**、`BackgroundTasks` 规范、第三方 HTTP 日志规范、AI 编码检查清单 |
| `frontend/AGENTS.md` | 浅色 + shadcn new-york 设计系统、OKLCH token、4 模块菜单结构、`MediaPreview` / `DocumentPreview` 复用规范、主题切换、ui/* + shared/* + common/* 三层组件体系、`cursor-pointer` 提醒 |
| `admin_frontend/AGENTS.md` | 后台管理系统（**Vite + React 19 + shadcn/ui Radix 标准**）：6 分组 / 23 菜单项 Sidebar（25 条路由）、`components/admin/*` 13 个提效组件（DataTable / ProForm / DetailDrawer / NumberInput / ChartCard…）、与主站同源 token / shadcn / shared 模板可直接 cp 同步 |

---

## 三、常用命令

### 后端（本地 8020，容器内 8021）

```bash
cd backend
source venv/bin/activate
alembic upgrade head                              # 应用数据库迁移
alembic revision --autogenerate -m "描述"         # 模型变更后生成迁移（不要手改 schema）
uvicorn app.main:app --host 0.0.0.0 --port 8020 --reload --reload-dir app
# 快捷脚本（带 HF_HUB_OFFLINE=1）：bash bstart.sh
```

### 前端（开发 5288，dev proxy `/api` → `http://localhost:8020`）

> ⚠️ **WSL 开发提示**：若在 WSL 中开发且代码位于 Windows 磁盘，`npm install` / 新增依赖**必须在 WSL 内执行**——在 Windows 侧安装会把 `node_modules` 的平台特定二进制（esbuild / rollup / @swc 等）重装成 Windows 版，导致 WSL 启动报二进制不兼容错。但 `tsc -b` / `npm run build` / `npm run lint` 等**只读 / 编译命令在 Windows 跑没问题**（不重装依赖），可正常用于验证类型检查。

```bash
cd frontend
npm install
npm run dev          # 开发
npm run build        # tsc -b && vite build
npm run lint         # eslint
# 快捷脚本：bash fstart.sh
```

### Docker（生产部署，前端 8020 反代后端 8021）

```bash
docker compose up -d                                            # 应用主栈
docker compose -f docker-compose.milvus.yml up -d               # Milvus + MinIO 等基础设施
docker compose -f paddleocr/docker-compose.paddleocr.yml up -d  # PaddleOCR PP-StructureV3 (GPU)
```

---

## 四、高层架构

```
浏览器 → frontend (React 19 + Vite, :5288/:8020)
         └─ Axios → /api/v1/* → backend (FastAPI, :8020/:8021)
                                  ├─ MySQL          (业务数据)
                                  ├─ Milvus         (text/image 向量)
                                  ├─ Elasticsearch  (IK 全文检索)
                                  ├─ Redis          (缓存 / JWT 黑名单 / 验证码限流)
                                  ├─ MinIO          (对象存储, 启动自动 public-read)
                                  ├─ PaddleOCR      (PP-StructureV3, 独立 Docker, :8866)
                                  └─ WhisperX       (外部 OpenAI-compatible API)
```

**请求流**：`RateLimit(60/min/IP) → AuditLog → CORS → JWT 解析 + Redis 黑名单 + 用户状态 → 路由 → service → models/外部存储`。

### 三大核心管线

**1. RAG 文档管线**（`utils/file_parser.py` + `services/document_pipeline.py`）

```
上传 → 解析降级链 → 语义分块 → 向量化 → 三库同步
       ① PaddleOCR (PDF≤100 页 / 图片)
       ② Pandoc GFM (DOCX/HTML/EPUB/RTF/ODT…)
       ③ 原生 (PyMuPDF/python-docx/openpyxl/python-pptx)
       ④ 二进制拒绝 → status=completed, chunk_count=0, error_message="仅存储"

分块：wtpsplit SaT (sat-3l-sm, CPU) + 标题感知 + DP 最优合并 (CHUNK_SIZE=2048)，表格/代码块整块保护
向量化：BGE-M3 (asyncio.to_thread, batch_size=50)
入库：MySQL document_chunks + Milvus text_embeddings[1024] + ES knowledge_chunks (IK 分词)
```

**2. 异步媒体管线**（image / video / audio）

```
上传 → MinIO + status="pending" → 立即返回 → BackgroundTask 处理 → status="completed/failed"
       image: OpenCLIP ViT-L-14 → Milvus clip_embeddings
       video: FFprobe 元数据 + FFmpeg 10% 处截帧封面
       audio: WhisperX 转录 (zh 走中文专用模型 + opencc 繁→简) → 生成 Document → 跑 RAG 全流程
前端轮询 status
```

**3. AI 对话**（SSE 流式）

```
hybrid_search (Milvus 向量 ∥ ES 全文并行召回 → 默认 RRF 融合，可切 weighted 0.6/0.4)
  → BGE-Reranker-v2-m3 重排（可选，默认关闭 RERANKER_ENABLED=false）
  → LLM 流式
  → SSE 推送 {type: context|content|done}
```

---

## 五、关键代码约定（容易踩坑）

### 后端

- **`flush()` ≠ `commit()`** — 注册 `BackgroundTask` 之前、更新供前端轮询的状态时**必须 `commit()`**，否则其他 session / 事件循环看不到。详见 `backend/AGENTS.md` §9.1.1
- **🔴 任何 mutation 端点（POST/PUT/PATCH/DELETE）返回前必须显式 `commit()`** — `get_db` 的收尾 commit 在"响应已发回浏览器之后"才执行，只 `flush` 就返回会让前端紧接着的刷新 GET 走另一条连接读到旧数据（典型症状：删除/编辑"偶发不生效、F5 后正常"）。service 只 flush 时，调用它的 handler 必须自己补 commit；`BaseCRUDService` 已内置 commit。详见 `backend/AGENTS.md` §9.1.1 场景 4
- **🔴 时间统一 UTC** — 全系统时间戳一律存 UTC：写库时间用 `from app.core.time import utcnow`（**禁止** `datetime.utcnow()` / `datetime.now()`）；DB 连接已设会话 `time_zone='+00:00'`，故 `func.now()`（created_at/updated_at 默认值）也产 UTC。返回前端的时间必须带 `+00:00`：响应模型继承 `app.core.time.UtcModel`（或字段标 `UtcDateTime`），裸 dict 接口用 `to_utc_iso()`，**禁止裸 `.isoformat()`**。容器 TZ 虽是 Asia/Shanghai，但靠会话 tz + 代码 UTC 与墙上时间解耦。例外：JWT exp、第三方签名（腾讯 TC3）本就用 UTC；按"业务自然日"聚合的 DATE 键（如 `snapshot_date`）可用 `date.today()`（北京日）。详见 `backend/AGENTS.md` §9.1.4
- **`BackgroundTasks` 必须传 `async def`**，且内部用 `async_session_factory()` 新建独立 session；**严禁 `asyncio.run()`**（会与 SQLAlchemy 连接池事件循环冲突）
- **ML 推理统一 `asyncio.to_thread()`**，避免阻塞事件循环
- **`db.flush()` 后必须 `await db.refresh(obj)` 再 `model_validate`**，否则触发 `MissingGreenlet` 错误
- **第三方 HTTP API 调用必须打印**：请求 URL + 完整请求参数 + HTTP 状态码 + 响应 body 截断 500 字符（`_resp_preview` 工具，见 §9.1.3）
- 新增 ORM 模型务必在 `app/models/__init__.py` 导入，否则 Alembic 发现不到
- 新增配置项必须在 `core/config.Settings` 声明并在 `.env.example` 加注释；**绝不硬编码**密钥
- 多租户：新业务表必继承 `BaseMixin`，所有查询附加 `user_id` 过滤；Milvus `filter='user_id == "xxx"'`、ES `term: { user_id: "xxx" }`
- 数据库 schema 变更走 Alembic，**不要手改**
- **内容生成「图 + 文」两形态**：`GeneratedContent.layout` = `mixed`（图文混编文章，正文内嵌 `![](url)` 配图）/ `dynamic`（图文分离图片动态，多图 + 文案）；多图存 `media_urls`（MinIO 路径，响应转完整 URL）。图文混编文章 `mixed=True` 走异步（占位符 `[[IMG:]]` → 并发 gpt-image-2），图片 `count` 多图并发；**计费按实际张数逐张扣**；Agent 工具 `generate_article_content(mixed)`/`generate_image_content(count,as_dynamic)`，后台任务用 `_spawn_bg()` 强引用。详见 `backend/AGENTS.md §4.8`

### 前端

- **路径别名**：始终 `@/`（如 `@/components/ui/button`、`@/lib/utils`），禁止相对路径
- **`cn()` 工具**：`@/lib/utils` 导出（clsx + tailwind-merge），合并 Tailwind class
- **优先使用 shadcn ui**：简单组件从 `@/components/ui/*` 引；业务模板从 `@/components/shared/*`；MediaPreview / DocumentPreview / DataTable 等复杂自研组件从 `@/components/common/*`
- **`<button>` 仍需手动加 `cursor-pointer`**（Tailwind CSS 4 重置浏览器默认手型；shadcn `Button` / `DropdownMenuItem` 等已内置）
- **必用 OKLCH token**：`bg-card` / `bg-background` / `bg-muted` / `text-foreground` / `text-muted-foreground` / `text-primary` / `border-border` / `ring-ring`；**禁止硬编码** `#FFFFFF` / `#000000` / `#7C3AED` 等色值
- **hover 强调态**（紫色统一）：
  - **Sidebar 一二级菜单 / Header 右上 / icon button**：统一用 `.menu-hover` utility（在 `src/index.css` 定义）。效果 = 紫色淡底（primary @ 10%）+ 紫色 inset 描边 + 紫色双层外晕 + `translateY(-1px)` + spring 缓动 380ms + `:active` 100ms 回弹。**不要**再用 `hover:bg-accent` / `hover:bg-foreground/[0.08]` 这些旧灰色 hover
  - **列表网格卡 / item 卡**：统一用 `.card-hover` utility（同样在 index.css）。效果 = `translateY(-3px)` + 紫色 border tint + 紫色光晕双层 box-shadow + 280ms spring。已应用：内容库 / 文档 / 图片 / 视频 / 音频 / 产品 / 客户 / 案例 / 自动生成 / 发布内容
  - **framer-motion + card-hover 协作**：`animate={{y:0}}` 完成后会留 inline transform 覆盖 CSS hover translateY。两种解法：(A) 外层 motion 管进出动画，内层 div 应用 card-hover；(B) `whileHover={{ y: -3 }}` 让 motion 接管 transform，CSS card-hover 接管 shadow / border。详见 `frontend/AGENTS.md §15.3`
  - 其余通用 hover（卡片内的小元素 / DropdownMenuItem 等）仍可用 `hover:bg-accent` 旧写法，但**禁止** `hover:bg-accent/30` / `hover:bg-accent/50` 等降低不透明度的写法（看不清）
- **主题切换**：`<ThemeProvider defaultTheme="light">` 已在 `App.tsx` 包裹；`useTheme()` 读取 / 设置；`document.documentElement.classList` 自动 toggle `.dark`
- **菜单结构 4 模块**：首页 (`/dashboard` + `/chat`) / 资产管理 (`/knowledge/*` + `/documents` + `/media/*`) / 创作分发 (`/generation/*` + `/tlf/*` 国内发布) / 数据分析 (`/review/*`)，业务路径**沿用旧命名**避免破坏书签。注：海外平台（LinkedIn / Facebook / Instagram / Reddit / YouTube / X 等）同样经推量发网关（Composio 上游）在 `/tlf/*` 下分发
- **内容类型语义色跨模块统一**：📝 文章 `--content-article` (**blue** Word 深蓝) · 🖼️ 图片 `--content-image` (emerald) · 🎬 视频 `--content-video` (rose) · 🎵 音频 `--content-audio` (sky)，**不可换色**。注：amber 黄仍保留作为系统级 `warning` 状态色（Badge.warning / IconBox.warning / .status-warning），与文章内容类型色已解耦
- **文件类型图标统一从 `src/utils/fileTypes.ts` 的 `FILE_TYPE_MAP` 取**，禁止页面内重复定义
- **媒体/文档预览统一用 `MediaPreview` / `DocumentPreview` / `DocumentPreviewModal`**，禁止再写 lightbox；传 `fileType` 比依赖 `fileName` 扩展名更可靠
- **禁止动态拼接 Tailwind 颜色类**（`bg-${color}/10` 无法静态分析）
- **禁止白色硬编码卡片** `bg-white shadow-*`，改用 `bg-card rounded-xl border` 或 `<Card>`
- **z-index 约定**：通用 Portal (Dropdown/Tooltip/Dialog/Sheet) `z-50`；AlertDialog `z-[60]`；DocumentPreviewModal backdrop `z-[9998]`；MediaPreview `z-[9999]`
- **弹层一律用 shadcn 包装**：`Dialog` / `Sheet` / `Drawer` / `AlertDialog` / `Popover` / `DropdownMenu`，禁止裸条件渲染 + Portal + Framer Motion 自造
- 字体栈固定 Inter + JetBrains Mono，**不引入新字族**
- API 调用必须通过 `src/api/` 模块，禁止组件内直接 `axios`；长轮询用 `useTaskPolling`，SSE 用 `useSSE`，分页用 `usePagination`
- **历史兼容**：`@/components/common/{Button,Input,Modal,Drawer,Select,Badge,…}` 已重写为 shim，内部转发到 `@/components/ui/*`；旧代码无需改 import。`bg-bg-deep` / `text-text-primary` / `glass-card` / `text-neon-cyan` 等旧 token 也已通过 `@theme inline` 别名映射到浅色 token。**新代码请直接用 shadcn 语义化 token**，不要再写 `neon-*` / `glass-*` / `bg-bg-*`

### 5.1 设计系统（玻璃 / 渐变 / 阴影分层）

- **共享模板（9 个）**：新页面**必须**用 `@/components/shared` 的模板，禁止硬编码 toolbar / Hero / 图标盒：
  - `PageContainer` — 统一最大宽度（list 用 `xl`，detail 用 `lg`，form 用 `md`）
  - `PageHeader` — 标题 + 描述 + 面包屑 + 操作 + IconBox
  - `IconBox` — 渐变图标盒（10 个 accent；strokeWidth=2.25）
  - `StatCard` — 统计卡（含装饰光斑 + group hover）
  - `SectionCard` — 内容卡片（default / elevated / gradient / plain 四 variant）
  - `Toolbar` — 列表页工具栏（可 sticky + glass-soft）
  - `GradientHero` — Hero / 强引导区（5 tone × blob 装饰 + 渐变标题）
  - `EmptyState` / `InfoRow`
- **阴影 5 级**：`shadow-xs / soft / card / pop / modal / glow`，hover 提升用 `card-hover` utility
- **玻璃 3 级**：`glass-soft`（Header / Sticky）/ `glass`（默认浮层）/ `glass-strong`（Hero）/ `glass-overlay`（全屏 overlay）
- **装饰光斑**：`blob-primary / rose / amber / emerald / sky` + `animate-blob` 慢漂移；父级 `relative overflow-hidden`
- **渐变边框**：`.gradient-border`（+ `-sky / -emerald / -amber / -rose` 变体），用于特色卡 / 强 CTA
- **卡片层级**：`card-base / card-elevated / card-hover / card-feature`，**严禁** `glass-card rounded-2xl border border-white/[0.06]` 硬编码
- **图标 strokeWidth 三档**：默认 **2.25**（IconBox / PageHeader / StatCard）/ 小图标 **2.1**（表格 / Sidebar 二级菜单 / Header 工具按钮）/ 大图标 **2** 或更细（EmptyState）
- **内容类型语义色（IconBox accent）**：`article=blue / image=emerald / video=rose / audio=sky / primary=紫粉`，跨模块统一不可换色（amber 已剥离给系统 warning 状态用）。注：article 用 blue-600 深蓝（Word 风格），跟 docx 文件徽章 blue-400 浅蓝同色相不同明度
- **新页面套用顺序**：`<PageContainer> → <PageHeader> → <Toolbar>（列表页） → <SectionCard>（区块）`；Dashboard/Hero 用 `<GradientHero>` + StatCard 网格 + SectionCard
- **PageHeader 顶部两种样式（仅两种，禁止自创）**：
  - **带导航**：Sidebar 菜单可达的业务页面（三级菜单页 / 列表 / 详情），**必须**传 `breadcrumbs` 三级数组——一级模块（首页 / 资产管理 / 创作分发 / 数据分析）→ 二级子组（公司信息 / 媒体 / 知识检索 / 内容创作 / 国内发布）→ 三级页面名。**breadcrumb 文案必须与 Sidebar 翻译键一致**（"知识检索" / "国内发布" 等，不要自造同义词）
  - **无导航**：没有菜单入口的页面（生成历史 / 设置 / 订阅与账单 / 消息通知 / 详情页等），**不传** `breadcrumbs`，只用 icon + title + description + 可选 actions
  - IconBox 内容统一 `size="md"`（size-11），与文字块**垂直居中**对齐；标题用 `text-[22px] sm:text-2xl font-semibold`。**禁止裸 `<header>` + 自绘 IconBox**（gradient-text-cyan / size-10 / neon-* 等旧风格已废弃）
- 详见 `frontend/AGENTS.md §13`

### 5.2 三层背景 + Sidebar + 弹层

- **三层背景**：L1 = `#FFFFFF`，L2 = `#FCFBFE`，L3 = `#F6F5FC`（暗色 L1 oklch(0.27) → L2 bg-card → L3 bg-background）。**L3 内容区底色不是 `bg-background`，是 `#F6F5FC`**，AppLayout 已设。新页面想用"页底色"写 `bg-[#F6F5FC] dark:bg-background`
- **纵向分割线（L1↔L2、L2↔内容）**：唯一指定色 `bg-[color-mix(in_oklab,#e7e5e4_30%,transparent)] dark:bg-[oklch(0.3_0.008_285)]`，横向分割线继续用 oklch(0.95) / `border-border`
- **Sidebar**：L1 用 `/logo.png`（不要 lucide 替代），点击 Logo 跳 dashboard 同时 `setActiveModule('home')`；L2 分组**不要 Collapsible**，用静态小灰色 uppercase 标题 + 平铺；折叠态 L2 显示当前模块 IconBox + icon-only items + Tooltip
- **Header**：`absolute inset-x-0 top-0 h-14` + `bg-[#F6F5FC]/75 backdrop-blur-xl` + `border-border/70`；不是 sticky，main 自己 `pt-[calc(theme(spacing.14)_+_24px)]` 留出位置
- **Drawer 滚动**：`@/components/common/Drawer` 已修正：**外层不再 overflow-y-auto**，子表单负责自己的 scroll，且**必须有 px-5** 给 input focus ring 留余量。表单内容区结构：`<form flex h-full min-h-0 flex-col>` + `<div min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-4>` + `<div shrink-0 border-t bg-card px-5 py-3>`
- **Modal 滚动**：shadcn `DialogContent` 默认 `display: grid` 会破坏 `flex-1 overflow-y-auto`。`@/components/common/Modal` 已用 `flex flex-col` 覆盖。**新 Modal 直接用该封装，不要裸用 DialogContent**
- **列表行内操作**：至少 `variant="outline"`（带边框），删除用 `variant="danger"`，**不要** `ghost`（无边框看不出可点）。注：`common/Button` 的 `variant="danger"` 为**红色描边 + 红字 + hover 淡红底**（视觉不过分抢眼）；`ConfirmDialog` 二次确认按钮仍是实色红底（强提示）
- **PageContainer 已内置 `pb-12 md:pb-16`**，不要再手写 `pb-10` 之类
- **页面宽度两档制**：
  - **默认全宽**：绝大多数业务页面（资产管理 / 创作分发 / 数据分析 / 设置等）`PageContainer` 默认 `size="full"`，铺满 main 区域，水平边距由 AppLayout `px-6 sm:px-8 md:px-10 lg:px-12` 控制，**禁止页面自己写 `mx-auto max-w-7xl` / `max-w-6xl`** 等限宽 wrapper
  - **非全宽特例**：对话型 / 长文阅读型页面（如 `/chat` 创作中心）允许显式 `mx-auto max-w-6xl`（或 `max-w-5xl` / `max-w-4xl`）居中收窄。判定标准：内容主体是**单列消息流 / 表单 / 长文**且大屏上铺满会让行长 > 100 字符或网格被拉稀疏。新增此类特例需在代码处加中文注释说明原因
  - 已废弃的 `size` 枚举仅 `sm`（max-w-3xl）仍收窄，其它（`md` / `lg` / `xl` / `full`）一律映射为全宽
- 详见 `frontend/AGENTS.md §14`

---

## 六、关键配置项（后端 `.env`）

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `OCR_ENABLED` | `true` | 是否启用 PaddleOCR |
| `OCR_SERVICE_URL` | `http://localhost:8866` | PaddleOCR Serving 地址 |
| `PDF_MAX_OCR_PAGES` | `100` | 超过此页数的 PDF 跳过 OCR 改用 PyMuPDF |
| `PANDOC_ENABLED` | `true` | 是否启用 Pandoc 转 Markdown |
| `PPTX_IMAGE_OCR_ENABLED` | `true` | PPTX 内嵌图片是否走 OCR |
| `MODEL_PRELOAD_ENABLED` | `false` | `true` 时启动并发预加载 BGE-M3 + wtpsplit + CLIP |
| `CHUNK_SIZE` / `TABLE_CHUNK_SIZE` | `2048` / `4096` | 分块最大字符数 |
| `WHISPERX_URL` / `WHISPERX_MODEL_ZH` / `WHISPERX_MODEL_DEFAULT` | — | 中文专用 / 通用 Whisper 模型 |
| `WHISPERX_ZH_IS_TRADITIONAL` | `true` | 中文模型输出繁体，自动 opencc T2S |
| `HYBRID_MERGE_MODE` | `rrf` | 混合检索融合方式：`rrf`（倒数排名融合）/ `weighted`（归一化加权） |
| `HYBRID_VECTOR_WEIGHT` / `HYBRID_FULLTEXT_WEIGHT` | `0.6` / `0.4` | `weighted` 模式下的混合检索权重 |
| `RERANKER_ENABLED` | `false` | 是否启用 BGE-Reranker-v2-m3 重排 |
| `QUERY_ADAPTER_ENABLED` | `false` | 是否启用 Query Adapter 查询向量优化 |

---

## 七、关键文件速查

### 后端

| 需求 | 文件 |
|------|------|
| 添加新 API | `app/api/v1/router.py` → 新路由模块 → `services/` → `schemas/` |
| 修改数据库模型 | `app/models/*` → `app/models/__init__.py` → `alembic revision --autogenerate` |
| 修改认证 | `app/core/dependencies.py` + `app/core/security.py` |
| 修改 LLM 调用 | `app/services/llm_service.py` |
| 修改检索策略 | `app/services/knowledge_service.py` |
| 修改文档解析 | `app/utils/file_parser.py` |
| 修改分块策略 | `app/utils/text_splitter.py` |
| 修改 OCR / 转录 / 视频 | `app/services/{ocr,whisper,video}_service.py` |
| 修改限流规则 | `app/middleware/rate_limit.py` |
| 全局配置 | `app/core/config.py` + `.env` |

### 前端

| 需求 | 文件 |
|------|------|
| 添加新页面 | `src/router/index.tsx` → `src/pages/` → `src/components/layout/Sidebar.tsx`（菜单） |
| 添加 API | `src/api/index.ts`（Axios 实例） → 新 `src/api/*.ts` |
| 修改全局状态 | `src/stores/*.ts`（Zustand） |
| 修改主题色 token | `src/index.css`（`:root` / `.dark` 块） |
| 添加新 shadcn 组件 | `src/components/ui/*.tsx`（`npx shadcn@latest add <组件>`，new-york 风格见 `components.json`） |
| 修改主题切换 | `src/components/theme/{ThemeProvider,ThemeToggle}.tsx` |
| 添加翻译 | `public/locales/<lang>/translation.json`（6 种语言：zh-CN / en / ko / ja / fr / es） |
| 修改布局 | `src/components/layout/{AppLayout,Sidebar,Header,MobileNav}.tsx` |
| 修改构建配置 | `vite.config.ts`（注意 `__APP_VERSION__` 注入） |

---

## 八、测试

- 后端 `tests/` 已有 pytest 单元测试（如 `test_publish_spec.py` / `test_sms_service.py` / `test_allinpay_sign.py`）；新增测试用 pytest + `pytest-asyncio`，异步驱动 `asyncmy`
- 前端无单测，依赖 `npm run lint` + `tsc -b` 类型检查 + 浏览器手动过页保证质量
