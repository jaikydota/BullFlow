/** 平台能力：支持云端登录/分发的全部平台 + 每平台分发要求（字段/必填/长度/枚举/分类）。
 *
 * 扩展字段「支持 / 必填」来自后端实时矩阵 GET /platforms（publish_spec.py，与网关过滤一致）；
 * 长度/枚举/视频等参考约束来自静态目录 platformSpecs.ts。两者按 platform_code + kind 合并。
 */
import { useEffect, useMemo, useState } from 'react'
import { Badge, Drawer, Input, Space, Switch, Table, Tabs, Tag, Tooltip, Typography, message } from 'antd'
import { ReloadOutlined, ProfileOutlined } from '@ant-design/icons'
import { adminClient } from '../api/client'
import { PLATFORM_NAMES } from '../constants/platforms'
import {
  TLF_PLATFORM_CONSTRAINTS,
  type PublishKindSpec,
  type FieldRange,
  type MediaSpec,
  type EnumOption,
} from '../constants/platformSpecs'

interface MatrixField { field: string; required: boolean }
/** 平台发布策略（网关级，对所有租户生效）。首期只有「含链接发帖」开关 */
interface PlatformPolicy { allow_links: boolean; note: string | null; configured: boolean }
interface PlatformMatrix {
  platform_code: string
  kinds: string[]
  fields: Record<string, MatrixField[]>
  provider: 'lapi' | 'composio'   // lapi=灵径(国内) / composio=海外
  policy: PlatformPolicy
}

const KIND_LABEL: Record<string, string> = { video: '视频', article: '文章', dynamic: '图文' }
const KIND_COLOR: Record<string, string> = { video: 'magenta', article: 'blue', dynamic: 'green' }

const EXT_LABEL: Record<string, string> = {
  visible_type: '可见范围',
  statement: '内容声明',
  create_type: '原创声明',
  pre_pub_time: '定时发布',
  topics: '话题 topics',
  tags: '标签 tags',
  category: '一级分类',
  sub_category: '二级分类',
}

/** 内容字段（title/desc/content）文案 */
function fieldRangeText(r?: FieldRange): string {
  if (!r) return '—'
  const parts: string[] = []
  if (r.min != null && r.max != null) parts.push(`${r.min}~${r.max} 字`)
  else if (r.max != null) parts.push(`≤ ${r.max} 字`)
  else if (r.min != null) parts.push(`≥ ${r.min} 字`)
  if (r.note) parts.push(r.note)
  return parts.join('；') || '不限'
}

/** 媒体字段（images/covers/video）文案 */
function mediaText(m?: MediaSpec): string {
  if (!m) return '—'
  const parts: string[] = []
  if (m.min != null && m.max != null) parts.push(`${m.min}~${m.max} 张`)
  else if (m.min != null) parts.push(`≥ ${m.min} 张`)
  else if (m.max != null) parts.push(`≤ ${m.max} 张`)
  if (m.maxFileSizeMB != null) parts.push(`单个 ≤ ${m.maxFileSizeMB >= 1024 ? `${m.maxFileSizeMB / 1024}GB` : `${m.maxFileSizeMB}MB`}`)
  if (m.maxDurationSeconds != null) {
    const s = m.maxDurationSeconds
    parts.push(`时长 ≤ ${s >= 3600 ? `${s / 3600}h` : s >= 60 ? `${s / 60}min` : `${s}s`}`)
  }
  if (m.minWidth != null && m.minHeight != null) parts.push(`≥ ${m.minWidth}×${m.minHeight}`)
  if (m.note) parts.push(m.note)
  return parts.join('；') || '不限'
}

function enumText(opts?: EnumOption[]): string {
  if (!opts || !opts.length) return ''
  return opts.map(o => `${o.value}=${o.label}`).join('、')
}

function reqTag(required: boolean) {
  return required
    ? <Tag color="red">必填</Tag>
    : <Tag>可选</Tag>
}

export default function PlatformCapabilities() {
  const [rows, setRows] = useState<PlatformMatrix[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<PlatformMatrix | null>(null)
  const [policySaving, setPolicySaving] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await adminClient.get<PlatformMatrix[], PlatformMatrix[]>('/platforms')
      setRows(data || [])
    } catch (e: any) { message.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  /** 切换「含链接发帖」：关闭后该平台含 URL / 裸域名的发布请求在网关受理前被拒（不产生上游费用） */
  const togglePolicy = async (r: PlatformMatrix, allow: boolean) => {
    setPolicySaving(r.platform_code)
    try {
      const policy = await adminClient.put<PlatformPolicy, PlatformPolicy>(
        `/platforms/${r.platform_code}/policy`,
        { allow_links: allow, note: r.policy?.note ?? null },
      )
      setRows(prev => prev.map(x => (x.platform_code === r.platform_code ? { ...x, policy } : x)))
      message.success(`${PLATFORM_NAMES[r.platform_code] || r.platform_code}：含链接发帖已${allow ? '允许' : '禁止'}`)
    } catch (e: any) { message.error(e.message) } finally { setPolicySaving(null) }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      r.platform_code.toLowerCase().includes(q) ||
      (PLATFORM_NAMES[r.platform_code] || '').toLowerCase().includes(q),
    )
  }, [rows, search])

  const detailStatic = detail ? TLF_PLATFORM_CONSTRAINTS[detail.platform_code] : undefined

  const renderKindDetail = (kind: string) => {
    if (!detail) return null
    const spec: PublishKindSpec | undefined = (detailStatic as any)?.[kind]
    const extFields = detail.fields[kind] || []

    // 内容字段（来自静态约束）
    const contentRows: { k: string; label: string; req: boolean; text: string }[] = []
    const push = (k: string, label: string, r?: FieldRange, text?: string) => {
      if (!r) return
      contentRows.push({ k, label, req: !!r.required, text: text ?? fieldRangeText(r) })
    }
    if (spec) {
      push('title', '标题 title', spec.title)
      push('desc', '简介/正文 desc', spec.desc)
      push('content', '文章正文 content', spec.content)
      if (spec.video) contentRows.push({ k: 'video', label: '视频 video', req: !!spec.video.required, text: mediaText(spec.video) })
      if (spec.images) contentRows.push({ k: 'images', label: '图片 images', req: !!spec.images.required, text: mediaText(spec.images) })
      if (spec.covers) contentRows.push({ k: 'covers', label: '封面 covers', req: !!spec.covers.required, text: mediaText(spec.covers) })
      if (spec.hashtagMax != null) contentRows.push({ k: 'hashtag', label: '正文话题 #', req: false, text: `最多 ${spec.hashtagMax} 个 #话题#（写在正文里）` })
    }

    // 扩展字段（支持/必填来自后端矩阵，取值来自静态约束）
    const extRows = extFields.map(f => {
      let detailText = ''
      if (f.field === 'visible_type') detailText = enumText(spec?.visibleType)
      else if (f.field === 'statement') detailText = enumText(spec?.statement)
      else if (f.field === 'create_type') detailText = enumText(spec?.createType)
      else if (f.field === 'pre_pub_time') detailText = spec?.prePubTime ? `最早 ${spec.prePubTime.minHours}h 后 / 最晚 ${spec.prePubTime.maxDays} 天内` : '支持定时'
      else if (f.field === 'tags') detailText = spec?.tags ? [spec.tags.max != null ? `最多 ${spec.tags.max} 个` : '', spec.tags.itemMaxLength != null ? `每个 ≤ ${spec.tags.itemMaxLength} 字` : '', spec.tags.note ?? ''].filter(Boolean).join('；') : ''
      else if (f.field === 'topics') detailText = '独立话题字段（区别于正文 #话题#）'
      else if (f.field === 'category' || f.field === 'sub_category') detailText = '需先调 /accounts/{id}/categories 取分类树后选择'
      return { ...f, detailText }
    })

    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Typography.Text strong>内容字段</Typography.Text>
          <Table
            size="small" rowKey="k" pagination={false} style={{ marginTop: 8 }}
            dataSource={contentRows}
            columns={[
              { title: '字段', dataIndex: 'label', width: 160 },
              { title: '必填', dataIndex: 'req', width: 80, render: (v: boolean) => reqTag(v) },
              { title: '要求', dataIndex: 'text' },
            ]}
          />
        </div>
        <div>
          <Typography.Text strong>扩展字段</Typography.Text>
          <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>（支持/必填以网关实时为准）</Typography.Text>
          {extRows.length ? (
            <Table
              size="small" rowKey="field" pagination={false} style={{ marginTop: 8 }}
              dataSource={extRows}
              columns={[
                { title: '字段', dataIndex: 'field', width: 160, render: (f: string) => <span>{EXT_LABEL[f] || f} <code style={{ fontSize: 11, color: '#999' }}>{f}</code></span> },
                { title: '必填', dataIndex: 'required', width: 80, render: (v: boolean) => reqTag(v) },
                { title: '取值 / 说明', dataIndex: 'detailText', render: (t: string) => t || '—' },
              ]}
            />
          ) : <div style={{ marginTop: 8, color: '#999' }}>该类型无扩展字段，仅需基础内容字段。</div>}
        </div>
      </Space>
    )
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search placeholder="搜索平台名 / code" allowClear value={search}
          onChange={e => setSearch(e.target.value)} style={{ width: 280 }} />
        <Tag icon={<ProfileOutlined />} color="processing">共 {rows.length} 个平台</Tag>
        <a onClick={load}><ReloadOutlined /> 刷新</a>
      </Space>
      <Table
        rowKey="platform_code"
        loading={loading}
        dataSource={filtered}
        onRow={(r) => ({ onClick: () => setDetail(r), style: { cursor: 'pointer' } })}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: t => `共 ${t} 条` }}
        columns={[
          {
            title: '平台', width: 240,
            render: (_: any, r: PlatformMatrix) => (
              <span>{PLATFORM_NAMES[r.platform_code] || r.platform_code}
                <span style={{ fontSize: 11, color: '#999', marginLeft: 6 }}>{r.platform_code}</span></span>
            ),
          },
          {
            title: '上游', width: 100,
            render: (_: any, r: PlatformMatrix) => r.provider === 'composio'
              ? <Tag color="purple">Composio</Tag>
              : <Tag color="blue">灵径</Tag>,
          },
          {
            title: '支持发布类型', width: 200,
            render: (_: any, r: PlatformMatrix) => (
              <Space size={4}>
                {r.kinds.length
                  ? r.kinds.map(k => <Tag key={k} color={KIND_COLOR[k]}>{KIND_LABEL[k] || k}</Tag>)
                  : <span style={{ color: '#999' }}>未接入</span>}
              </Space>
            ),
          },
          {
            title: (
              <Tooltip title="关闭后，该平台的发布请求若标题 / 正文含 URL 或裸域名，网关在受理前直接拒绝（返回 40000），不产生上游费用。X 含链接帖子按次计费约 $0.20/条，普通帖约 $0.015/条">
                含链接发帖 ⓘ
              </Tooltip>
            ),
            width: 130,
            render: (_: any, r: PlatformMatrix) => (
              <span onClick={e => e.stopPropagation()}>
                <Switch
                  size="small"
                  checked={r.policy?.allow_links ?? true}
                  checkedChildren="允许"
                  unCheckedChildren="禁止"
                  loading={policySaving === r.platform_code}
                  onChange={(v) => togglePolicy(r, v)}
                />
              </span>
            ),
          },
          {
            title: '需选分类', width: 110,
            render: (_: any, r: PlatformMatrix) => {
              const hasCat = Object.values(r.fields).some(fs => fs.some(f => f.field === 'category'))
              const reqCat = Object.values(r.fields).some(fs => fs.some(f => f.field === 'category' && f.required))
              return hasCat ? <Tag color={reqCat ? 'red' : 'default'}>{reqCat ? '必选' : '可选'}</Tag> : '—'
            },
          },
          {
            title: '扩展字段',
            render: (_: any, r: PlatformMatrix) => {
              const set = new Set<string>()
              const req = new Set<string>()
              Object.values(r.fields).forEach(fs => fs.forEach(f => { set.add(f.field); if (f.required) req.add(f.field) }))
              if (!set.size) return <span style={{ color: '#999' }}>无</span>
              return (
                <Space size={4} wrap>
                  {[...set].map(f => (
                    <Tag key={f} color={req.has(f) ? 'red' : 'default'}>
                      {EXT_LABEL[f] || f}{req.has(f) ? ' *' : ''}
                    </Tag>
                  ))}
                </Space>
              )
            },
          },
          { title: '', width: 60, render: () => <a>详情</a> },
        ]}
      />

      <Drawer
        title={detail ? `${PLATFORM_NAMES[detail.platform_code] || detail.platform_code}（${detail.platform_code}）分发要求` : ''}
        width={680}
        open={!!detail}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <Tabs
            items={detail.kinds.map(k => ({
              key: k,
              label: <span>{KIND_LABEL[k] || k} <Badge count={(detail.fields[k] || []).length} showZero color="#999" /></span>,
              children: renderKindDetail(k),
            }))}
          />
        )}
        {detail && !detailStatic && (
          <Tooltip title="该平台缺少静态约束目录，仅展示扩展字段矩阵">
            <Typography.Text type="warning">注：长度/枚举等参考约束缺失</Typography.Text>
          </Tooltip>
        )}
      </Drawer>
    </div>
  )
}
