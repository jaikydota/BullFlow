# admin_frontend / AGENTS.md

后台管理系统前端的工作指南。**修改任何文件前请先读本文档**；shadcn UI 与共享模板与主站 `frontend/` 完全同源，可直接 cp 同步。

---

## §1 工程结构 / 启动命令

```
admin_frontend/
├── index.html
├── vite.config.ts                 # dev 5290，proxy /api → backend :8020（管理后台 API 已并入 backend /api/v1/admin/*）
├── tsconfig.{app,node,json}
├── Dockerfile / nginx.conf        # 生产：nginx :8030 托管 dist/，/api/v1/admin/ 反代 backend:8021（其余 /api/ 返回 404）
├── public/logo.png
├── src/
│   ├── main.tsx / App.tsx / index.css  # 主站同源 OKLCH token + @utility
│   ├── router/index.tsx           # 25 个 lazy 路由（含 login）
│   ├── components/
│   │   ├── ui/                    # 29 个 shadcn 组件（与主站 cp 同步）
│   │   ├── shared/                # 9 个共享模板（PageHeader / IconBox / StatCard / SectionCard / Toolbar / GradientHero / EmptyState / PageContainer / InfoRow）
│   │   ├── admin/                 # 13 个后台特有组件（详 §3）
│   │   ├── theme/                 # ThemeProvider + ThemeToggle
│   │   └── layout/                # AdminLayout / AdminSidebar / AdminHeader / AdminRequireAuth
│   ├── pages/                     # 25 个页面（login + 24 业务页）
│   ├── lib/
│   │   ├── api/                   # axios client + schema（ApiBusinessError）+ 15 个业务 API 模块
│   │   ├── admin-token.ts         # localStorage token CRUD
│   │   ├── tlfPlatforms.ts        # 分发平台 code ↔ 中文名（与主站同源）
│   │   ├── tokenEstimate.ts       # token 数估算
│   │   ├── utils.ts               # cn() (clsx + tailwind-merge)
│   │   ├── format.ts              # formatDate / formatDateOnly / formatCurrency
│   │   └── types.ts               # 业务对象类型（Order/Plan/...）
│   ├── stores/adminAuthStore.ts   # zustand: { token, user, hydrate, login, logout }
│   └── hooks/                     # useDebouncedValue / usePagination
```

启动：
```bash
cd admin_frontend
npm install
npm run dev         # http://localhost:5290/admin/login
npm run build       # tsc -b && vite build → dist/
npm run lint
```

Docker：
```bash
docker compose build admin_frontend
docker compose up backend admin-frontend -d
# 访问 http://localhost:8030/admin/login
```

---

## §2 shadcn ui 与主站同源

- `src/components/ui/*.tsx`、`src/components/shared/*.tsx`、`src/components/theme/*.tsx` 与主站 `frontend/src/components/{ui,shared,theme}/*` **完全一致**。
- 主站升级时直接 `cp -r frontend/src/components/ui/* admin_frontend/src/components/ui/`（同理 shared、theme）即可。
- `src/index.css` 也整段 cp 自主站（OKLCH token + 所有 `@utility`）。

**禁止**：在 admin 单独修改 ui/shared 文件以避免与主站脱钩。如需后台专属表现，写到 `components/admin/*`。

---

## §3 后台特有组件（13 个，`src/components/admin/`）

复用复杂度高的"提效组件层"，用于支撑列表 / 表单 / 弹层 / 图表。统一从 `@/components/admin` 导入。

| 组件 | 用途 | 关键 props |
|---|---|---|
| `DataTable<T>` | TanStack Table v8 包装 | columns, data, total, page, pageSize, onPageChange, rowKey, onRowClick, enableRowSelection, bulkActions, toolbar, zebra, stickyHeader |
| `ProForm` / `ProFormField` / `ProFormSection` | 轻量表单容器（**不用 react-hook-form**，与主站一致） | layout('1-col'/'2-col'/'3-col'), footer, scrollable / label, required, hint, error, fullWidth |
| `NumberInput` | 受控数字输入，失焦 clamp + precision | min, max, step, precision, suffix, prefix |
| `ButtonGroup<T>` | 分段控件（segmented control） | options, value, onChange, size, fullWidth |
| `DetailDrawer` | 右侧抽屉（修复 flex scroll 陷阱） | width('sm'/'md'/'lg'/'xl'), padded, footer |
| `DetailModal` | 居中弹窗（修复 shadcn Dialog grid 陷阱） | size('sm'/'md'/'lg'/'xl'), padded, footer |
| `FilterBar` | 列表页工具栏（搜索 + 过滤 + 操作三段式） | search, filters, actions, sticky |
| `SearchInput` | 搜索框 + 防抖（默认 250ms） | onChange, onDebouncedChange, onSubmit, debounce |
| `ImageUploadField` | MinIO 图片上传（eager/deferred） | mode, value, onChange, uploadPath, width, height；ref.commit() / ref.isPending() |
| `ArrayEditor<T>` | 多条目编辑器（多 banner / 通知） | items, onChange, renderItem, newItem, addLabel, maxItems |
| `ChartCard` + `LineChart` / `BarChart` / `PieChart` | recharts 包装 + OKLCH 配色 | series.color: 'primary'/'article'/'image'/'video'/'audio'/'success'/'warning'/'destructive' |
| `PermissionMatrix` | 角色 × 权限二维网格 | roles, permissions, value, onChange, isLocked |
| `ColorPicker` | 8 种渐变色板（`GradientCode` 类型） | value, onChange |

**新增页面套用顺序**：
```tsx
<PageContainer>
  <PageHeader title="…" description="…" icon={…} breadcrumbs={…} actions={…} />
  <FilterBar search={…} filters={…} actions={…} />   {/* 列表页 */}
  <DataTable columns={…} data={…} … />
  <DetailDrawer …>                                    {/* 编辑表单 */}
    <ProForm layout="2-col">
      <ProFormField …><Input …/></ProFormField>
    </ProForm>
  </DetailDrawer>
</PageContainer>
```

---

## §4 路由 / Sidebar / Header / 三层背景

### 路由（`src/router/index.tsx`）
- 25 条 lazy 路由：`/admin/login`（公开）+ 24 条业务页（其中 `/admin/sales-dashboard` 无 Sidebar 菜单入口）
- 业务页全部包裹 `<AdminLayout>` → `<AdminRequireAuth>`（未登录 → 跳 `/admin/login?next=…`）
- 入口 `/` 与 `/admin` 重定向到 `/admin/dashboard`；404 通配 → dashboard

### Sidebar（6 分组 / 23 个菜单项）
```
数据概览：仪表盘 / 数据分析 / 财务报表
数据埋点：数据概览 / 转化漏斗 / 创作分析 / 支付分析 / 事件明细
用户与权限：用户管理 / 角色权限 / 销售管理 / 财务管理
计费与订单：套餐与加包 / 订单管理 / 发票管理 / 收费配置
平台运营：平台设置 / 消息推送 / 通知通道 / 用户反馈 / Skill 池
资源运维：流量密码 / 操作日志
```
- 宽度：展开 `w-60` / 折叠 `w-14`（折叠态有 Tooltip）
- 折叠状态存 `localStorage.matrix365_admin_sidebar_collapsed`
- Hover / 非 active 用 `.menu-hover` utility；active 加左侧 3px 紫色指示条 + `bg-primary/10 text-primary`
- 静态分组标题：`text-[10px] uppercase tracking-wider text-muted-foreground/70`，不用 Collapsible

### Header（`absolute top-0 h-14`）
- L3 浅紫底 + `glass-soft` + `backdrop-blur-xl`
- 右上：主题切换 + 用户菜单（显示当前角色 Badge + 退出登录）
- `main` 用 `pt-[calc(theme(spacing.14)_+_24px)]` 留出 Header 高度

### 三层背景（沿用主站规范）
- L1 = 白底（Sidebar）= `bg-card`
- L2 = `#FCFBFE`（未使用单层 sidebar 故省略）
- L3 = `#F6F5FC`（main 区）= `bg-[#F6F5FC] dark:bg-background`

---

## §5 API / 鉴权约定

### `src/lib/api/client.ts`
```ts
adminRequest<T>(path, init?: { method?, json?, body?, headers? }): Promise<T>
adminFormPost<T>(path, formData: FormData): Promise<T>
```
- 底层 axios，自动 `Bearer Token` 注入
- 401 / 业务码 `40100` → 清 token + 跳 `/admin/login?next=`
- 业务错误统一抛 `ApiBusinessError`（含 `message` + `code`）

### 15 个业务 API 模块（`src/lib/api/`）
- `auth.ts` / `users.ts` / `dashboard.ts` / `analytics.ts` / `tracking.ts`
- `billing.ts`（AI 模型 + 分发计费 distribution）
- `saas.ts`（orders + plans + addons + invitations + finance + audit-logs + platform-settings + notification-channels）
- `finance.ts` / `invoices.ts` / `sales.ts`
- `broadcasts.ts` / `roles.ts` / `traffic-secrets.ts` / `feedback.ts` / `skills.ts`
- 另有 `client.ts`（axios 客户端）/ `schema.ts`（类型与错误类）

### 环境变量（`.env`）
- 默认走相对 `/api/v1`（dev 由 vite proxy，prod 由 nginx 反代到 backend 的 /api/v1/admin/*）
- 如需绝对地址，覆盖 `VITE_ADMIN_API_BASE_URL=https://admin.example.com/api/v1`

---

## §6 设计 Token / hover / glass / shadow

与主站 `frontend/AGENTS.md` 完全一致：

- **OKLCH 主色**：`oklch(0.55 0.25 285)` 紫（暗色 `oklch(0.7 0.22 285)`）
- **内容类型语义色**（跨模块不可换）：article=blue / image=emerald / video=rose / audio=sky
- **5 + 1 阴影**：`shadow-xs / soft / card / pop / modal / glow`
- **3 + 1 玻璃**：`glass-soft / glass / glass-strong / glass-overlay`
- **4 卡片**：`card-base / card-elevated / card-feature` + `.card-hover` utility（紫色 border + 上提 3px + 双层光晕）
- **`.menu-hover`**：紫色横向 sweep + inset ring + 外晕 + `-1px` 上提（550ms spring）
- **图标 strokeWidth = 2.25** 默认；小图标（表格 / 操作列）2.1；大图标（EmptyState）2

**禁止**：
- 硬编码 `bg-white` / `#FFFFFF` / `hsl(...)` 颜色值
- 在 admin 单独魔改 OKLCH token（与主站冲突会带来视觉不一致）
- 动态拼接 Tailwind 颜色类（`bg-${type}/10` 无法静态分析）

---

## §7 表单陷阱（与主站同步记录）

### Drawer / Modal 滚动
- `DetailDrawer` / `DetailModal` 内部已用三段式：`<form flex h-full min-h-0 flex-col>` + `<div flex-1 overflow-y-auto>` + `<div shrink-0 border-t>`
- 自写 form 时**不要**在 children 上加 overflow-y-auto，会被吃掉

### 复杂表单分页
- `BillingPage` / `SettingsPage` 用 `Tabs` + 每个 Tab 独立 `SectionCard`，不要塞进一个超长 Drawer

### 单价单位
- 收费配置统一以「积分」为基准单位（admin 输入的就是"扣多少积分/单位"，前后端一致）

---

## §8 测试 / 部署

- 暂无自动化测试（同主站）；依赖 `tsc -b` + 浏览器手动过页
- 任何 schema/字段变更需后端 backend/app/admin 同步
- 生产容器 image tag / volume / port 在根 `docker-compose.yml` 已配，本目录的 Dockerfile + nginx.conf 改动**不需要**改 docker-compose.yml
