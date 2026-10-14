import * as React from 'react'
import * as LucideIcons from 'lucide-react'
import { Check, ChevronDown, Code2, Eye, Loader2, Pencil, Plus, Search, Sparkles, Star, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { EmptyState, PageContainer, PageHeader, SectionCard } from '@/components/shared'
import { DetailDrawer, NumberInput, ProForm, ProFormField } from '@/components/admin'
import { MarkdownPreview } from '@/components/MarkdownPreview'
import { cn } from '@/lib/utils'
import { estimateTokens, formatTokens } from '@/lib/tokenEstimate'
import { TLF_PLATFORMS, getPlatformName } from '@/lib/tlfPlatforms'
import { ApiBusinessError } from '@/lib/api/schema'
import {
  deleteSkill,
  fetchSkills,
  upsertSkill,
  type SkillFromApi,
  type SkillUpsertBody,
} from '@/lib/api/skills'

const CONTENT_TYPES = [
  { value: 'article', label: '文章' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'chat', label: '对话' },
] as const

const CT_LABEL: Record<string, string> = Object.fromEntries(CONTENT_TYPES.map((c) => [c.value, c.label]))

// 分类是固定的几个分组（仅用于后台组织 / 展示，不参与用户侧过滤）
const CATEGORIES = [
  { value: 'humanize', label: '去 AI 味 / 拟人' },
  { value: 'platform', label: '平台风格' },
  { value: 'format', label: '格式 / 结构' },
] as const
const NO_CATEGORY = '__none__'

/** 把 skill.icon（lucide 名如 "Sparkles" 或 emoji）渲染成图标。 */
function SkillIcon({ name, className }: { name?: string | null; className?: string }) {
  if (name && /^[A-Z][A-Za-z0-9]*$/.test(name)) {
    const Cmp = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name]
    if (Cmp) return <Cmp className={className ?? 'size-5'} />
  }
  return <span className="text-lg leading-none">{name || '✨'}</span>
}

/** 适用平台多选下拉（中文名 + 搜索），值为平台 code 数组。 */
function PlatformMultiSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = React.useState(false)
  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1.5 text-left text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {value.length === 0 ? (
            <span className="px-1 text-muted-foreground">选择适用平台（不选 = 通用，所有平台可见）</span>
          ) : (
            value.map((c) => (
              <Badge key={c} variant="secondary" className="text-[11px]">{getPlatformName(c)}</Badge>
            ))
          )}
          <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="搜索平台…" />
          <CommandList>
            <CommandEmpty>无匹配平台</CommandEmpty>
            <CommandGroup>
              {TLF_PLATFORMS.map((p) => {
                const active = value.includes(p.code)
                return (
                  <CommandItem key={p.code} value={`${p.name} ${p.code}`} onSelect={() => toggle(p.code)}>
                    <Check className={cn('mr-2 size-4', active ? 'opacity-100 text-primary' : 'opacity-0')} />
                    <span>{p.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{p.code}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

type Draft = {
  id: string | null
  slug: string
  name: string
  description: string
  prompt: string
  contentTypes: string[]
  platforms: string[]
  category: string
  icon: string
  sourceUrl: string
  status: 'active' | 'inactive'
  recommended: boolean
  sortOrder: number
}

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

/** 解析 SKILL.md：YAML frontmatter（name/description）+ 正文（=提示词）。 */
function parseSkillMd(md: string): { name?: string; description?: string; body: string } {
  const m = md.match(/^\s*---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!m) return { body: md.trim() }
  const fm: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    if (/^[A-Za-z_]/.test(line) && line.includes(':')) {
      const i = line.indexOf(':')
      fm[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
  return { name: fm.name, description: fm.description, body: m[2].trim() }
}

function emptyDraft(): Draft {
  return {
    id: null, slug: '', name: '', description: '', prompt: '',
    contentTypes: [], platforms: [], category: '', icon: '', sourceUrl: '',
    status: 'active', recommended: false, sortOrder: 0,
  }
}

function rowToDraft(r: SkillFromApi): Draft {
  return {
    id: r.id, slug: r.slug ?? '', name: r.name ?? '', description: r.description ?? '',
    prompt: r.prompt ?? '', contentTypes: r.contentTypes ?? [],
    platforms: r.platforms ?? [], category: r.category ?? '',
    icon: r.icon ?? '', sourceUrl: r.sourceUrl ?? '',
    status: (r.status as Draft['status']) ?? 'active',
    recommended: r.recommended ?? false, sortOrder: r.sortOrder ?? 0,
  }
}

function draftToPayload(d: Draft): SkillUpsertBody {
  return {
    slug: d.slug.trim(),
    name: d.name.trim(),
    description: d.description.trim() || null,
    prompt: d.prompt,
    content_types: d.contentTypes,
    platforms: d.platforms,
    category: d.category.trim() || null,
    icon: d.icon.trim() || null,
    source_url: d.sourceUrl.trim() || null,
    status: d.status,
    recommended: d.recommended,
    sort_order: Math.max(0, Math.floor(Number(d.sortOrder) || 0)),
  }
}

export default function SkillsPage() {
  const [items, setItems] = React.useState<SkillFromApi[]>([])
  const [loading, setLoading] = React.useState(true)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [mdText, setMdText] = React.useState('')
  const [promptPreview, setPromptPreview] = React.useState(false)
  // 列表筛选：搜索 + 分类 + 适用类型 + 状态
  const [q, setQ] = React.useState('')
  const [catFilter, setCatFilter] = React.useState('all')
  const [ctFilter, setCtFilter] = React.useState('all')
  const [statusFilter, setStatusFilter] = React.useState('all')

  const filtered = React.useMemo(() => {
    const kw = q.trim().toLowerCase()
    return items.filter((r) => {
      if (catFilter !== 'all' && (r.category ?? '') !== catFilter) return false
      // 类型过滤：空 content_types = 通用，任何类型都匹配
      if (ctFilter !== 'all' && (r.contentTypes?.length ?? 0) > 0 && !(r.contentTypes ?? []).includes(ctFilter)) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (!kw) return true
      const hay = [r.name, r.slug, r.description ?? '', ...(r.platforms ?? [])].join(' ').toLowerCase()
      return hay.includes(kw)
    })
  }, [items, q, catFilter, ctFilter, statusFilter])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setItems(await fetchSkills())
    } catch (e) {
      toast.error(e instanceof ApiBusinessError ? e.message : '加载 skill 列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const updateDraft = (patch: Partial<Draft>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))

  const toggleContentType = (ct: string) =>
    setDraft((prev) => {
      if (!prev) return prev
      const has = prev.contentTypes.includes(ct)
      return { ...prev, contentTypes: has ? prev.contentTypes.filter((x) => x !== ct) : [...prev.contentTypes, ct] }
    })

  const handleAdd = () => { setEditingId(null); setDraft(emptyDraft()); setMdText(''); setPromptPreview(false); setDrawerOpen(true) }
  const handleEdit = (r: SkillFromApi) => { setEditingId(r.id); setDraft(rowToDraft(r)); setMdText(''); setPromptPreview(false); setDrawerOpen(true) }

  /** 解析 SKILL.md 文本填充表单（仅填空字段，不覆盖已填内容；提示词总是替换）。 */
  const applyMd = (text: string) => {
    const { name, description, body } = parseSkillMd(text)
    if (!body) return toast.error('未解析到正文内容')
    setDraft((prev) => prev ? {
      ...prev,
      prompt: body,
      name: prev.name || name || prev.name,
      slug: prev.slug || (name ? slugify(name) : prev.slug),
      description: prev.description || description || prev.description,
    } : prev)
    toast.success('已解析 SKILL.md，请补全分类 / 适用类型 / 平台后保存')
  }
  const onMdFile = async (file: File | null) => {
    if (!file) return
    try { applyMd(await file.text()) } catch { toast.error('读取文件失败') }
  }

  const handleSave = async () => {
    if (!draft) return
    if (!draft.name.trim()) return toast.error('请填写名称')
    if (!draft.slug.trim()) return toast.error('请填写 slug')
    if (!draft.prompt.trim()) return toast.error('请填写提示词')
    setSaving(true)
    try {
      const saved = await upsertSkill(editingId, draftToPayload(draft))
      setItems((prev) =>
        editingId ? prev.map((x) => (x.id === saved.id ? saved : x)) : [...prev, saved],
      )
      toast.success(editingId ? '已保存' : '已新增')
      setDrawerOpen(false)
    } catch (e) {
      toast.error(e instanceof ApiBusinessError ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    setDeleting(true)
    try {
      await deleteSkill(deletingId)
      setItems((prev) => prev.filter((x) => x.id !== deletingId))
      toast.success('已删除')
      setDeletingId(null)
    } catch (e) {
      toast.error(e instanceof ApiBusinessError ? e.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="内容生成 Skill 池"
        description="预设提示词模板，按内容类型 / 平台分类；用户生成文章/图片/视频或对话时可选用。"
        actions={
          <Button onClick={handleAdd}>
            <Plus className="size-4" strokeWidth={2.25} />新增 Skill
          </Button>
        }
      />

      {loading ? (
        <SectionCard>
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /><span className="ml-2">加载中…</span>
          </div>
        </SectionCard>
      ) : items.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Sparkles}
            title="暂无 Skill"
            description='点击右上角"新增 Skill"，或运行后端 seed_skills 灌入起始包'
            action={<Button onClick={handleAdd}><Plus className="size-4" />新增 Skill</Button>}
          />
        </SectionCard>
      ) : (
        <>
          {/* 筛选工具栏 */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索名称 / slug / 描述 / 平台…" className="pl-8" />
            </div>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="分类" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分类</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={ctFilter} onValueChange={setCtFilter}>
              <SelectTrigger className="w-[120px]"><SelectValue placeholder="类型" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {CONTENT_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[110px]"><SelectValue placeholder="状态" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">启用</SelectItem>
                <SelectItem value="inactive">禁用</SelectItem>
              </SelectContent>
            </Select>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">{filtered.length} / {items.length}</span>
          </div>

          {filtered.length === 0 ? (
            <SectionCard>
              <EmptyState icon={Search} title="无匹配结果" description="换个关键词或调整筛选条件试试。" />
            </SectionCard>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((r) => (
            <div
              key={r.id}
              className={cn('card-hover rounded-xl border border-border bg-card p-4', r.status !== 'active' && 'opacity-60')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 text-muted-foreground">
                    <SkillIcon name={r.icon} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold leading-tight text-foreground">{r.name}</h3>
                    <p className="truncate text-[11px] text-muted-foreground">{r.slug}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {r.recommended && (
                    <Badge className="gap-0.5 bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">
                      <Star className="size-3 fill-current" />推荐
                    </Badge>
                  )}
                  <Badge className={cn(r.status === 'active'
                    ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300'
                    : 'bg-muted text-muted-foreground hover:bg-muted')}>
                    {r.status === 'active' ? '启用' : '禁用'}
                  </Badge>
                </div>
              </div>

              {r.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>}

              <div className="mt-3 flex flex-wrap gap-1">
                {(r.contentTypes ?? []).map((c) => (
                  <Badge key={c} variant="secondary" className="text-[10px]">{CT_LABEL[c] ?? c}</Badge>
                ))}
                {(r.platforms ?? []).slice(0, 4).map((p) => (
                  <Badge key={p} variant="outline" className="text-[10px] font-normal">{getPlatformName(p)}</Badge>
                ))}
                <span className="ml-auto inline-flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className={cn(estimateTokens(r.prompt) >= 8000 && 'text-amber-600 dark:text-amber-400')} title="提示词注入成本（粗估）">{formatTokens(estimateTokens(r.prompt))}</span>
                  <span>sort {r.sortOrder}</span>
                </span>
              </div>

              <div className="mt-3 flex items-center justify-end gap-1 border-t border-border/70 pt-3">
                <Button variant="outline" size="sm" onClick={() => handleEdit(r)}>
                  <Pencil className="size-3.5" strokeWidth={2.25} />编辑
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeletingId(r.id)}
                >
                  <Trash2 className="size-3.5" strokeWidth={2.25} />删除
                </Button>
              </div>
            </div>
              ))}
            </div>
          )}
        </>
      )}

      <DetailDrawer
        open={drawerOpen}
        onOpenChange={(o) => !saving && setDrawerOpen(o)}
        title={editingId ? '编辑 Skill' : '新增 Skill'}
        description="落到 skills 表；用户侧按 content_types / platforms 过滤可选，sort_order 升序展示。"
        width="lg"
        padded={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}保存
            </Button>
          </div>
        }
      >
        {draft && (
          <ProForm layout="2-col" className="p-5 pb-10">
            <ProFormField label="名称" required>
              <Input value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} placeholder="例：小红书爆款笔记" />
            </ProFormField>
            <ProFormField label="slug" required hint="唯一标识，英文小写">
              <Input value={draft.slug} onChange={(e) => updateDraft({ slug: e.target.value })} placeholder="xhs-explosive" />
            </ProFormField>
            <ProFormField label="一句话描述" fullWidth>
              <Input value={draft.description} onChange={(e) => updateDraft({ description: e.target.value })} maxLength={500} placeholder="小红书爆款标题 + 正文结构 + 标签" />
            </ProFormField>
            <ProFormField label="导入 SKILL.md" fullWidth hint="上传 .md 文件或粘贴内容，自动解析 frontmatter + 正文填充下方字段（分类/类型/平台仍需手动选）">
              <div className="space-y-2">
                <input
                  type="file"
                  accept=".md,.markdown,text/markdown,text/plain"
                  onChange={(e) => { void onMdFile(e.target.files?.[0] ?? null); e.target.value = '' }}
                  className="block w-full cursor-pointer rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-primary"
                />
                <Textarea
                  value={mdText}
                  onChange={(e) => setMdText(e.target.value)}
                  rows={4}
                  placeholder="或在此粘贴 SKILL.md 内容…"
                  className="font-mono text-[12px]"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => mdText.trim() ? applyMd(mdText) : toast.error('请先粘贴 SKILL.md 内容')}>
                  解析填充
                </Button>
              </div>
            </ProFormField>
            <ProFormField label="提示词" required fullWidth hint={`注入生成：文章/对话进 system，图片/视频追加到 prompt · ${formatTokens(estimateTokens(draft.prompt))}`}>
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Button
                    type="button" size="sm"
                    variant={promptPreview ? 'outline' : 'default'}
                    onClick={() => setPromptPreview(false)}
                  >
                    <Code2 className="size-3.5" />纯文本编辑
                  </Button>
                  <Button
                    type="button" size="sm"
                    variant={promptPreview ? 'default' : 'outline'}
                    onClick={() => setPromptPreview(true)}
                  >
                    <Eye className="size-3.5" />Markdown 预览
                  </Button>
                </div>
                {promptPreview ? (
                  <div className="max-h-[28rem] min-h-[12rem] overflow-y-auto rounded-md border border-input bg-muted/20 px-3 py-2">
                    {draft.prompt.trim()
                      ? <MarkdownPreview content={draft.prompt} />
                      : <span className="text-sm text-muted-foreground">暂无内容，切换到「纯文本编辑」填写</span>}
                  </div>
                ) : (
                  <Textarea
                    value={draft.prompt}
                    onChange={(e) => updateDraft({ prompt: e.target.value })}
                    rows={10}
                    placeholder="写出该 skill 的完整提示词…"
                    className="font-mono text-[13px]"
                  />
                )}
              </div>
            </ProFormField>
            <ProFormField label="适用类型" fullWidth hint="不选=全部类型可用">
              <div className="flex flex-wrap gap-1.5">
                {CONTENT_TYPES.map((c) => {
                  const active = draft.contentTypes.includes(c.value)
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => toggleContentType(c.value)}
                      className={cn(
                        'cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                        active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40',
                      )}
                    >
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </ProFormField>
            <ProFormField label="适用平台" fullWidth hint="可多选，中文显示；不选 = 通用（所有平台可见）">
              <PlatformMultiSelect value={draft.platforms} onChange={(v) => updateDraft({ platforms: v })} />
            </ProFormField>
            <ProFormField label="分类" hint="后台分组用，不影响用户可见与过滤">
              <Select
                value={draft.category || NO_CATEGORY}
                onValueChange={(v) => updateDraft({ category: v === NO_CATEGORY ? '' : v })}
              >
                <SelectTrigger><SelectValue placeholder="选择分类" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>（未分类）</SelectItem>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  {draft.category && !CATEGORIES.some((c) => c.value === draft.category) && (
                    <SelectItem value={draft.category}>{draft.category}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </ProFormField>
            <ProFormField label="图标" hint="lucide 名或 emoji">
              <Input value={draft.icon} onChange={(e) => updateDraft({ icon: e.target.value })} placeholder="Flame 或 🔥" />
            </ProFormField>
            <ProFormField label="出处链接">
              <Input value={draft.sourceUrl} onChange={(e) => updateDraft({ sourceUrl: e.target.value })} placeholder="https://…（可空）" />
            </ProFormField>
            <ProFormField label="排序">
              <NumberInput value={draft.sortOrder} onChange={(v) => updateDraft({ sortOrder: v ?? 0 })} min={0} />
            </ProFormField>
            <ProFormField label="状态">
              <div className="flex items-center gap-2">
                <Switch checked={draft.status === 'active'} onCheckedChange={(v) => updateDraft({ status: v ? 'active' : 'inactive' })} />
                <span className="text-xs text-muted-foreground">{draft.status === 'active' ? '启用' : '禁用'}</span>
              </div>
            </ProFormField>
            <ProFormField label="推荐" hint="开启后用户选择 skill 时高亮「推荐」标记">
              <div className="flex items-center gap-2">
                <Switch checked={draft.recommended} onCheckedChange={(v) => updateDraft({ recommended: v })} />
                <span className="text-xs text-muted-foreground">{draft.recommended ? '已推荐' : '不推荐'}</span>
              </div>
            </ProFormField>
          </ProForm>
        )}
      </DetailDrawer>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除该 Skill？</AlertDialogTitle>
            <AlertDialogDescription>删除后用户侧将不再可选；历史已生成内容不受影响。此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDelete() }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />}删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}
