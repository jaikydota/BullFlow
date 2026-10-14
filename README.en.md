<p align="center">
  <img src="frontend/public/logo.png" alt="bullflow logo" width="200">
</p>

<h1 align="center">bullflow (推量牛)</h1>

<p align="center">
  <b>Massive AI content × omnichannel reach — acquire and convert customers on your own</b><br>
  A <b>complete, commercial-grade</b> open-source AI growth platform
</p>

<p align="center">
  <a href="README.md">简体中文</a> | <b>English</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.12-blue" alt="Python">
  <img src="https://img.shields.io/badge/node-20%2B-339933" alt="Node">
  <img src="https://img.shields.io/badge/FastAPI-async-009688" alt="FastAPI">
  <img src="https://img.shields.io/badge/React-19-61DAFB" alt="React">
  <img src="https://img.shields.io/badge/enterprise-commercial--grade-purple" alt="Enterprise commercial-grade">
  <img src="https://img.shields.io/badge/RAG-local%20open--source%20models-orange" alt="RAG with local open-source models">
  <img src="https://img.shields.io/badge/license-MIT%20(commercial%20use%20OK)-green" alt="License MIT, commercial use OK">
</p>

> 🏢 **This is a complete, commercial-grade enterprise project — not a feature demo or a half-built scaffold.** It ships three full systems: the user app, the operations admin console and the multi-platform publishing gateway. Everything a commercial product needs is implemented: multi-tenant isolation, roles and permissions, billing and subscriptions, online payments, invoices, audit logs, rate limiting and captcha — along with database migrations, Docker deployment and development guidelines. It's **MIT-licensed and free for commercial use**: run it as your own branded SaaS, or deploy it privately inside your company.

First turn your company, brand, product, customer and case-study profiles — plus documents, images, audio and video — into a **private knowledge base**. Then let an AI Agent **write articles, illustrated posts, images and videos** grounded in those assets. Finally **publish to 17 domestic and international social platforms in one go**, and feed publishing results and account metrics back for analysis — from raw material to reach, in a single pipeline.

**The entire RAG pipeline depends on no paid model**: document OCR, sentence segmentation, embeddings, reranking, text-to-image search and speech transcription all run on open-source models **deployed locally for free**. However large your knowledge base grows, indexing and retrieval cost nothing per call, and your company data never leaves your network.

![bullflow AI Creation Center](docs/screenshots/zh/chat.png)

> The UI defaults to Simplified Chinese; screenshots are taken from the Chinese UI. The i18n framework ships 6 locales (see [Roadmap](#roadmap--known-limitations)).

**Contents**: [Why bullflow](#why-bullflow) · [Commercial-grade](#commercial-grade-ready-to-operate) · [Use cases](#use-cases) · [Features](#features) · [Worked example](#worked-example-one-product-document--everywhere) · [Architecture](#architecture) · [Quick start](#quick-start) · [Connecting the gateway](#connecting-the-tuiliangfa-gateway) · [Building the backend image](#building-the-backend-image) · [Docker deployment](#docker-deployment) · [Project layout](#project-layout) · [Development guide](#development-guide) · [FAQ](#faq) · [Roadmap](#roadmap--known-limitations) · [About Zhongjuliang](#about-zhongjuliang)

## Why bullflow

General-purpose AI writers don't know your company, so the output sounds like AI rather than like you. Matrix-publishing tools only publish; they don't write. In between sits a lot of copy-paste, re-formatting and logging into one platform after another. bullflow closes that loop:

| | Generic AI writer | Matrix publishing tool | **bullflow** |
|---|---|---|---|
| Knows your business | ✗ re-explain context every time | ✗ | ✅ company profiles + knowledge base injected automatically; answers come with **citations** |
| Knowledge-base & retrieval cost | embeddings / search billed per call | — | ✅ **all open-source models running locally, zero per-call cost**; data stays on your network |
| Content formats | mostly plain text | doesn't produce content | ✅ articles / **mixed text-and-image articles (auto illustrated)** / multi-image posts / images / video / read-aloud |
| Multi-platform publishing | ✗ | ✅ | ✅ 11 Chinese + 6 international platforms behind **one gateway** |
| Account safety | — | varies | ✅ region-sticky proxy IPs, per-IP per-platform account caps, automatic health checks and migration |
| Data feedback | ✗ | partial | ✅ publish results written back via webhooks + daily account metrics |
| Deployment & data | SaaS, your data lives elsewhere | SaaS | ✅ **self-hosted**; vector DB, full-text search, object storage, OCR and speech can all be self-hosted, models can be baked into the image |
| Monetization | — | — | ✅ credit billing, subscriptions, payments, invoices, referrals, sales attribution and funnel analytics **out of the box** |

**In one sentence: it understands your business first, creates for you second, and floods every channel third.**

- 🧠 **Knowledge-driven, not a chat wrapper.** Every conversation and generation can inject 5 kinds of business profiles (company, brand, product, customer, case study); article generation also searches the knowledge base. Matched chunks are listed under each answer with relevance scores and one-click source preview — content is traceable and verifiable.
- 💸 **RAG without paid models, deployed locally for free.** Every stage of the knowledge base — OCR (PaddleOCR), sentence segmentation (wtpsplit), text embeddings (BGE-M3), reranking (BGE-Reranker), text-to-image search (OpenCLIP), speech transcription (WhisperX) — is an open-source model running on your own servers. Index as many documents and run as many searches as you like **without paying a single API call**. A GPU isn't required (it's used automatically when present), and company data never leaves your network. Only the final "write the article, make the image, make the video" step calls an LLM, through OpenAI-compatible APIs with the provider of your choice.
- 🔍 **Production-grade RAG, not "dump the PDF into the model".** A four-step parsing fallback chain (OCR → Pandoc → native parsers → binary fallback) parses 12 formats — PDF, Word, Excel, PowerPoint, Markdown, HTML, EPUB and more — straight into the knowledge base; sentence segmentation + dynamic-programming chunking keeps tables and code blocks intact; **hybrid retrieval** over Milvus vectors + Elasticsearch (IK analyzer) with RRF fusion, optional reranking, neighbor-chunk expansion and adaptive retrieval, plus built-in **Ragas evaluation and automatic weight tuning**.
- 🖼️ **Content shaped for each platform.** Article platforms (WeChat Official Accounts, Toutiao, Baijiahao) → **mixed text-and-image articles** with illustrations generated and embedded in the body; image-first platforms (Xiaohongshu, Weibo) → **multi-image posts** (1–9 images in parallel + caption copy). The Agent picks the right format from the platform you mention.
- 🌏 **China + global, one gateway.** Douyin, Kuaishou, Xiaohongshu, WeChat Channels, WeChat Official Accounts, Bilibili, Zhihu, Weibo, Toutiao, Baijiahao, Duoduo Video, plus LinkedIn, Facebook, Instagram, Reddit, YouTube and X — pick several platforms for one piece of content and publish once; per-platform length and image rules are validated automatically.
- 🛡️ **Safety and cost of account matrices handled for you.** QR-code authorization with cloud-hosted sessions; region-sticky proxy IPs, at most 15 accounts per IP per platform, health checks every 20 minutes with automatic migration; accounts unused for 14 days are reclaimed to stop billing and restored with a rescan.
- ⏰ **Scheduled generation + auto-publishing.** Set weekdays and times; content is produced and published to chosen accounts automatically, with in-app notifications on success or failure — a truly hands-off content matrix.
- 💰 **Monetization is complete.** Not a demo: precise billing per token / image / second, post-paid overdraft protection, subscriptions and add-on packs, Allinpay (Alipay / WeChat Pay) + bank transfer, invoices, referral rewards, sales attribution, a 9-step conversion funnel, notification channels (email / Feishu / WeCom) — ready to operate.
- 🏠 **Self-hosted, you own the data.** Every component can run on your own infrastructure; HuggingFace models and FFmpeg are baked into the image at build time with zero runtime downloads; LLMs are called through OpenAI-compatible APIs so providers are swappable.

### Commercial-grade, ready to operate

Many open-source AI projects give you a chat UI or a pipeline script; to launch, you still have to build accounts, permissions, billing, payments and an admin console yourself. bullflow ships **the full set of systems a SaaS company needs to operate**:

| Area | What's implemented |
|---|---|
| **Three complete systems** | User app (creation, assets, publishing, analytics) · Operations admin console (6 groups / 23 menu items) · TuiLiangFa publishing gateway (deployable on its own, with its own admin UI) |
| **Accounts & permissions** | Email / phone sign-up and login, SMS-code login, password recovery; super admin / admin / user / sales / finance roles; role and permission management in the console |
| **Multi-tenancy** | All business data isolated per tenant; MySQL, Milvus and Elasticsearch searches are always filtered by user |
| **Billing & payments** | Credit billing (precise charges per token / image / second / target account), post-paid overdraft protection, subscriptions (monthly / quarterly / yearly with prorated upgrades), add-on packs, Allinpay (Alipay / WeChat Pay) + bank transfer, automatic cancellation of unpaid orders, invoice requests with email notification |
| **Growth & operations** | Referral rewards, sales lead attribution, in-app broadcasts, email / Feishu / WeCom notification channels, user feedback, Skill pool and Traffic Secrets content, online platform settings |
| **Analytics** | User-facing dashboard; financial reports, 9-step conversion funnel, creation analytics, payment analytics and event-level tracking in the console |
| **Security & compliance** | JWT access / refresh tokens + Redis blacklist, tiered rate limits (global and login), slider captcha, audit log and admin operation log, HMAC-signed webhooks with replay protection, user agreement and privacy policy pages |
| **Engineering & delivery** | Alembic migrations, Docker Compose deployment, models baked into the image for offline use, pytest unit tests, frontend / backend development guidelines, 6-locale i18n framework, light / dark themes |
| **License** | MIT — **free commercial use, modification and redistribution**; launch it directly as your own branded product |

## Use cases

| Scenario | How bullflow helps |
|---|---|
| **Brand social-media matrix** | Create once, publish to Douyin, Xiaohongshu, WeChat Channels, Official Accounts, Zhihu… at the same time; scheduled jobs keep the matrix updated daily and one dashboard shows success/failure across platforms. |
| **Cross-border e-commerce / going global** | From the same product material, generate content tailored for LinkedIn, Facebook, Instagram, Reddit, X and YouTube; batch-produce selling-point and hotspot images in the style of a reference image. |
| **B2B content marketing** | Upload white papers, case studies and product docs; AI writes industry articles and long-form posts grounded in real material, with traceable citations instead of confident nonsense. |
| **Agencies / MCNs** | Multi-tenant isolation keeps each client's knowledge base, accounts and content separate; credit billing and subscriptions let you resell the service directly. |
| **Retail / local business** | A product photo + one sentence → a Xiaohongshu multi-image note with caption copy; short-video scripts, talking-head scripts and marketing copy in one click. |
| **Enterprise knowledge Q&A** | Documents, slides, spreadsheets and meeting recordings go into one knowledge base; ask in natural language and get answers with source excerpts. |

## Features

### 1. AI Creation Center (Agent)

![The Agent turns a knowledge-base document into a multi-image Xiaohongshu post](docs/screenshots/zh/chat_agent.png)

A creation Agent built on a **LangGraph ReAct** loop with true token-level streaming (SSE). One conversation can chain "retrieve → write → illustrate → export":

| Agent tool | What it does |
|---|---|
| `knowledge_search` | Searches the knowledge base (can be called repeatedly); hits are shown as citations |
| `generate_article_content` | Writes an article; with `mixed=true` it becomes a **mixed text-and-image article** with AI illustrations inserted |
| `generate_image_content` | Generates 1–9 images; uses image-to-image automatically when reference images are attached; `as_dynamic` packages them as a multi-image post |
| `generate_video_content` | Generates a 1–15 s short video |
| `export_article_content` | Exports to PDF / Word |
| `create_customer` | Creates a customer profile from the conversation |

- **Two modes**: Agent mode (multi-turn + tool calls) and Quick mode (one prompt straight to an article, image or video).
- **Attach references**: up to 8 — full documents, images (multimodal understanding), brand / product profiles.
- **Skills ("creation masters")**: **56** built-in creation skills (de-AI-ify, Xiaohongshu viral notes, SEO writing, short-video scripts, marketing copy…). Text skills are injected into the system prompt; for images and video the LLM first rewrites a simple request into a professional prompt.
- **Inspiration library and shortcuts**: viral-content breakdowns, growth playbooks, industry ideas, and one-tap "publish to TikTok / YouTube / Facebook" prompts.
- **Voice**: speech-to-text input; assistant replies can be read aloud with IndexTTS.
- **Drag-and-drop upload**: files dropped into the chat are routed into the document / image / video / audio libraries automatically.

![Answers come with citations and relevance scores](docs/screenshots/zh/chat_citation.png)

> "Citations (N)" under an answer lists every matched chunk, its source document and relevance score; click to preview the original.

### 2. Knowledge base & RAG

![Document parsing and semantic chunking](docs/screenshots/zh/document_detail.png)

**Structured profiles**: company, brand, product, customer and case-study profiles are maintained in one place and take part in generation in three modes — `auto` (injected automatically with per-type caps), `custom` (only selected items + up to 2 full documents) or `none`.

**Parsing fallback chain** (each step logs and falls back on failure):

```
① PaddleOCR PP-StructureV3   PDF (≤100 pages) / images, layout + table structure recognition
② Pandoc → GFM Markdown       doc / docx / html / epub / rtf / odt …
③ Native parsers              PyMuPDF / python-docx / openpyxl / python-pptx (embedded PPTX images OCR'd concurrently)
④ Binary fallback             file-signature detection; files with no extractable text are stored only
```

- **Document formats**: 12 formats are parsed into the knowledge base — pdf / docx / xlsx / pptx / txt / csv / md / html / htm / epub / rtf / odt. Legacy binary doc / xls / ppt files can be uploaded and stored, but their text can't be extracted; save them as docx / xlsx / pptx first.
- **Semantic chunking**: wtpsplit SaT sentence boundaries + heading awareness + dynamic-programming merging (inspired by RAGLite); tables and code blocks kept whole; regular chunks ≤ 2048 chars, table chunks ≤ 4096 chars.
- **Three stores kept in sync**: MySQL (chunk text) + Milvus (BGE-M3 1024-d vectors) + Elasticsearch (IK full-text index).
- **Media assets**: images are embedded with OpenCLIP ViT-L-14 for **text-to-image search**; videos get metadata and an auto-extracted cover; audio is transcribed with WhisperX (a dedicated Chinese model with Traditional→Simplified conversion) and then goes through the full RAG pipeline as a document.
- **Unified search**: one query across documents, images, audio and video.

![Hybrid retrieval: vector + full-text with RRF fusion](docs/screenshots/zh/hybrid_search.png)

**Hybrid retrieval** (`services/knowledge_service.py`):

| Stage | Approach |
|---|---|
| Recall | Milvus vector recall ∥ ES full-text recall (IK analyzer, with a synonym filter you can fill in `core/elasticsearch.py`), in parallel, top_k×3 each |
| Fusion | **RRF** by default (k=60); switchable to normalized weighting (default 0.6 / 0.4) |
| Filtering | vector scores below a threshold (default 0.40) are dropped |
| Reranking | optional BGE-Reranker-v2-m3 (up to 20 candidates, score threshold) |
| Expansion | neighboring chunks are appended to each hit for fuller LLM context |
| Adaptive | the LLM first decides whether retrieval is needed and rewrites the query if so |
| Optimization | optional Query Adapter (orthogonal Procrustes), trainable from evaluation data |
| Evaluation | 4 Ragas metrics + grid search to auto-tune hybrid weights |

**The whole knowledge-base pipeline runs on local open-source models — zero per-call cost**:

| Stage | Open-source model / component | How it runs |
|---|---|---|
| Document OCR | PaddleOCR PP-StructureV3 | self-hosted service (GPU recommended, can be disabled) |
| Sentence segmentation | wtpsplit SaT `sat-3l-sm` | in the backend process, CPU |
| Text embeddings | BGE-M3 (1024-d, multilingual incl. Chinese & English) | in the backend process, CPU / GPU auto-selected |
| Reranking | BGE-Reranker-v2-m3 (optional) | in the backend process |
| Text-to-image search | OpenCLIP ViT-L-14 | in the backend process |
| Speech transcription | WhisperX (faster-whisper large-v3-turbo; a dedicated Belle model for Chinese) | self-hosted service |
| Read-aloud | IndexTTS | self-hosted service |
| Vector DB / full-text search | Milvus, Elasticsearch + IK | self-hosted |

> Models can be baked into the image at build time, so nothing is downloaded or called over the internet at runtime. Only content generation (writing, images, video) calls LLM APIs: every provider goes through an OpenAI-compatible client with a configurable `*_BASE_URL`, so you can also try pointing it at a self-hosted OpenAI-compatible inference server (e.g. vLLM, Ollama).

### 3. Content generation

![Mixed text-and-image article with auto illustrations, one-click PDF / Word export](docs/screenshots/zh/mixed_article.png)

| Type | Capabilities |
|---|---|
| **Articles** | 8 built-in templates; selectable model; **mixed layout**: the LLM emits `[[IMG:description]]` placeholders → illustrations are generated concurrently → swapped in place (if the model doesn't mark any, images are still generated and spread evenly between paragraphs); export to PDF (Pandoc + WeasyPrint) / Word |
| **Images** | 8 built-in templates; 1–9 images generated in parallel, partial failures don't affect the rest; up to 8 reference images (image-to-image); "make a post" produces caption copy alongside |
| **Video** | 6 built-in templates; first-frame + last-frame control; 720p / 1080p; 5 / 10 / 15 s; optional audio |
| **Metadata** | every item gets an auto-generated title, description and tags, ready for publishing |
| **Scheduled jobs** | run by weekday + time, or "run now"; finished content can be **auto-published** to chosen platform accounts |

![Image generation: templates, count, skills, knowledge reference, multiple models](docs/screenshots/zh/image_gen.png)

![Content library: everything you've generated in one place](docs/screenshots/zh/library.png)

**Supported providers** (unit prices and enable/disable are configurable in the admin console):

| Type | Models |
|---|---|
| Text | Azure OpenAI (GPT-5.4 / Mini / Nano), Volcengine Ark (Doubao Seed 2.0 Pro / Lite / Mini), Alibaba Cloud Bailian (Qwen) |
| Image | GPT-Image-2 (Azure), Doubao Seedream 5.0, Tencent GEM (Nano Banana 2) |
| Video | Doubao Seedance 2.0, Kling 3.0 (Tencent VOD) |
| Speech | IndexTTS (self-hosted) for read-aloud; WhisperX (OpenAI-compatible API) for transcription |

> All generation is asynchronous: the request returns immediately and a background task finishes the work, so closing the page doesn't lose results.

### 4. Publishing everywhere (TuiLiangFa gateway)

![One piece of content, published to 15 platforms at once](docs/screenshots/zh/publish_platforms.png)

Publishing is provided by the standalone **TuiLiangFa (推量发) gateway** (`tlf_backend/`). The main app talks to it through an SDK + webhooks, and the gateway can also be deployed on its own for other products (API docs in [`tlf_backend/docs/`](tlf_backend/docs/)).

> The gateway itself is open source, but actually logging in and posting to each platform relies on two third-party services: [Lingjing](https://app.lapi.cc) for Chinese platforms (billed per account) and [Composio](https://composio.dev) for international ones. You need your own accounts with both to use publishing — see [Connecting the gateway](#connecting-the-tuiliangfa-gateway). Without them, the knowledge base, AI creation and content generation still work.

**Available platforms (17)**

| China (11) | International (6, via Composio OAuth) |
|---|---|
| Douyin, Kuaishou, Xiaohongshu, Bilibili, Baijiahao, Toutiao, Sina Weibo, WeChat Channels, Zhihu, WeChat Official Accounts, Duoduo Video | LinkedIn, Facebook, Instagram, Reddit, YouTube, X (Twitter) |

> The upstream already supports 8 more Chinese platforms (Xueqiu, Kuaichuan, AcFun, Yiche, Meipai, iQIYI, Sohu Video, Weishi) and the gateway's field-spec table covers 38 Chinese platforms, ready to be enabled.

![QR-code authorization with cloud-hosted accounts](docs/screenshots/zh/account_auth.png)

| Capability | Details |
|---|---|
| **Three-step publishing** | pick content → pick platforms (platforms supporting "article" / "image post" are marked for the content type) → configure (scheduling, originality and AI-content declarations, length validation) |
| **QR authorization** | pick a platform and proxy region, then scan; login passwords some platforms require are only passed through to the upstream and never stored |
| **Anti-association** | region-sticky proxy IPs; at most 15 accounts per IP per platform, overflow moves to another IP in the same region |
| **Proxy health** | connectivity and egress latency checked every 20 minutes; consecutive failures disable the proxy and migrate its accounts |
| **Cost control** | accounts unused for 14 days have their upstream session revoked to stop billing; a rescan restores them with the same account ID |
| **Result feedback** | 6 webhook event types (auth result, publish result, publish progress, review status, account data, account status); HMAC-SHA256 signatures + timestamp replay protection + nonce; failed forwards retried with 1 / 3 / 10 s backoff |
| **Metrics collection** | followers, posts, likes and views collected daily for every account |
| **Risk control** | platform risk-control SMS verification, batch login-status checks |

### 5. Analytics

![Analytics dashboard](docs/screenshots/zh/analytics.png)

- Four KPI cards: uploads, AI generations, publish tasks, social accounts.
- Upload trend and creation / interaction trend over 7 / 30 / 90 days.
- Generated-content type breakdown, per-platform publish success / failure, account distribution by platform.

![Workspace](docs/screenshots/zh/dashboard.png)

### 6. Monetization & admin console

![Admin dashboard](docs/screenshots/zh/admin_dashboard.png)

The admin console (`admin_frontend/`) has **6 groups and 23 menu items**:

| Group | Items |
|---|---|
| Overview | Dashboard, Analytics, Financial reports |
| Tracking | Overview, Conversion funnel (page view → sign-up → create → generate → export → view plans → pay, 9 steps), Creation analytics, Payment analytics, Event log |
| Users & permissions | Users, Roles, Sales (lead attribution), Finance team |
| Billing & orders | Plans & add-ons, Orders, Invoices, Pricing configuration |
| Operations | Platform settings, Broadcasts, Notification channels (SMTP email / Feishu / WeCom), Feedback, Skill pool |
| Resources | Traffic Secrets, Audit log |

![Pricing configuration per model](docs/screenshots/zh/admin_billing.png)

**Billing model**

- Text per 1K tokens; images at "unit price × size multiplier", **charged per image actually produced**; video at "unit price × resolution multiplier × actual seconds"; publishing per target account.
- **Post-paid overdraft protection**: balance is checked against an estimate before generation and charged by actual usage afterwards; an insufficient balance is drained to 0 so tiny balances can't be exploited for unlimited use.
- Subscriptions (monthly / quarterly / yearly, with prorated upgrades) + add-on packs; Allinpay (Alipay / WeChat Pay, RSA-signed) + bank-transfer review; unpaid orders auto-cancel after 30 minutes.
- Full credit ledger; users request invoices online and are emailed when issued.
- **Referrals**: rewards when a friend signs up and again on their first top-up.
- **Traffic Secrets**: growth tools and playbook cards curated in the admin console and shown to users in a floating panel.

![Skill pool: 56 built-in creation skills](docs/screenshots/zh/admin_skills.png)

### 7. Polish

![Dark theme](docs/screenshots/zh/dark_mode.png)

- Light / dark themes; shadcn/ui (new-york) + Radix UI + an OKLCH color system shared by the user app and the admin console.
- ⌘K global search across features and pages.
- In-house slider captcha (only after 3 failed attempts per IP / account); SMS codes rate-limited by phone number and IP.
- After a release, stale code-chunk load failures trigger a single automatic reload, so users upgrade seamlessly.

## Worked example: one product document → everywhere

1. **Assets → Documents**: upload `product-whitepaper.pdf`; it is OCR'd, chunked and written to the vector and full-text indexes. Add selling points and tone under **Products / Brands**.
2. Open the **AI Creation Center** and type: "Based on the product whitepaper, write an illustrated article for our WeChat Official Account, then make a 4-image Xiaohongshu note."
3. The Agent calls `knowledge_search` on the whitepaper, then `generate_article_content(mixed=true)` and `generate_image_content(count=4, as_dynamic=true)`; two result cards and the citations appear in the reply.
4. Open the article in the **Content library**, review text and images, and export to Word for legal review if needed.
5. **Publish** → select the article → tick WeChat Official Accounts, Toutiao, Baijiahao, Zhihu and LinkedIn → schedule → submit; do the same for the Xiaohongshu note.
6. Watch progress in **Task monitor** while webhooks write results back; the next day, check per-platform success and account data on the **Analytics dashboard**.
7. Want it every week? Create a rule in **Scheduled jobs**: "generate and auto-publish every Monday and Thursday at 9:00".

## Architecture

```
                                    ┌──────────────────────────────────────────┐
Browser ── frontend (React 19) ─┐    │ backend (FastAPI · SQLAlchemy 2 async)   │
       admin_frontend ──────────┼──▶ │  Agent (LangGraph) · RAG · generation ·  │
                                │    │  billing                                 │
                                │    └───┬───────┬───────┬───────┬───────┬──────┘
                                │        │       │       │       │       │
                                │     MySQL  Milvus  Elastic  Redis   MinIO
                                │           (vectors)(IK text)(cache/  (objects)
                                │                             rate-limit)
                                │        ├── PaddleOCR (PP-StructureV3, optional GPU)
                                │        ├── WhisperX / IndexTTS (speech, optional)
                                │        └── LLM / image / video APIs (OpenAI-compatible)
                                │
                                │    ┌──────────────────────────────────────────┐
       tlf_frontend ────────────┴──▶ │ tlf_backend TuiLiangFa gateway           │──▶ Lingjing / lapi.cc (China platforms)
                                     │  SDK + webhooks · accounts · proxies ·   │──▶ Composio (global platforms)
                                     │  publishing · metrics                    │
                                     └──────────────────────────────────────────┘
```

**Request path**: `rate limit (60/min/IP) → audit log → CORS → JWT + Redis blacklist + user status → router → service → storage`.

| Layer | Stack |
|---|---|
| Backend | Python 3.12 · FastAPI · SQLAlchemy 2.0 async · Alembic · Pydantic v2 · LangGraph / LangChain · APScheduler |
| Retrieval & models | Milvus 2.5 · Elasticsearch 8 (IK) · BGE-M3 · BGE-Reranker-v2-m3 · wtpsplit SaT · OpenCLIP ViT-L-14 · Ragas |
| Document processing | PaddleOCR PP-StructureV3 · Pandoc · PyMuPDF · python-docx / openpyxl / python-pptx · WeasyPrint · FFmpeg |
| Frontend | React 19 · Vite 8 · TypeScript · Tailwind CSS 4 · shadcn/ui + Radix UI · Zustand · React Router 7 · i18next · Recharts · Framer Motion |
| Deployment | Docker Compose · Nginx |

**Engineering conventions** (see [`CLAUDE.md`](CLAUDE.md) and each app's `AGENTS.md`):

- **Multi-tenant isolation**: every business table carries `user_id`; MySQL queries, Milvus searches and ES searches are all filtered by user.
- **UTC everywhere**: writes use `utcnow()`, DB sessions run at `+00:00`, and API timestamps always include a timezone.
- **Async pipelines**: uploads / generations return immediately; background tasks use their own DB sessions and reliably mark failures; ML inference runs in `asyncio.to_thread` to keep the event loop free.
- **Observable third-party calls**: every outbound HTTP call logs URL, parameters, status code and a truncated response.
- **Model loading**: lazy by default; `MODEL_PRELOAD_ENABLED=true` preloads concurrently at startup.

## Quick start

### Requirements

| Item | Requirement |
|---|---|
| Runtimes | Python 3.12, Node.js 20+ |
| System tools | Pandoc (document → Markdown), FFmpeg + FFprobe (video); PDF export needs the Pango / Cairo libraries WeasyPrint depends on, plus CJK fonts (e.g. `fonts-noto-cjk`) |
| Memory | ≥ 16 GB recommended (BGE-M3, CLIP and wtpsplit stay resident; enabling reranking also loads BGE-Reranker) |
| GPU | Optional. Embedding models detect CUDA and fall back to CPU; an NVIDIA GPU is recommended for the PaddleOCR service |
| Disk | Several GB for models, plus data space for MySQL / Milvus / ES / MinIO |

> On Debian / Ubuntu, system packages mirror `backend/Dockerfile`: `apt install pandoc libpango-1.0-0 libpangoft2-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 shared-mime-info fonts-noto-cjk`.

### Services

| Service | Purpose | How to get it |
|---|---|---|
| MySQL 8 | business data (main DB `matrix365` + gateway DB `matrix365_tlf`, create both beforehand, utf8mb4) | self-hosted |
| Redis | cache / JWT blacklist / rate limiting | self-hosted |
| Elasticsearch 8 + [IK analyzer](https://github.com/infinilabs/analysis-ik) | full-text search (index created automatically on backend startup) | self-hosted |
| Milvus 2.5 + MinIO | vector DB / object storage | `docker compose -f docker-compose.milvus.yml up -d` |
| PaddleOCR (optional) | PDF / image OCR | see `paddleocr/`; without it set `OCR_ENABLED=false` to fall back to Pandoc / native parsing |
| WhisperX (optional) | audio transcription | any OpenAI-compatible transcription endpoint |
| IndexTTS (optional) | read-aloud | a self-hosted IndexTTS service |
| LLM / image / video | Azure OpenAI, Volcengine Ark, Alibaba Cloud Bailian, Tencent Cloud… | put the keys in `.env`; at least one text model is required |

> In `docker-compose.milvus.yml` the MinIO API is published on host port **9100** (container 9000, console 9101), with credentials `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`. `MINIO_ENDPOINT` / `MINIO_PUBLIC_URL` (default `localhost:9100` in `.env.example`) and `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` in `backend/.env` must match.

**Prepare the databases and the ES plugin**:

```sql
-- MySQL: main DB and gateway DB (names must match MYSQL_DATABASE in each .env)
CREATE DATABASE matrix365     DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE matrix365_tlf DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
# Elasticsearch: install the IK plugin matching your exact ES version, then restart ES
bin/elasticsearch-plugin install https://get.infini.cloud/elasticsearch/analysis-ik/<your ES version>
```

### Local development

All commands start from the **repository root**; run each service in its own terminal.

**1. Clone the repository and copy the config files**, then fill in database connections and provider keys:

```bash
git clone https://github.com/jaikydota/BullFlow.git
cd BullFlow
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp admin_frontend/.env.example admin_frontend/.env
cp tlf_backend/.env.example tlf_backend/.env      # only needed for publishing
```

**2. Backend** (:8020):

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python -m scripts.seed_skills                     # import the 56 built-in creation skills (idempotent, safe to re-run)
uvicorn app.main:app --host 0.0.0.0 --port 8020 --reload --reload-dir app
```

**3. User app** (:5288, `/api` proxied to :8020):

```bash
cd frontend && npm install && npm run dev
```

**4. Admin console** (:5290):

```bash
cd admin_frontend && npm install && npm run dev
```

**5. TuiLiangFa gateway** (optional, backend :8041 / admin UI :5391):

```bash
cd tlf_backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn tlf_app.main:app --host 0.0.0.0 --port 8041 --reload
```

```bash
cd tlf_frontend && npm install && npm run dev
```

**On first start** the backend creates the ES index and Milvus collections, creates the MinIO bucket with public-read access, seeds the default plans and add-on packs, and creates a super admin from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` in `.env` (the gateway does the same with `TLF_ADMIN_INIT_*`). Sign in with that account:

| Entry point | URL |
|---|---|
| User app | http://localhost:5288 |
| Admin console | http://localhost:5290 |
| Gateway admin UI | http://localhost:5391 |
| Backend API docs (Swagger, enabled when `APP_DEBUG=true`) | http://localhost:8020/docs |

> `bstart.sh` / `fstart.sh` / `admin_fstart.sh` / `tlf_bstart.sh` / `tlf_fstart.sh` in the repo root are shortcuts for the commands above. `bstart.sh` sets `HF_HUB_OFFLINE=1`, so **before the first run** download the models into your local HuggingFace cache (`~/.cache/huggingface/hub/`) as described below, or start once without the offline variables to download them automatically.

### Key configuration

See [`backend/.env.example`](backend/.env.example) for the full list (every entry is commented). Common ones:

| Setting | Default | Meaning |
|---|---|---|
| `DEFAULT_LLM_PROVIDER` / `DEFAULT_LLM_MODEL` | `azure` / `gpt-5.4-mini` | default chat / writing model |
| `OCR_ENABLED` / `OCR_SERVICE_URL` | `true` / `http://localhost:8866` | enable PaddleOCR and its address |
| `PDF_MAX_OCR_PAGES` | `100` | PDFs longer than this skip OCR and use PyMuPDF |
| `PANDOC_ENABLED` | `true` | convert documents to Markdown with Pandoc |
| `HYBRID_MERGE_MODE` | `rrf` | hybrid fusion: `rrf` / `weighted` |
| `HYBRID_VECTOR_WEIGHT` / `HYBRID_FULLTEXT_WEIGHT` | `0.6` / `0.4` | weights in `weighted` mode |
| `RERANKER_ENABLED` | `false` | enable BGE-Reranker (needs extra GPU / RAM) |
| `MODEL_PRELOAD_ENABLED` | `false` | preload BGE-M3 + wtpsplit + CLIP at startup |
| `CHUNK_SIZE` / `TABLE_CHUNK_SIZE` | `2048` / `4096` | max characters per chunk |
| `WHISPERX_URL` / `WHISPERX_MODEL_ZH` / `WHISPERX_MODEL_DEFAULT` | — | transcription endpoint, Chinese model, general model |
| `TLF_BASE_URL` / `TLF_APP_ID` / `TLF_APP_KEY` / `TLF_WEBHOOK_SECRET` | — | how the main app reaches the gateway (see [Connecting the gateway](#connecting-the-tuiliangfa-gateway)) |
| `SMS_ENABLED` / `SMS_PROVIDER_*` | `true` | SMS verification codes (Montnets); `false` prints codes to the log for local development |
| `EMAIL_ENABLED` / `SMTP_*` | `true` | SMTP email (e.g. invoices); `false` only logs |
| `CAPTCHA_ENABLED` / `CAPTCHA_LOGIN_THRESHOLD` | `true` / `3` | login slider captcha and how many failures trigger it |
| `ALLINPAY_*` | — | Allinpay merchant ID, app ID and RSA keys; without them only bank transfer is available |

**Frontend configuration** (injected at build time — rebuild after changes):

| File | Setting | Meaning |
|---|---|---|
| `frontend/.env` | `VITE_API_BASE_URL` | API prefix, default `/api/v1` (proxied by Vite or Nginx) |
| | `VITE_APP_TITLE` | browser tab title |
| | `VITE_WEBSITE_URL` | target of the "Back to website" button on the login / sign-up pages |
| | `VITE_MANUAL_URL` | "User manual" link in the header; empty hides it |
| `admin_frontend/.env` | `VITE_ADMIN_API_BASE_URL` | admin API prefix, default `/api/v1` |
| | `VITE_FRONTEND_URL` | target of "Back to app" in the sidebar; set the user-app domain when the two are deployed on separate domains |

## Connecting the TuiLiangFa gateway

Skip this section if you only need the knowledge base and AI creation. Publishing needs three hops wired together: **upstream platform services → TuiLiangFa gateway → main app**.

**1. Sign up for the upstreams and configure the gateway** (`tlf_backend/.env`)

| Upstream | Handles | Gateway settings | Callback URL to register with the upstream |
|---|---|---|---|
| [Lingjing](https://app.lapi.cc) | QR login, publishing and metrics for Chinese platforms | `LAPI_APP_ID` / `LAPI_SECRET` / `LAPI_WEBHOOK_SECRET` | `https://<gateway-domain>/api/webhooks/lapi` |
| [Composio](https://composio.dev) | OAuth and posting for international platforms | `COMPOSIO_API_KEY` / `COMPOSIO_WEBHOOK_SECRET` / `COMPOSIO_AUTH_CONFIG_IDS` / `COMPOSIO_CALLBACK_URL` | `https://<gateway-domain>/api/webhooks/composio` |

> Callback URLs must be publicly reachable HTTPS; for local testing, expose port 8041 temporarily with a tunnel such as ngrok or frp.

**2. Create a tenant for the main app in the gateway**

Sign in to the gateway admin UI (:5391) with `TLF_ADMIN_INIT_EMAIL` / `TLF_ADMIN_INIT_PASSWORD`, open **子租户 (Tenants)** and click **新建子租户 (New tenant)**:

- set `webhook_url` to the main app's callback: `https://<app-domain>/api/v1/webhooks/tlf`;
- the plaintext `app_id`, `app_key` and `webhook_secret` are **shown only once** after creation — save them right away (otherwise you can only reset them).
- (Recommended) add proxy IPs with regions under **代理池 (Proxy pool)**; QR authorization assigns proxies by region to keep accounts from being associated. Accounts can still be bound without proxies, but they log in without one.

**3. Configure the main app** (`backend/.env`)

```bash
TLF_BASE_URL=http://localhost:8041/api/sdk/v1    # gateway SDK URL; http://tlf-backend:8041/api/sdk/v1 under Docker
TLF_APP_ID=<app_id from step 2>
TLF_APP_KEY=<app_key from step 2>
TLF_WEBHOOK_SECRET=<webhook_secret from step 2>
```

Restart the backend; you can then bind accounts by QR code under **Account management** and pick platforms under **Publish**. The full gateway API is documented in [`tlf_backend/docs/推量发开放接口文档.md`](tlf_backend/docs/推量发开放接口文档.md) (Chinese).

## Building the backend image

`backend/Dockerfile` bakes the FFmpeg binaries and HuggingFace models into the image (zero downloads at runtime). They are large and **not included in the repo**; put them under `backend/docker_file/` before building:

```
backend/docker_file/
├── ffmpeg
├── ffprobe
└── models/                       # HuggingFace hub cache layout
    ├── models--BAAI--bge-m3
    ├── models--BAAI--bge-reranker-v2-m3
    ├── models--segment-any-text--sat-3l-sm
    ├── models--facebookAI--xlm-roberta-base
    └── models--timm--vit_large_patch14_clip_224.openai
```

### 1. FFmpeg / FFprobe

Use the prebuilt static Linux builds from [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds/releases) (`linux64-gpl`, not `shared`) — **no compiling required**:

```bash
cd backend/docker_file
curl -LO https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz
tar -xf ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz
cp ffmpeg-n8.1-latest-linux64-gpl-8.1/bin/ffmpeg ffmpeg-n8.1-latest-linux64-gpl-8.1/bin/ffprobe .
rm -rf ffmpeg-n8.1-latest-linux64-gpl-8.1*
```

> File names on the release page change between versions; if the link breaks, pick the latest `ffmpeg-n*-latest-linux64-gpl-*.tar.xz`. **You need both `ffmpeg` and `ffprobe`** — without `ffprobe`, video metadata probing fails.

### 2. Models

| Model | Purpose | Setting |
|---|---|---|
| [`BAAI/bge-m3`](https://huggingface.co/BAAI/bge-m3) | text embeddings | `EMBEDDING_MODEL` |
| [`BAAI/bge-reranker-v2-m3`](https://huggingface.co/BAAI/bge-reranker-v2-m3) | reranking | `RERANKER_MODEL` |
| [`segment-any-text/sat-3l-sm`](https://huggingface.co/segment-any-text/sat-3l-sm) | wtpsplit sentence segmentation | `SENTENCE_MODEL` |
| [`facebookAI/xlm-roberta-base`](https://huggingface.co/FacebookAI/xlm-roberta-base) | tokenizer required by wtpsplit | — |
| [`timm/vit_large_patch14_clip_224.openai`](https://huggingface.co/timm/vit_large_patch14_clip_224.openai) | OpenCLIP ViT-L-14 image embeddings | — |

Download them into `docker_file/models` with the HuggingFace CLI (`--cache-dir` produces the `models--*` layout the Dockerfile expects):

```bash
pip install -U "huggingface_hub[cli]"
cd backend/docker_file
for m in BAAI/bge-m3 BAAI/bge-reranker-v2-m3 segment-any-text/sat-3l-sm \
         facebookAI/xlm-roberta-base timm/vit_large_patch14_clip_224.openai; do
  hf download "$m" --cache-dir ./models
done
```

> With an older CLI, replace `hf download` with `huggingface-cli download`. For local development, download into the default cache instead (drop `--cache-dir`).

## Docker deployment

```bash
docker compose -f docker-compose.milvus.yml up -d                # Milvus + MinIO
docker compose -f paddleocr/docker-compose.paddleocr.yml up -d   # PaddleOCR (optional, NVIDIA GPU)
docker compose up -d --build                                     # backend / frontend / admin-frontend / tlf-backend / tlf-frontend
```

| Service | Port |
|---|---|
| frontend (Nginx, proxies the backend) | 8020 |
| backend | 8021 |
| admin-frontend (Nginx, proxies only `/api/v1/admin/`) | 8030 |
| tlf-frontend (Nginx, proxies tlf-backend) | 8040 |
| tlf-backend | 8041 |

> MySQL, Redis and Elasticsearch are not part of the compose files; deploy them yourself and configure the connections in `.env`. The `paddleocr:v1` image used by `paddleocr/docker-compose.paddleocr.yml` must be built yourself on top of PaddleX, or set `OCR_ENABLED=false` to skip OCR.

In production, terminate TLS at an outer Nginx and **change every default password and `JWT_SECRET_KEY` in `.env`** (`openssl rand -base64 48`).

## Project layout

```
bullflow/
├── backend/                     # main backend (FastAPI)
│   ├── app/
│   │   ├── api/v1/              # user-facing API (knowledge, chat, generation, publishing, billing…)
│   │   ├── admin/               # admin API (/api/v1/admin/*)
│   │   ├── agents/              # LangGraph agent, tools, workflows
│   │   ├── services/            # business services (retrieval, generation, billing, gateway client…)
│   │   ├── models/ schemas/     # ORM models / Pydantic schemas
│   │   ├── middleware/          # rate limiting, audit log
│   │   ├── utils/               # parsing fallback chain, semantic chunking
│   │   └── core/                # config, database, security, time helpers
│   ├── alembic/                 # migrations
│   ├── scripts/                 # seed data (skill pool)
│   ├── tests/                   # pytest
│   └── AGENTS.md                # backend conventions
├── frontend/                    # user app (React 19 + Vite)
│   ├── src/{pages,components,api,stores,hooks,utils}
│   ├── public/locales/          # i18n locales
│   └── AGENTS.md                # design system and frontend conventions
├── admin_frontend/              # admin console (React 19 + Vite)
├── tlf_backend/                 # TuiLiangFa gateway (FastAPI, separate database)
│   └── docs/                    # gateway API docs
├── tlf_frontend/                # gateway admin UI
├── paddleocr/                   # PaddleOCR PP-StructureV3 service config
├── docs/screenshots/            # README screenshots
├── docker-compose.yml           # application stack
├── docker-compose.milvus.yml    # Milvus + MinIO
└── CLAUDE.md                    # repository overview and key conventions
```

## Development guide

Read the matching guide before changing any part of the code:

| Document | Contents |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | repository overview, the three core pipelines, cross-cutting conventions (pitfall checklist) |
| [`backend/AGENTS.md`](backend/AGENTS.md) | backend architecture, RAG flow, `flush` vs `commit`, BackgroundTasks, third-party HTTP logging, coding checklist |
| [`frontend/AGENTS.md`](frontend/AGENTS.md) | design system (OKLCH tokens, shadow / glass layers), three-tier component system, menu structure, preview components |
| [`admin_frontend/AGENTS.md`](admin_frontend/AGENTS.md) | admin routes and productivity components (DataTable / ProForm / DetailDrawer…) |
| [`tlf_backend/README.md`](tlf_backend/README.md) | TuiLiangFa gateway overview and API docs |

The most important rules:

- Every mutating endpoint (POST / PUT / PATCH / DELETE) **must call `commit()` explicitly** before returning.
- New business tables inherit `BaseMixin`, and every query filters by `user_id`.
- Schema changes go through `alembic revision --autogenerate`; never edit the schema by hand.
- New settings are declared in `core/config.py` and documented in `.env.example`; **never hard-code secrets**.
- New user-facing strings get both `zh-CN` and `en` translations.
- Frontend pages use the page templates in `@/components/shared` and OKLCH semantic tokens; no hard-coded colors.

Checks: backend `pytest`; frontend `npm run lint` + `npm run build` (`tsc -b` type checking).

## FAQ

**HuggingFace network timeout / model not found on startup** — `bstart.sh` sets `HF_HUB_OFFLINE=1`. Download the models first (see "Building the backend image → Models"), or drop the offline variables to let them download automatically.

**An uploaded PDF produced no chunks** — check that PaddleOCR is reachable; without OCR set `OCR_ENABLED=false` and scanned PDFs fall back to PyMuPDF (which can't read text inside images). A document marked "completed" with 0 chunks was detected as binary and only stored.

**The skill picker is empty / the admin Skill pool has no entries** — built-in skills aren't imported automatically; run `python -m scripts.seed_skills` once in `backend/` (idempotent upsert by slug, safe to re-run).

**Uploaded .doc / .xls / .ppt files show "stored only"** — text can't be extracted from these legacy binary formats yet; save them as .docx / .xlsx / .pptx and upload again.

**Full-text search fails with `analyzer [ik_max_word] not found`** — Elasticsearch is missing the IK plugin. Install the [analysis-ik](https://github.com/infinilabs/analysis-ik) version matching your ES, restart ES, then delete the existing index so the backend recreates it.

**Uploaded images / videos don't preview** — `MINIO_PUBLIC_URL` must be reachable from the browser; with `docker-compose.milvus.yml` the port is **9100**.

**Videos have no cover / duration** — make sure both `ffmpeg` and `ffprobe` are on `PATH` (for the image, place them in `backend/docker_file/`).

**No SMS / email during local development** — set `SMS_ENABLED=false` / `EMAIL_ENABLED=false`; codes and email bodies are printed to the backend log.

**No platforms on the publish page / QR authorization fails / publish results never update** — walk through [Connecting the gateway](#connecting-the-tuiliangfa-gateway) hop by hop: is the gateway running, do the main app's `TLF_*` values match the gateway tenant, are the upstream (Lingjing / Composio) credentials correct, and are both callback URLs publicly reachable? The gateway admin UI's **Webhook 事件 (Webhook events)** page shows every callback sent and received, with manual retry.

**esbuild / rollup binary mismatch when developing in WSL** — if the code lives on a Windows drive and runs in WSL, run `npm install` inside WSL, never from Windows.

## Roadmap & known limitations

- The **Content review** and **Channel review** pages under Analytics are still in progress (account metrics are already collected; the views are pending).
- The i18n framework ships 6 locales (zh-CN / en / ko / ja / fr / es). Navigation and shared UI are translated, but some pages are still Chinese-only — translation contributions are welcome.
- Text extraction from legacy binary document formats (doc / xls / ppt) isn't supported yet; they are stored only.
- The Docker setup doesn't include MySQL / Redis / Elasticsearch yet; deploy them separately.
- TikTok publishing will open once the upstream provides a usable posting API.

## Contributing

Issues and pull requests are welcome. Before submitting, please make sure:

1. you've read the relevant `AGENTS.md` and followed its conventions;
2. backend `pytest` passes, and frontend `npm run lint` and `npm run build` pass;
3. database changes come with an Alembic migration, and new settings are added to `.env.example`;
4. UI changes come with updated screenshots in `docs/screenshots/`.

When editing the README, please update both [README.md](README.md) (Chinese) and [README.en.md](README.en.md) (English).

## License

[MIT](LICENSE) © 2026 中巨量（深圳）科技有限公司

Third-party components and models used by this project (FFmpeg, PaddleOCR, Milvus, Elasticsearch, MinIO, BGE, OpenCLIP, wtpsplit, etc.) are governed by their own licenses; FFmpeg and similar binaries are downloaded by the user. Review those terms before commercial use.

## About Zhongjuliang

<p align="center">
  <img src="frontend/public/logo.png" alt="bullflow logo" width="96">
</p>

<p align="center">
  <b>bullflow (推量牛) is open-sourced by 中巨量（深圳）科技有限公司.</b><br>
  Discover more Zhongjuliang products at <a href="https://zhongjuliang.com">https://zhongjuliang.com</a>
</p>
