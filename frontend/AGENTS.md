# 前端 AGENTS.md — 推量牛（bullflow）社媒矩阵系统

## 一、系统概述

本前端是基于 **React 19 + TypeScript + Vite** 构建的企业级 SaaS 管理平台。视觉风格为 **浅色精致、shadcn/ui new-york**（白底紫主色），支持**双主题切换**（默认浅色、可选深色）。配合后端提供的 AI
能力，实现知识库管理、AI 对话、内容生成（文章/图片/视频）、多渠道分发等功能。

- **开发端口**: 5288
- **API 代理**: `/api` → `http://localhost:8020`
- **页面数**: 41 个（含 2 个数据分析空壳页）
- **组件库**: shadcn/ui (new-york) + Radix UI primitives + 自研复杂组件（MediaPreview / DocumentPreview / DataTable / RichTextEditor）

---

## 二、技术架构

### 2.1 技术栈

| 层级            | 技术                                                                                                                         |
|---------------|----------------------------------------------------------------------------------------------------------------------------|
| 构建工具          | Vite (`define: __APP_VERSION__` 注入版本号)                                                                                     |
| UI 框架         | React 19 + TypeScript                                                                                                      |
| 路由            | React Router v7 (lazy loading)                                                                                             |
| 样式系统          | Tailwind CSS 4 + shadcn/ui new-york 风格                                                                                     |
| Token 体系      | OKLCH 色彩空间 + `:root` / `.dark` 双主题 CSS 变量                                                                                  |
| 组件 primitives | Radix UI（dialog、dropdown-menu、popover、select、tooltip、tabs、collapsible、scroll-area、avatar、checkbox、switch、progress、slider…） |
| 变体管理          | class-variance-authority (CVA)                                                                                             |
| 命令面板          | cmdk（⌘K 全局搜索）                                                                                                              |
| 抽屉            | vaul（移动端拖拽 drawer）                                                                                                         |
| 动画工具          | tw-animate-css + Framer Motion                                                                                             |
| 状态管理          | Zustand v5                                                                                                                 |
| HTTP          | Axios（拦截器 + Token 刷新）                                                                                                      |
| 表格            | TanStack React Table v8                                                                                                    |
| 国际化           | react-i18next（6 种语言）                                                                                                       |
| 图标            | lucide-react                                                                                                               |
| 提示            | react-hot-toast（浅色边框样式）                                                                                                    |
| Markdown      | react-markdown + 自研 markdown2                                                                                              |
| 主题切换          | 自研 ThemeProvider + `<html class="dark">`                                                                                   |
| 字体            | **Inter**（标题+正文统一）+ **JetBrains Mono**（代码）                                                                                 |

### 2.2 架构分层

```
用户操作 → Pages → Components (ui/shared/common/业务域) → Hooks → API (axios) → 后端
                                              ↕
                                        Stores (Zustand)
```

| 层       | 目录                                                                 | 职责                                                                                                        |
|---------|--------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| 页面层     | `src/pages/`                                                       | 按功能域划分的路由页面                                                                                               |
| 基础组件层   | `src/components/ui/`                                               | shadcn/ui 组件（Button/Input/Dialog/Select…）                                                                 |
| 模板组件层   | `src/components/shared/`                                           | PageHeader / StatCard / EmptyState 等业务通用模板                                                                |
| 通用组件层   | `src/components/common/`                                           | 兼容层：保留 MediaPreview / DocumentPreview / SearchInput / ConfirmDialog / Toast 等复杂自研组件；简单组件作为 shim 转发到 `ui/` |
| 主题层     | `src/components/theme/`                                            | ThemeProvider / ThemeToggle                                                                               |
| 布局层     | `src/components/layout/`                                           | AppLayout / Sidebar / Header / MobileNav                                                                  |
| 业务组件    | `src/components/{knowledge,chat,generation,tlf,billing,form,data,auth,…}/` | 业务域专属组件                                                                                                   |
| Hook 层  | `src/hooks/`                                                       | 共享逻辑（认证 / 分页 / 防抖 / SSE / 轮询）                                                                             |
| Store 层 | `src/stores/`                                                      | Zustand 全局状态管理                                                                                            |
| API 层   | `src/api/`                                                         | Axios 请求封装（按模块）                                                                                           |
| 类型层     | `src/types/`                                                       | TypeScript 类型定义                                                                                           |
| 工具层     | `src/utils/` `src/lib/`                                            | 常量 / 格式化 / 校验 / 存储 / `cn`                                                                                 |
| 国际化     | `src/i18n.ts` + `public/locales/`                                  | i18next 配置 + 翻译文件                                                                                         |

---

## 三、目录结构（关键路径）

```
frontend/src/
├── api/                          # Axios 模块（auth / chat / documents / knowledge / generation …）
├── components/
│   ├── ui/                       # shadcn/ui new-york（20+ 个）
│   │   ├── button.tsx, input.tsx, label.tsx, textarea.tsx
│   │   ├── card.tsx, badge.tsx, separator.tsx, skeleton.tsx, spinner.tsx
│   │   ├── dialog.tsx, alert-dialog.tsx, sheet.tsx, drawer.tsx
│   │   ├── dropdown-menu.tsx, select.tsx, popover.tsx, tooltip.tsx
│   │   ├── tabs.tsx, collapsible.tsx, scroll-area.tsx, avatar.tsx
│   │   ├── progress.tsx, switch.tsx, checkbox.tsx
│   │   ├── command.tsx (cmdk), pagination.tsx, breadcrumb.tsx
│   │   ├── alert.tsx, table.tsx
│   ├── shared/                   # 业务通用模板
│   │   ├── PageHeader.tsx        # 面包屑 + 标题 + 描述 + 操作 + 图标盒
│   │   ├── StatCard.tsx          # 统计卡（数字 + 趋势 + 图标）
│   │   ├── EmptyState.tsx        # 空状态
│   │   └── index.ts              # 统一导出
│   ├── theme/
│   │   ├── ThemeProvider.tsx     # 自研主题 Provider（light/dark/system）
│   │   └── ThemeToggle.tsx       # 主题切换按钮
│   ├── layout/
│   │   ├── AppLayout.tsx         # 主布局（响应式 + Sheet 移动菜单）
│   │   ├── Sidebar.tsx           # 双侧栏（左 w-20 模块图标 + 右 w-52 二级菜单 + 用户 Popover）
│   │   ├── Header.tsx            # h-14，⌘K 搜索 + 主题切换 + 通知 + 操作手册（VITE_MANUAL_URL，未配置则隐藏）+ 语言 + 用户菜单
│   │   └── MobileNav.tsx         # 移动端底部 5 tab（首页/资产/创发/分析/我的）
│   ├── common/                   # 自研保留 + shim 兼容层
│   │   ├── MediaPreview.tsx      # 全屏灯箱（图/视频/音频，深色 overlay 合理保留）
│   │   ├── DocumentPreview.tsx   # 文档预览（pdf/docx/xlsx/pptx/md 等）
│   │   │                         #   （DocumentPreviewModal 同文件导出）
│   │   ├── ArticlePreviewModal.tsx
│   │   ├── ConfirmDialog.tsx     # AlertDialog 包装
│   │   ├── DateTimePicker.tsx
│   │   ├── SearchInput.tsx       # Input + Search 图标
│   │   ├── Spinner.tsx           # Loader2 包装
│   │   ├── Toast.tsx             # react-hot-toast 浅色样式
│   │   ├── Button.tsx, Input.tsx, Modal.tsx, Drawer.tsx,
│   │   ├── Select.tsx, Badge.tsx, Avatar.tsx,
│   │   ├── Pagination.tsx, EmptyState.tsx
│   │   └── # 上述简单组件均为 shim，内部转发到 @/components/ui/*
│   ├── data/                     # DataTable / StatCard
│   ├── form/                     # FormField / TextArea / FileUpload / RichTextEditor / TagInput …
│   ├── auth/                     # ProtectedRoute / 手机号输入 / 短信验证码 / 滑块验证 …
│   ├── knowledge/                # 业务表单 + 搜索结果（5 个）
│   ├── chat/                     # 对话窗口、输入框、消息气泡 …（16 个）
│   ├── generation/               # 生成配置、提示输入、参考素材选择 …（11 个组件）
│   ├── tlf/                      # 国内/海外发布：账号授权、平台徽标、分发配置 …
│   └── billing/ notice/ notification/ trafficSecret/ markdown2/
├── hooks/                        # useAuth / usePagination / useDebounce / useMediaQuery / useSSE / useTaskPolling / useNotificationRefresh
├── lib/
│   └── utils.ts                  # cn() 合并 class 工具（clsx + tailwind-merge）
├── pages/                        # 页面（auth/dashboard/knowledge/documents/media/chat/generation/tlf/review/account/settings/errors …）
├── router/index.tsx              # 路由表（4 大模块组织 + ProtectedRoute）
├── stores/                       # authStore / uiStore / chatStore / generationStore / knowledgeStore / notificationStore / subscriptionStore / captchaStore
├── types/                        # API + 业务实体类型定义
├── utils/                        # constants / format / validators / storage / helpers
├── i18n.ts                       # i18next 配置
├── App.tsx                       # 根（ThemeProvider + RouterProvider + Toaster）
├── main.tsx                     # 入口（hydrate authStore）
└── index.css                     # Tailwind 4 + @theme + 双主题 CSS 变量 + 工具类
```

---

## 四、路由结构（4 模块顶层 + 业务路径保留）

侧边栏按 **4 大模块** 组织视觉分组，但底层路径**沿用业务命名**避免破坏书签：

```
首页 Home
  /dashboard, /chat, /chat/:sessionId

资产管理 Assets
  /knowledge/{companies,brands,products,customers,cases,search,finder}
  /documents, /documents/:id
  /media/{images,videos,audios}

创作分发 Execute
  /generation/{article,image,video,library,library/:id,auto-schedule,auto-schedule/new,auto-schedule/edit/:id}
  /tlf/{accounts,publish,tasks,tasks/:id}   # 发布：国内灵径平台 + 海外 Composio 平台（tlfPlatforms.ts）

数据分析 Review
  /review/{dashboard,content,channels}

系统 / 账户（无 Sidebar 菜单，入口在用户菜单 / Header）
  /settings, /feedback, /referral
  /account/{subscription,billing-details,notifications}

公开页
  /login, /register, /forgot-password, /legal/:doc, /pricing, /403
```

`ProtectedRoute` 包裹需认证路由，`roles` 属性做 RBAC。

---

## 五、设计系统（浅色 + 双主题 + shadcn new-york）

> **主色**：品牌紫 `oklch(0.55 0.25 285)` ≈ `#7C3AED`
> **浅色版面**：`oklch(0.985 0.002 270)` ≈ `#F5F6FA` 极淡灰白
> **暗色 L0**：`oklch(0.14 0.005 285)` 深炭黑

### 5.1 OKLCH Token（`:root` + `.dark` 双套）

定义在 `src/index.css`，所有颜色通过 CSS 变量 + Tailwind `bg-*` / `text-*` / `border-*` 工具类引用。

**浅色主题（`:root`）核心 token：**

| Token                                  | 值                        | 用途                   |
|----------------------------------------|--------------------------|----------------------|
| `--background`                         | `oklch(0.985 0.002 270)` | 页面底色                 |
| `--foreground`                         | `oklch(0.2 0.01 260)`    | 主文字                  |
| `--card`                               | `oklch(1 0 0)`           | 卡片白底                 |
| `--card-foreground`                    | `oklch(0.2 0.01 260)`    | 卡片内文字                |
| `--popover`                            | `oklch(1 0 0)`           | 弹出层                  |
| `--primary`                            | `oklch(0.55 0.25 285)`   | 品牌紫 / 主色             |
| `--primary-foreground`                 | `oklch(0.99 0 0)`        | 主色按钮文字               |
| `--secondary` / `--muted` / `--accent` | `oklch(0.96 0.005 270)`  | 次级灰                  |
| `--muted-foreground`                   | `oklch(0.55 0.01 260)`   | 辅助文字                 |
| `--destructive`                        | `oklch(0.55 0.22 25)`    | 警示红                  |
| `--border` / `--input`                 | `oklch(0.93 0 0)`        | 边框                   |
| `--ring`                               | `oklch(0.55 0.25 285)`   | 聚焦环                  |
| `--radius`                             | `0.75rem`                | 圆角基准（衍生 sm/md/lg/xl） |

**Sidebar 专属（白底紫激活）：**

- `--sidebar: oklch(1 0 0)`，`--sidebar-accent: oklch(0.96 0.02 285)`，`--sidebar-primary: oklch(0.55 0.25 285)`

**暗色主题（`.dark`）TikTok 层级体系：**

- L0 背景 `oklch(0.14 0.005 285)` → L1 卡片 `oklch(0.22 0.008 285)` → L2 弹出 `oklch(0.28 0.008 285)` → L3 高亮 `oklch(0.34 0.02 285)`，每层亮度差 ≥0.06

### 5.1.1 内容类型语义色（跨模块统一规范）

> 文章/图片/视频/音频四类内容在全系统颜色保持一致；浅色与暗色下各自有合适色值（暗色加亮）。

| 内容类型           | Token               | 浅色值                                | 暗色值                    |
|----------------|---------------------|------------------------------------|------------------------|
| 📝 **文章 / 文档** | `--content-article` | `oklch(0.55 0.2 262)`（blue Word 深蓝） | `oklch(0.68 0.2 262)`  |
| 🖼️ **图片**     | `--content-image`   | `oklch(0.65 0.18 145)`（emerald）    | `oklch(0.72 0.18 145)` |
| 🎬 **视频**      | `--content-video`   | `oklch(0.6 0.22 15)`（rose/red）     | `oklch(0.68 0.22 15)`  |
| 🎵 **音频**      | `--content-audio`   | `oklch(0.65 0.15 230)`（sky）        | `oklch(0.72 0.15 230)` |

**Tailwind 用法**：`bg-content-article`、`text-content-image`、`border-content-video/20` 等（color token 已注册到 `@theme inline`）。

**⚠️ 禁止**：为这四种类型使用其他颜色（如把视频标为紫色），保持跨模块颜色语义一致。

#### 平台徽标色（与内容语义色同一套色系，**全站统一复用**）

国内分发平台的徽标着色统一由 `src/utils/tlfPlatforms.ts` 提供，与上面四类内容同一套色系风格（rose / emerald / sky / amber / primary 紫）：

- 每个平台在 `TLF_PLATFORMS` 里带 `tone` 字段；色调 → class 表为 **`PLATFORM_TONE_CLASS`**，取色助手 **`platformToneClass(code)`**。
- 渲染平台徽标**一律**用 `<PlatformBadge code={...} />`（`components/tlf/PlatformBadge.tsx`，内部走 `platformToneClass`），或直接用 `platformToneClass(code)`。已应用：国内发布选平台、创作大师（Skill）下拉的平台标签等。
- **⚠️ 禁止**在别处另写平台颜色（如 `bg-primary/10 text-primary` 硬编码平台 pill）——一律复用该表，保证国内发布与创作大师等处颜色一致。

### 5.1.2 文件类型图标 / 徽章规范

定义于 `src/utils/fileTypes.ts`（`FILE_TYPE_MAP`），含 `.pdf` / `.docx` / `.xlsx` / `.pptx` / `.md` / `.html` / `.csv` / `.txt` 等 13+ 扩展名，每项包含 `icon` / `iconClass` / `badgeClass` /
`label`。`DocumentListPage`、`DocumentPreview` 等统一从此处导入，**禁止页面内重复定义**。

### 5.2 字体

```
--font-sans / --font-display / --font-body: 'Inter', system-ui, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif
--font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace
```

仅加载 `Inter:wght@400;500;600;700;800` + `JetBrains Mono:wght@400;500`，**不引入新字族**。

### 5.3 圆角、阴影、间距

- **圆角**：`--radius: 0.75rem`（基准），衍生 `sm/md/lg/xl`（`calc(... - 4px / - 2px / + 0 / + 4px)`）
- **阴影**：`.shadow-soft`、`.shadow-card`（极淡阴影 1-3px 模糊），`.card-lift`（hover 提升 8-24px）
- **间距**：Tailwind 标准 spacing scale；卡片内 `p-4` / `p-6`，页面区块间 `gap-6`

### 5.4 主题切换

```tsx
// 顶层包裹
<ThemeProvider defaultTheme="light">{children}</ThemeProvider>

// 任何组件内读取/切换主题
const {theme, setTheme, resolvedTheme} = useTheme()
setTheme('light' | 'dark' | 'system')
```

实现：`localStorage.theme` 存储用户偏好 + `document.documentElement.classList.toggle('dark')`。`system` 监听 `prefers-color-scheme` 变化。

### 5.5 z-index 层级约定

| 层级                                               | z-index    | 组件               |
|--------------------------------------------------|------------|------------------|
| 通用 Portal（Dropdown / Tooltip / Popover / Select） | `z-50`     | Radix 默认         |
| Dialog / Sheet / Drawer                          | `z-50`     | shadcn           |
| AlertDialog（ConfirmDialog 内）                     | `z-[60]`   | 略高于普通 Dialog     |
| DocumentPreviewModal backdrop                    | `z-[9998]` | 略低于 MediaPreview |
| MediaPreview（全屏灯箱）                               | `z-[9999]` | 最顶层              |

---

## 六、核心组件 API

### 6.1 shadcn ui/* 速查（一律从 `@/components/ui/*` 引用）

| 组件                                                                                                   | 关键 Props                                                                                                                                         | 备注                                                         |
|------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| `Button`                                                                                             | `variant: default \| destructive \| outline \| secondary \| ghost \| link`, `size: default \| sm \| lg \| icon \| icon-sm \| icon-lg`, `asChild` | CVA 实现，**已内置 `cursor-pointer`**                            |
| `Input` / `Textarea` / `Label`                                                                       | 原生 HTMLInputElement 属性                                                                                                                           | `focus-visible:ring-ring/50` 紫色 focus 环                    |
| `Card` / `CardHeader` / `CardTitle` / `CardContent` / `CardFooter`                                   | `<div>` 属性                                                                                                                                       | `bg-card text-card-foreground rounded-xl border shadow-sm` |
| `Badge`                                                                                              | `variant: default \| secondary \| destructive \| outline \| success \| warning \| info`                                                          | shadcn 基础 + 我们扩展的语义 variant                                |
| `Dialog` (`Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`) | open/onOpenChange                                                                                                                                | 受控/非受控均支持                                                  |
| `AlertDialog`                                                                                        | open/onOpenChange + Action/Cancel                                                                                                                | 用于危险操作确认                                                   |
| `Sheet`                                                                                              | `side: top \| right \| bottom \| left`                                                                                                           | 移动菜单首选                                                     |
| `Drawer`                                                                                             | vaul 拖拽抽屉                                                                                                                                        | 移动端底部模态                                                    |
| `DropdownMenu` / `Select` / `Popover` / `Tooltip`                                                    | Radix 标准                                                                                                                                         | 自动 Portal + 紫色聚焦                                           |
| `Tabs` / `Collapsible` / `ScrollArea` / `Avatar`                                                     | Radix 标准                                                                                                                                         | —                                                          |
| `Command`                                                                                            | cmdk 命令面板                                                                                                                                        | Header 的 ⌘K 搜索使用 `CommandDialog`                           |
| `Pagination` (`PaginationContent`, `PaginationLink`, `PaginationPrevious`, `PaginationNext`)         | 页码列表组件                                                                                                                                           | 自动 cursor-pointer                                          |
| `Breadcrumb`                                                                                         | 面包屑组件                                                                                                                                            | 通常被 `PageHeader.breadcrumbs` 包装                            |
| `Alert` / `Progress` / `Switch` / `Checkbox`                                                         | Radix 标准                                                                                                                                         | —                                                          |
| `Spinner`                                                                                            | `size: sm \| md \| lg \| xl`                                                                                                                     | `Loader2 + text-primary`                                   |

### 6.2 shared/* 模板（一律从 `@/components/shared` 引用）

```tsx
// PageHeader：所有页面顶部统一使用
<PageHeader
    title="企业管理"
    description="管理品牌主体与企业资料"
    icon={Building2}                    // 可选，会渲染图标盒
    breadcrumbs={[{label: '资产管理'}, {label: '企业'}]}
    actions={<Button>新建</Button>}
/>

// StatCard：仪表盘统计卡
<StatCard
    title="累计阅读"
    value="12.4K"
    icon={TrendingUp}
    trend={{value: 12.5, isPositive: true}}
    description="较上月"
/>

// EmptyState：列表空状态
<EmptyState icon={Inbox} title="暂无数据" description="…" action={<Button>新建</Button>}/>
```

### 6.3 保留的复杂自研组件（继续从 `@/components/common/*` 引用）

| 组件                                         | 用途                                                                  |
|--------------------------------------------|---------------------------------------------------------------------|
| `MediaPreview`                             | 全屏图/视频/音频灯箱；半透明黑色 overlay（合理保留）+ 浅色 UI 元素；支持多资源切换、键盘导航、提示词侧栏        |
| `DocumentPreview` / `DocumentPreviewModal` | 文档预览（pdf/docx/xlsx/pptx/md…）；**优先传 `fileType` 而非依赖 `fileName` 扩展名** |
| `ConfirmDialog`                            | 危险操作确认，内部用 `AlertDialog`                                            |
| `Toast`                                    | `react-hot-toast` 浅色样式包装；`toast.success/error/loading`              |
| `SearchInput`                              | `<Input>` + `Search` 图标 + 清空按钮                                      |

### 6.4 兼容 Shim（旧 `common/*` 简单组件）

`common/Button`、`common/Input`、`common/Modal`、`common/Drawer`、`common/Select`、`common/Badge`、`common/Avatar`、`common/Pagination`、
`common/Spinner`、`common/EmptyState` 是 **shim 层**：内部为 `@/components/ui/*` 的薄包装，保留自有 API（如 `variant: 'primary' | 'accent' | 'danger'`、`color: 'cyan' | 'green' | 'purple'`）。

**新代码请直接从 `@/components/ui/*` 引用**；旧代码无需改 import 即可获得浅色视觉。

### 6.5 数据组件

| 组件          | 关键 Props                                                                         | 说明                                                                 |
|-------------|----------------------------------------------------------------------------------|--------------------------------------------------------------------|
| `DataTable` | `columns`, `data`, `loading`, `pagination`, `toolbar`, `onRowClick`, `emptyText` | TanStack Table + `bg-card rounded-xl border`，行 hover `bg-muted/50` |

### 6.6 业务组件域

| 目录            | 组件                                                                                                                                                                            |
|---------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `chat/`       | ChatWindow, ChatComposer, MessageBubble, SessionDrawer, ReferenceDialog, AbilityShortcuts, QuickToolGrid, InspirationBoard, FastParamsDropdown, FastParamsPanel, FastTypeSelector, AudioPlayer, ExportCard, GenerationCard, UploadCard, VoiceButton |
| `knowledge/`  | ProductForm, CustomerForm, CaseForm, SearchResult, ChunkViewer                                                                                                                |
| `generation/` | GenerationConfigPanel, PromptInput, ProviderSelector, SizeSelector, MultiRefImageUpload, ImageLibraryPicker, ReferenceContentSelector, SkillSelector, SkillPickerDialog, FeatureToggle, FieldLabel |
| `tlf/`        | AuthDialog, DistributionConfig, PlatformBadge, PlatformLogo, MediaPicker, ArticleBodyEditor, RegionSelectDialog, RegionTabs, RiskControlDialog                                |
| `form/`       | FormField, TextArea, FileUpload, BatchUploadPanel, MinioImageUpload, TagInput, RichTextEditor, ColorPicker                                                                    |

---

## 七、核心工作流

### 7.1 认证

```
LoginPage 表单 → authApi.login → access_token + refresh_token
  → authStore.login() 写 localStorage 与内存
  → Axios 拦截器自动注入 Authorization
  → 401 自动 refresh，失败跳 /login
```

### 7.2 API 请求

```
组件 → src/api/*.ts → Axios → /api/v1/* (Vite dev proxy → :8020)
拦截器:
  request: 注入 Bearer token
  response: 解包 ApiResponse.data；401 尝试 refresh + 重试；其他抛 ApiError
```

### 7.3 AI 对话（SSE）

```
ChatPage → chatApi.sendMessage (fetch + ReadableStream)
useSSE 解析:
  type: "context" → 显示引用来源
  type: "content" → 逐字追加到 MessageBubble
  type: "done"    → 完成
chatStore 更新消息列表
```

### 7.4 内容生成（异步任务）

```
generationApi.create(params) → 后端返回 task_id
useTaskPolling 定时轮询 status
<Progress> 显示进度
完成后载入结果 → 内容库 / 生成内容详情页；图片/视频/音频预览用 MediaPreview
```

---

## 八、状态管理（Zustand）

| Store             | 关键状态                                | 持久化                                    |
|-------------------|-------------------------------------|----------------------------------------|
| `authStore`       | token / user / isAuthenticated      | localStorage                           |
| `uiStore`         | sidebarOpen / language              | localStorage（主题由 `ThemeProvider` 独立处理） |
| `chatStore`       | sessions / activeSession / messages | 否                                      |
| `generationStore` | tasks / currentTask                 | 否                                      |
| `knowledgeStore`  | searchResults / filters             | 否                                      |

`main.tsx` 启动时调用 `authStore.getState().hydrate()` 恢复登录态。

---

## 九、国际化

- 6 种语言: `zh-CN`（默认）, `en`, `ko`, `ja`, `fr`, `es`（均为 LTR，以 `public/locales` 目录为准）
- 翻译文件: `public/locales/{lang}/translation.json`
- 组件内: `const { t } = useTranslation()` + `t('key', 'fallback')`
- 4 模块菜单 key 已新增在 `menu.modules.{home,assets,execute,review,profile}` + `menu.modules.{...}Desc` 描述

---

## 十、AI 编码注意事项

### ⚠️ 语言规范（最高优先级）

- **默认语言为简体中文（zh-CN）**，本系统面向中文客户群体
- 所有页面文本、提示信息、placeholder、toast 消息等 **必须优先提供中文翻译**
- 使用 `t('key')` 时 **禁止仅写英文 fallback 而不在 `zh-CN/translation.json` 中添加对应中文翻译**
- 如果编码时偶尔遗漏多语言，**默认使用中文**，不要默认英文

### ⚠️ 主题与 Token 规范

- **必须使用 OKLCH token 工具类**：`bg-background` / `bg-card` / `bg-popover` / `bg-muted` / `bg-primary` / `bg-secondary` / `bg-accent` / `bg-destructive`、`text-foreground` /
  `text-muted-foreground` / `text-primary` / `text-primary-foreground`、`border-border` / `border-input` / `ring-ring`。
- **禁止硬编码颜色**：不写 `#FFFFFF` / `#000000` / `#7C3AED` 等具体十六进制，避免破坏暗色模式
- **禁止动态拼接 class**：`bg-${color}/10` 在 Tailwind 4 无法静态分析，必须改为完整字符串或 inline style
- **开发时主题自检**：每次提交前切到 `.dark` 视觉过一遍，确保暗色无视觉问题
- **新写代码不要再用旧霓虹 token**（`bg-neon-cyan`、`text-text-primary`、`glass-card`、`tech-dots` 等）— 这些仅作为 shim 兼容旧组件，新代码请用 shadcn 语义化 token

### ⚠️ cursor-pointer — 已在 shadcn ui/* 内置

shadcn 的 `Button` / `DropdownMenuItem` / `SelectTrigger` 等已内置 `cursor-pointer`。但**自定义的 `<button>` / `<div onClick>` 仍需手动添加 `cursor-pointer`**（Tailwind CSS 4 重置了浏览器默认手型光标）。

```tsx
// ✅ 已内置
<Button onClick={...}>提交</Button>
<DropdownMenuItem onClick={...}>项</DropdownMenuItem>

// ✅ 自定义按钮需手动加
<button onClick={...} className="cursor-pointer rounded-lg p-2 hover:bg-accent">…</button>
```

**例外**：`<a href="...">` 链接由浏览器自动处理。

### ⚠️ 设计系统禁止事项

- **禁止白色硬编码卡片**：`bg-white shadow-*` → 改用 `bg-card rounded-xl border`
- **禁止旧自研 Button variant API 用于新代码**：`<Button variant="primary">` 在 shim 中仍可用，但新代码请用 shadcn 标准 `<Button variant="default">`
- **所有弹出层必须用 shadcn 包装**：`Dialog` / `Sheet` / `Drawer` / `AlertDialog` / `Popover` / `DropdownMenu`，禁止裸条件渲染 + Portal + Framer Motion 自造弹层
- **z-index 严格按 §5.5 约定**
- **不引入新字体**：字体栈已固定 Inter + JetBrains Mono

### 10.1 代码规范

- **TypeScript 严格模式**：所有组件、函数必须有完整类型注解，避免 `any`
- **路径别名**：始终使用 `@/` 而非相对路径
- **`cn()` 工具**：`@/lib/utils` 导出，合并 class（clsx + tailwind-merge）
- **组件命名**：文件名 PascalCase，默认导出组件名与文件名一致；shadcn ui/* 用小写文件名 `button.tsx` / `dialog.tsx`，导出 `Button` / `Dialog` 等命名
- **CSS**：使用 Tailwind 工具类 + 设计系统 token；不写内联 style（除特殊渐变文字、动态计算尺寸等场景）
- **状态**：组件级状态用 `useState`；跨组件/页面状态用 Zustand store
- **导入顺序**：React → 第三方库 → 内部 API / Stores / Types → 内部组件（`@/components/ui` → `@/components/shared` → `@/components/{业务域}`） → hooks / utils

### 10.2 新增页面检查清单

1. **页面顶部必须用 `<PageHeader>`**，**只允许两种样式**（禁止裸 `<header>` 自绘 IconBox / 用 `gradient-text-cyan` / size-10 圆角等旧风格）：

   **A. 带导航三级面包屑**——Sidebar 菜单可达的业务页面：
   ```tsx
   <PageHeader
     title={t('menu.xxx', '...')}
     description="..."
     icon={SomeIcon}
     iconAccent="image"  // 跟内容类型/语义匹配
     breadcrumbs={[
       { label: '资产管理' },     // 一级模块名（与 Sidebar 模块翻译一致）
       { label: '公司信息' },     // 二级子组名（与 Sidebar 子组翻译一致）
       { label: t('menu.companies', '企业') }, // 三级当前页（与 Sidebar 子项翻译一致）
     ]}
     actions={<Button>...</Button>}
   />
   ```
   ⚠️ **breadcrumb 文案必须与 Sidebar 翻译键一致**——以下是当前规范的一/二级名称表（不要自造同义词如 "海外分发" / "知识查找子组"）：
   - 资产管理 → 公司信息 / 媒体 / **知识检索**（子组名是"知识检索"，子项才有"知识查找"和"精准检索"）
   - 创作分发 → 内容创作 / **国内发布**

   **B. 无导航**——没有 Sidebar 菜单入口的页面（生成历史 / 设置 / 订阅与账单 / 消息通知 / 各种详情页等）：
   ```tsx
   <PageHeader
     title="..."
     description="..."
     icon={SomeIcon}
     iconAccent="primary"
     actions={<Button>...</Button>}  // 可选
     // ⚠️ 不传 breadcrumbs
   />
   ```

   两种样式的视觉差异仅在于是否渲染面包屑导航条；IconBox 一律 `size="md"`（size-11），与文字块 `items-center` 垂直居中对齐。
2. **主内容用 `Card` 或 `bg-card rounded-xl border` 包裹**，禁止 `bg-white`
3. **在 `src/types/` 添加 TypeScript 类型**
4. **在 `src/api/` 创建 API 模块**
5. **在 `src/router/index.tsx` 注册路由**（`lazy()` 懒加载）
6. **在 `src/components/layout/Sidebar.tsx` 添加菜单项**（决定属于哪个模块：home / assets / execute / review）
7. **多语言文本**：必须在 `public/locales/zh-CN` 和 `en` 添加翻译键（其他语言可后续补）
8. **`ProtectedRoute` 包裹**（公开页除外）

### 10.3 组件开发规范

- 通用组件放 `components/ui/`（小写文件名），业务通用模板放 `components/shared/`，业务专属组件按域放对应子目录
- 优先复用 shadcn ui 而非自己造轮子
- 弹层一律用 `Dialog` / `Sheet` / `AlertDialog` / `Popover` / `DropdownMenu`
- 媒体预览统一用 `MediaPreview`、文档预览统一用 `DocumentPreview` / `DocumentPreviewModal`
- 表单字段用 `FormField` + `Input` / `Textarea` / `Select` 组合
- 所有 props 定义 `interface` 并导出

### 10.4 API 调用规范

- **不要** 在组件中直接 `axios`，始终通过 `src/api/*` 模块
- 所有 API 返回类型使用 `src/types/` 中定义的接口
- 分页请求用 `usePagination` hook
- 长轮询用 `useTaskPolling` hook
- SSE 用 `useSSE` hook

### 10.5 样式与响应式

- Tailwind CSS 4（CSS-based 配置，在 `index.css` 中用 `@theme`）
- 移动端适配：使用 `md:` `lg:` 断点前缀，移动端优先
- `useIsMobile` hook 检测断点
- 侧边栏在移动端自动收起，使用 `MobileNav` 底部导航 + 顶部汉堡菜单（`Sheet`）
- `prefers-reduced-motion` 自动压缩动画至 0.01ms

### 10.6 关键文件速查

| 需求            | 文件                                                                  |
|---------------|---------------------------------------------------------------------|
| 添加新页面         | `router/index.tsx` → `pages/` → `components/layout/Sidebar.tsx`（菜单） |
| 添加 API        | `api/index.ts`（Axios 实例） → 新 `api/*.ts`                             |
| 修改全局状态        | `stores/*.ts`                                                       |
| 修改认证逻辑        | `stores/authStore.ts` + `hooks/useAuth.ts` + `api/auth.ts`          |
| 修改主题色 token   | `src/index.css`（`:root` / `.dark` 块）                                |
| 添加新 shadcn 组件 | `src/components/ui/*.tsx`（`npx shadcn@latest add <组件>`，new-york 风格） |
| 添加翻译          | `public/locales/` 6 个 JSON                                          |
| 修改布局          | `components/layout/{AppLayout,Sidebar,Header,MobileNav}.tsx`        |
| 修改主题切换        | `components/theme/{ThemeProvider,ThemeToggle}.tsx`                  |
| 修改构建配置        | `vite.config.ts`                                                    |

### 10.7 构建与部署

```bash
cd frontend
npm install
npm run dev          # 开发 (http://localhost:5288)
npm run build        # tsc -b && vite build
npm run lint         # eslint
# 快捷脚本：bash fstart.sh
```

构建产物 dist/ 约 1MB（gzip ~300KB），自动 code splitting 为 30+ 个异步 chunk。

---

## 十一、Vite 配置要点

- **端口**：5288
- **API 代理**：`/api` → `http://localhost:8020`（开发模式跨域）
- **路径别名**：`@` → `./src`
- **插件**：`@vitejs/plugin-react` + `@tailwindcss/vite`
- **版本注入**：`define: { __APP_VERSION__: JSON.stringify(version) }` 读取 `package.json`
- **预优化**：`xlsx`、`highlight.js`、`markdown-it`、`katex`

---

## 十二、旧 token / 组件兼容层

1. **旧 token 别名**：`index.css` 通过 `@theme inline` 把 `bg-bg-deep` / `text-text-primary` / `text-neon-cyan` 等旧 class 别名到当前 OKLCH token，存量代码无需改 className
2. **`@/components/common/*` shim**：简单组件内部转发到 `ui/*`，保留自有 API（见 §6.4）
3. `gradient-text` 紫色渐变文字仅在 Logo / Hero 使用
4. **新代码**：请直接用 shadcn 语义化 token，不要新增 `neon-*` / `glass-card` / `bg-bg-*` 等旧 class

---

## 十三、设计系统（玻璃 · 渐变 · 分层阴影）

### 13.1 阴影分层（5 级 + 1 光晕）

`index.css` 在 `@theme inline` 中暴露以下 token，自动生成对应 Tailwind 工具类：

| 类名             | 用途                        | 实现             |
|----------------|---------------------------|----------------|
| `shadow-xs`    | 微阴影：分隔表面、Header、按钮        | 1px + 4%/oklch |
| `shadow-soft`  | 卡片基础阴影（默认）                | 2 层 oklch 极淡   |
| `shadow-card`  | 卡片提升 (elevated)、表单容器      | 2 层 6% 偏移      |
| `shadow-pop`   | 卡片 hover、Popover、Dropdown | 2 层 8% 偏移      |
| `shadow-modal` | Modal、Drawer、Sheet        | 2 层强阴影 (12%)   |
| `shadow-glow`  | AI 处理中光晕（仅强 CTA / Hero）   | 紫色双层光晕         |

**规则**：

- 默认卡片用 `card-base`（含 `shadow-soft`）
- hover 提升用 `card-hover` utility（`-translate-y-0.5 + shadow-pop`）
- Modal、Drawer、Sheet 内置 `shadow-modal`
- `shadow-glow` 仅用于 Hero、AI 生成中卡片、强引导 CTA，不滥用

### 13.2 玻璃质感（3 级 + 1 overlay）

| Utility         | 用途                                                |
|-----------------|---------------------------------------------------|
| `glass-soft`    | Header、Sticky toolbar，浅磨砂（10px blur）              |
| `glass`         | 默认玻璃（16px blur），通用浮层、悬浮卡                          |
| `glass-strong`  | Hero / Floating panel，含阴影（20px blur + shadow-pop） |
| `glass-overlay` | 全屏 overlay（MediaPreview、DocumentPreviewModal 背景）  |

暗色主题下所有 glass-* 自动调整为 `oklch(0.22 0.008 285 / 0.7~0.85)`。

### 13.3 装饰光斑 blob（5 色）

```tsx
<div className="relative overflow-hidden">
    <div className="blob-primary -top-20 -left-16 size-72 opacity-60" aria-hidden/>
    <div className="blob-rose -bottom-24 -right-12 size-64 animate-blob" style={{animationDelay: '8s'}} aria-hidden/>
    {/* 内容层 */}
    <div className="relative z-10">...</div>
</div>
```

5 色变体：`blob-primary` / `blob-rose` / `blob-amber` / `blob-emerald` / `blob-sky`。`animate-blob` 提供 30 秒慢漂移动画。父级必须 `relative overflow-hidden`。

### 13.4 渐变边框 `.gradient-border`

用 `mask-composite` 绘制 1px 渐变描边，无外部 box，适合特色卡片：

```tsx
<div className="gradient-border p-6 shadow-card">
    <!-- ::before 会渲染紫粉渐变 1px 边框 -->
</div>
```

色彩变体：`.gradient-border-sky` / `.gradient-border-emerald` / `.gradient-border-amber` / `.gradient-border-rose`。

### 13.5 卡片层级 utility（4 级）

| Utility         | 视觉                                      | 用途                |
|-----------------|-----------------------------------------|-------------------|
| `card-base`     | 边框 + `shadow-soft` + radius-lg          | 默认卡片（列表项、详情区）     |
| `card-elevated` | 边框 + `shadow-card`                      | 重点区块（页面主卡、设置组）    |
| `card-hover`    | hover 时上提 3px + 紫色光晕 + 紫色 border tint（spring 缓动 1.3 overshoot） | 列表网格卡（图片/视频/文档/客户/产品/案例/内容库/发布卡）|
| `card-feature`  | 同 elevated + `relative overflow-hidden` | 特色卡片（配合装饰光斑）      |

**禁止**：再写 `glass-card rounded-2xl border border-white/[0.06]` 这类硬编码组合。

### 13.6 共享模板（9 个）

`@/components/shared/` 导出以下模板，**新页面优先组合这些模板而非自行实现**：

| 模板              | API 摘要                                                                                              | 用途                 |
|-----------------|-----------------------------------------------------------------------------------------------------|--------------------|
| `PageContainer` | `size: 'sm'\|'full'`（`md`/`lg`/`xl` 等效 `full`）                                                     | 页面容器（默认全宽，见 §14.6） |
| `PageHeader`    | `title, description, icon, iconAccent, breadcrumbs, actions, eyebrow`                               | 页面顶部标题区，含 IconBox  |
| `IconBox`       | `icon, accent, size='sm'\|'md'\|'lg'\|'xl'`                                                         | 渐变图标盒（10+ accent）  |
| `StatCard`      | `title, value, icon, iconAccent, description, trend`                                                | 仪表盘统计卡             |
| `SectionCard`   | `title, description, icon, iconAccent, actions, variant='default'\|'elevated'\|'gradient'\|'plain'` | 带标题栏的内容卡           |
| `Toolbar`       | `search, filters, actions, sticky`                                                                  | 列表页工具栏             |
| `GradientHero`  | `title, description, eyebrow, tone, blobs, animated, actions`                                       | Dashboard / 强引导区   |
| `EmptyState`    | `icon, title, description, action`                                                                  | 空状态                |
| `InfoRow`       | `label, value, icon, stacked`                                                                       | 详情页元信息行            |

**IconBox 配色（10 个 accent）**：

- `primary`（紫粉，默认）
- `article`（**blue** Word 深蓝，文章/文档语义色）
- `image`（emerald，图片）
- `video`（rose，视频）
- `audio`（sky→violet，音频）
- `success` / `info` / `warning`（系统状态色 amber） / `rose` / `neutral`

**PageContainer 尺寸约定**：默认省略 `size`（全宽）；仅登录页双栏等特殊场景用 `size="sm"` 收窄，详见 §14.6。

### 13.7 图标精致化（lucide-react）

**统一 strokeWidth 三档**：

| 场景                                   | strokeWidth |
|--------------------------------------|-------------|
| 默认（IconBox 内、StatCard 图标、PageHeader） | **2.25**    |
| 表格行图标、Sidebar 二级菜单、Header 工具按钮       | **2.1**     |
| 大图标（EmptyState 占位图、空数据 placeholder）  | **2** 或更细   |
| 按钮内强调（CTA、Sidebar Logo）              | **2.4**     |

**尺寸约定**（Tailwind size-*）：

- Sidebar 模块图标：`size-[18px]`
- IconBox `md`（默认）：`size-5`
- 表格行图标：`size-4`
- Button 内图标：`size-4`
- EmptyState 大图标：`size-6` ~ `size-12`

### 13.8 内容类型语义色（跨模块统一，不可换色）

| 类型     | accent    | 主色 OKLCH                       |
|--------|-----------|--------------------------------|
| 📝 文章  | `article` | blue `oklch(0.55 0.2 262)`     |
| 🖼️ 图片 | `image`   | emerald `oklch(0.65 0.18 145)` |
| 🎬 视频  | `video`   | rose `oklch(0.6 0.22 15)`      |
| 🎵 音频  | `audio`   | sky `oklch(0.65 0.15 230)`     |

跨页面（列表 / 详情 / 卡片 / 角标 / 进度条）必须一致。`IconBox accent="article|image|video|audio"` 是唯一正确入口。

> `article` 用 **blue 262°** Word 深蓝调（跟 docx 文件徽章 blue-400 通过明度差档区分；伴色 cyan-500 让 IconBox 渐变跨 62° 明显）。amber 作为系统级 `warning` 状态色，与内容类型色解耦。

### 13.9 新页面套用顺序

```tsx
<PageContainer>
    <PageHeader title="..." description="..." icon={X} iconAccent="..." breadcrumbs={[...]} actions={...}/>
    <Toolbar search={...} filters={...} actions={...}/>
    <SectionCard variant="elevated" icon={...} title="..." actions={...}>
        {/* 主内容 / DataTable / 列表网格 / 表单 */}
    </SectionCard>
</PageContainer>
```

Dashboard / Hero 区改用：

```tsx
<PageContainer>
    <GradientHero tone="primary" eyebrow="..." title="..." description="..." actions={...}/>
    <div className="grid gap-4 ... xl:grid-cols-6">
        <StatCard ... iconAccent="article" />
        ...
    </div>
    <SectionCard variant="gradient" ...>...</SectionCard>
</PageContainer>
```

### 13.10 禁止事项

- ❌ 禁止硬编码图标盒 `<div className="flex size-10 ... bg-gradient-to-br from-neon-...">` → 用 `<IconBox accent="...">`
- ❌ 禁止 `glass-card rounded-2xl border border-white/[0.06]` 组合 → 用 `card-elevated` / `card-base`
- ❌ 禁止页面自定义最大宽度 `mx-auto max-w-6xl ...` → 用 `<PageContainer>`（默认全宽；对话 / 长文特例见 §14.6）
- ❌ 禁止 lucide 图标不设 strokeWidth（默认浏览器 1.5 太细）
- ❌ 禁止用 `style={{ background: 'linear-gradient(135deg, #...)' }}` 硬编码渐变文字 → 用 `bg-gradient-to-r ... bg-clip-text text-transparent` 或 `GradientHero` 自带渐变标题
- ❌ 禁止在 Card / SectionCard 内重复添加 `border bg-card rounded-xl`（已内置）
- ❌ 禁止滥用 `shadow-glow` 与 `ai-glow`（仅 Hero / AI 处理中 / 强 CTA）
- ❌ 禁止在 light 模式下用 `bg-black/30` `text-white` 等硬编码黑白色（用 `glass-overlay`、`text-foreground` 等 token）

---

## 十四、布局与 Sidebar 架构

### 14.1 三层背景递进色板

**精确 RGB，跨页面唯一来源**：

| 层                      | 浅色（必须使用这些 hex） | 暗色（OKLCH）               | 写法                                             |
|------------------------|----------------|-------------------------|------------------------------------------------|
| **L1** 一级 icon 列       | `#FFFFFF`      | `oklch(0.27 0.008 285)` | `bg-[#FFFFFF] dark:bg-[oklch(0.27_0.008_285)]` |
| **L2** 二级菜单面板          | `#FCFBFE`      | `bg-card`（0.22）         | `bg-[#FCFBFE] dark:bg-card`                    |
| **L3** 内容区 + AppLayout | `#F6F5FC`      | `bg-background`（0.14）   | `bg-[#F6F5FC] dark:bg-background`              |

- 浅色：L1 → L3 由浅到深（白 → 极淡冷紫 → 淡冷紫底）
- 暗色：L1 → L3 由浅到深（最亮 → 中 → 最深）
- **绝不**用 `bg-background` 直接表示 L3（颜色不一样）。在 AppLayout / Header 之外的页面想用"页面底色"时，用 `bg-[#F6F5FC] dark:bg-background`

### 14.2 分割线（vertical）

仅用于 L1 ↔ L2、L2 ↔ 内容区两条全高纵向分割线，必须用：

```
bg-[color-mix(in_oklab,#e7e5e4_30%,transparent)] dark:bg-[oklch(0.3_0.008_285)]
```

横向分割线（如 Logo 行底、L2 title 行底、Card header / footer）继续用 `bg-[oklch(0.95_0_0)]` 或 `border-border` 即可，**不要混用 color-mix**。

### 14.3 Sidebar 结构

```
Sidebar (relative)
├── L1 icon 列 (w-[72px], bg #FFFFFF)
│   ├── Logo 区 (h-20)             ← Logo size-12, 含 size-9 SVG, 底部分割线
│   ├── 模块图标列 (gap-0.5)        ← size-9 rounded-md, 激活态左侧 3px 渐变指示条
│   └── 用户菜单 Popover (底部)
└── L2 菜单面板
    ├── 展开态 (w-56, bg #FCFBFE)
    │   ├── 标题行 (h-14)          ← size-7 rounded-md 模块图标 + 标题文字
    │   └── 菜单列表 (px-2.5)
    │       ├── 顶级 items (无分组)
    │       └── 分组 (静态)         ← 小灰色 uppercase 标题 + 平铺 items，**不要 Collapsible**
    └── 折叠态 (w-14, bg #FCFBFE)
        ├── 顶部 (h-14)             ← 显示当前模块 IconBox
        └── 二级项 (icon-only, 带 Tooltip)
```

**关键约束**：

- L1 Logo 必须用 `/logo.png`（public 目录），不要用 lucide `Sparkles` 等替代；登录页 / 工作页 / Header / Pricing 公开页等所有 Logo 位置统一用 `/logo.png`
- Logo Link 的 onClick 必须设 `setActiveModule('home') + setShowPanel(true)`
- `useEffect(location.pathname)` 监听路由变化同步 `activeModule`，浏览器前进后退 / Logo 点击都能正确高亮模块
- L2 分组为**静态小标题 + 永久展开**（Linear / Vercel 风格），不用 `Collapsible`
- L2 分组标题左 padding：`pl-1.5 pr-3` —— 与 L2 title 底分割线 `inset-x-4` 左端对齐
- 折叠态二级项必须包 `<Tooltip side="right">`

### 14.4 Header 毛玻璃

```tsx
<header className="absolute inset-x-0 top-0 z-30 flex h-14 ... border-b border-border/70
                   bg-[#F6F5FC]/75 dark:bg-background/75
                   backdrop-blur-xl backdrop-saturate-150">
```

- **绝对定位**于 main 之上（不是 sticky 流式），main 自身用 `pt-[calc(theme(spacing.14)_+_24px)]` 留出空间
- 颜色与 L3 内容区相同 + 75% 不透明 + `backdrop-blur-xl` —— 滚动时下方内容柔化透出
- `border-border/70`（比常规 /40 略深）作为下方内容的视觉分隔

### 14.5 Drawer / Modal 滚动模式（**容易踩坑**）

#### Drawer（右侧抽屉，shadcn `Sheet` 包装）

```
SheetContent (flex flex-col overflow-hidden p-0)
├── SheetHeader (shrink-0 border-b px-5 py-3.5)
└── 业务内容区 (flex min-h-0 flex-1 flex-col)     ← Drawer.tsx 提供，不要在此处加 overflow
    └── <form className="flex h-full min-h-0 flex-col">
        ├── 滚动区 (min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-4)  ← 必须有 px-5 给 input ring
        └── 底部按钮 (shrink-0 border-t bg-card px-5 py-3)
```

**关键 rules**：

- Drawer 包裹层**只**提供 flex 容器，**不要**自己 `overflow-y-auto`，否则与表单内 scroll 嵌套，并且 `overflow-y-auto` 会隐式裁 x，input 的 3px focus ring 被切
- 表单内的滚动容器**必须有横向 padding**（至少 `px-5`），否则贴边 input 的 focus ring 被裁

#### Modal（Dialog 包装）

shadcn 的 `DialogContent` 默认是 `display: grid`，会破坏 `flex-1 overflow-y-auto`：

```tsx
<DialogContent className="flex max-h-[min(90dvh,720px)] flex-col gap-0 overflow-hidden p-0">
    <DialogHeader className="shrink-0 border-b ..."/>
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
    <DialogFooter className="shrink-0 border-t ..."/>
</DialogContent>
```

**关键**：必须显式加 `flex flex-col` 覆盖 grid，header/footer 加 `shrink-0`，中间用 `flex-1 overflow-y-auto`。`@/components/common/Modal` 已封装该模式，业务页直接用。

### 14.6 PageContainer 底部 padding + 宽度两档制

- `PageContainer` 内置 `pb-12 md:pb-16`，所有用模板包裹的页面自动有底部留白。**新页面不要再手动写 `pb-10`**，重复了。
- **宽度两档制**：
  - **默认全宽（绝大多数业务页面）**：`PageContainer` 默认 `size="full"`，铺满 main 区域。**新页面不要写 `size="xl"` / `size="lg"` 等参数**，省略即可。页面级 wrapper **禁止**自己写 `mx-auto max-w-6xl` / `max-w-7xl` 之类限宽；水平内边距由 AppLayout 的 main `px-6 sm:px-8 md:px-10 lg:px-12` 统一控制
  - **非全宽特例（对话 / 长文阅读型）**：`/chat` 创作中心这类**单列消息流 / 长文阅读**页面，全宽会让行长过长、网格被拉稀疏，允许显式 `mx-auto max-w-6xl` 居中收窄（也可视情况用 `max-w-5xl` / `max-w-4xl`）。判定标准：内容主体是单列消息流 / 表单 / 长文，且大屏上铺满会让行长 > 100 字符。**新增此类特例必须在代码处加中文注释**说明原因，避免后人按"统一全宽"规范误删
  - **`size="sm"`**（max-w-3xl）仍保留收窄，登录页双栏等场景使用；其它枚举（`md` / `lg` / `xl`）一律映射为全宽
- 如确需局部收窄（例如内部 Hero 搜索框）才在该局部块上加 `max-w-2xl mx-auto`，不影响整页宽度

### 14.7 列表行操作按钮

列表内行内操作（如"预览 / 详情 / 删除"）**至少**用 `variant="outline"`（带边框），不要用 `variant="ghost"`（无底色无边框看不出是按钮）。删除类用 `variant="danger"`。

> `@/components/common/Button` 的 `variant="danger"` 是 outline 描边样式（**红色边框 + 红色文字 + hover 淡红底**），视觉上不过分抢眼。`ConfirmDialog` 二次确认按钮不走 common/Button 包装，是 destructive 实色（强提示）。

## 15. 样式要点（hover / 卡片 / 列表等高）

### 15.1 全局 hover 风格 — `.menu-hover` 工具类

菜单 / Header / 小型 icon button 的 hover **统一用 `menu-hover`**（`src/index.css` 定义），效果 = 紫色淡底 + 紫色内描边 + 紫色双层外晕 + `translateY(-1px)` 微微上提 + `:active` 100ms 快速回弹。**不带方向性扫光**（避免左侧淡色拖影），所有动效都是中心 fade-in。

```tsx
{/* ✅ Sidebar 一级 module 按钮（!isActive 时） */}
<button className={cn('group ...', isActive ? '...' : 'menu-hover')}>

{/* ✅ Sidebar 二级 NavLink（!active 时） */}
<NavLink className={cn('...', active ? 'bg-primary/10 ...' : 'menu-hover')}>

{/* ✅ Header 右上的操作手册 / 语言切换 / 用户菜单 */}
<a className="... menu-hover">操作手册</a>
<Button variant="ghost" className="... menu-hover">...</Button>

{/* ✅ ThemeToggle / NotificationBellButton 等 ghost icon button */}
<Button variant="ghost" size="icon" className="... menu-hover">
```

**已应用位置**：Sidebar 一级 module 按钮 / 用户头像 Popover / 二级 NavLink（展开 / 子组 / 折叠态）/ Header 操作手册 + 语言 + 用户菜单 / ThemeToggle / NotificationBellButton。

**禁止**在这些位置使用 `hover:bg-accent` 或 `hover:bg-foreground/[0.08]` 灰色 hover，统一紫色风格。

### 15.2 卡片 hover — `.card-hover`

`.card-hover` utility（同样在 `src/index.css`）效果：
- `translateY(-3px)` 上提
- 紫色 border tint（primary @ 35%）
- 紫色光晕双层 box-shadow（primary @ 28% + 黑色 ambient @ 6%）
- 280ms 过渡，spring 缓动 (overshoot 1.3)

**已应用平铺 item 卡片**：
- `pages/generation/ContentLibraryPage.tsx`（内容库网格 motion.div）
- `pages/knowledge/ProductPage.tsx`（产品）/ `CustomerPage.tsx`（客户）/ `CasePage.tsx`（案例）
- `pages/tlf/PublishPage.tsx`（发布 step1 内容选择 + step2 平台选择）
- `pages/generation/AutoGenSchedulePage.tsx`（自动生成）

**新增列表网格卡 / item 卡建议默认带 `card-hover`**，不要写裸的 `hover:shadow-card hover:border-primary/30`。

### 15.3 framer-motion + card-hover 协作陷阱

`motion.div` 的 `animate={{ y: 0 }}` 完成后会**在元素上留 inline `transform: translate(0px, 0px)`**，会**覆盖** CSS `card-hover:hover` 的 `translateY(-3px)`。两种解法：

```tsx
{/* 解法 A：包一层内层 div，外层 motion 管进出动画，内层 div 管 hover */}
<motion.div initial={{opacity:0, y:12}} animate={{opacity:1, y:0}} className="h-full">
  <div className="card-hover bg-card rounded-2xl border ...">
    {/* 内容 */}
  </div>
</motion.div>

{/* 解法 B：用 motion 的 whileHover 接管 transform，CSS card-hover 接管 box-shadow / border */}
<motion.div
  initial={{opacity:0, y:12}}
  animate={{opacity:1, y:0}}
  whileHover={{ y: -3 }}
  className="card-hover bg-card rounded-2xl border ..."
>
```

应用示例：`AutoGenSchedulePage.tsx` / `ContentLibraryPage.tsx` 用 A，`tlf/PublishPage.tsx` 用 B。

### 15.4 grid 列表卡片等高

`grid` 默认 `align-items: stretch`，但卡片内部高度由内容决定。要让同行卡片**等高 + 底部对齐**：

```tsx
<motion.div className="h-full">                            {/* grid item 拉满 */}
  <div className="flex h-full flex-col bg-card ... card-hover">
    {/* Header / Stats / Tags */}
    <p className="mt-2 flex-1 ...">{/* 内容区 flex-1 撑开 */}</p>
    <div className="mt-3 border-t ...">{/* Actions 自动顶到底 */}</div>
  </div>
</motion.div>
```

应用示例：`AutoGenSchedulePage.tsx` ScheduleCard。

### 15.5 列表 item 用色克制

类型多 / 状态多的列表 item 卡（如自动生成调度卡）容易"颜色太多"——边框跟类型走、状态文字跟类型走、成功 / 失败用 emerald / rose——会很闹。**克制原则**：

- **类型色锚点保留**：左上角 IconBox 渐变盒 + 类型徽章（这两处是"一眼分辨"的核心，不可去）
- **结构色去掉**：外层卡片 border、"下次执行 / 上次执行"等次要文字行，统一用 `border-border` / `text-muted-foreground`，不跟随类型色
- **状态色按"重要性"保留**：失败 rose 红保留（强提醒），成功 emerald 改为默认 muted（一般状态无需绿点强调）

实例：见 `AutoGenSchedulePage.tsx` ScheduleCard 取舍。
