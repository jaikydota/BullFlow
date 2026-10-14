/**
 * 代理池管理。
 *
 * - 列表（搜索 + 状态过滤 + 分页）
 * - 新增 / 编辑 / 删除（删时自动释放绑定账号）
 * - 批量导入：左侧粘贴文本（每行 1 条），右侧填共享字段补全行内空字段
 * - 维护：批量把过期代理标 expired + 释放账号
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Button, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag,
  message, Tooltip, DatePicker, Typography, Alert,
} from 'antd'
import {
  PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined,
  ImportOutlined, ClockCircleOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { adminClient } from '../api/client'
import { platformLabel } from '../constants/platforms'

interface PlatformUsageItem {
  platform_code: string
  count: number
  cap: number
  full: boolean
}

interface RegionSummaryItem {
  region: string | null      // null = 未分区
  total: number              // 该区域代理总数
  usable: number             // 可用数（=SDK 下发口径：active+未过期+连通正常）
  account_count: number      // 该区域代理上已绑账号数
}

interface Proxy {
  id: string
  name: string
  region: string | null
  server_add: string
  server_port: number
  proxy_type: 'socks5' | 'http'
  user_name: string | null
  max_users: number | null
  effective_max_users: number
  current_account_count: number
  expires_at: string | null
  status: 'active' | 'expired' | 'disabled'
  order_no: string | null
  notes: string | null
  health: 'unknown' | 'ok' | 'slow' | 'dead'
  last_check_at: string | null
  last_latency_ms: number | null
  fail_count: number
  blocked_platforms: string[]
  sort_order: number
  created_at: string
  updated_at: string
}

const STATUS_COLOR: Record<string, string> = {
  active: 'green', expired: 'orange', disabled: 'default',
}

const HEALTH_META: Record<string, { color: string; label: string }> = {
  ok: { color: 'green', label: '正常' },
  slow: { color: 'orange', label: '慢' },
  dead: { color: 'red', label: '不通' },
  unknown: { color: 'default', label: '未测' },
}

export default function Proxies() {
  const [rows, setRows] = useState<Proxy[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [regionFilter, setRegionFilter] = useState<string | undefined>()
  const [regionSummary, setRegionSummary] = useState<RegionSummaryItem[]>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState<Proxy | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()
  // 每代理的平台分布（展开行懒加载）：proxyId → items | 'loading'
  const [usageMap, setUsageMap] = useState<Record<string, PlatformUsageItem[] | 'loading'>>({})

  const loadUsage = async (proxyId: string) => {
    setUsageMap(m => ({ ...m, [proxyId]: 'loading' }))
    try {
      const res = await adminClient.get<any, any>(`/proxies/${proxyId}/platform-usage`)
      setUsageMap(m => ({ ...m, [proxyId]: res?.items || [] }))
    } catch (e: any) {
      message.error(e.message)
      setUsageMap(m => ({ ...m, [proxyId]: [] }))
    }
  }

  const loadRegionSummary = async () => {
    try {
      const res = await adminClient.get<any, any>('/proxies/regions/summary')
      setRegionSummary(res?.items || [])
    } catch { /* 概览失败不打扰主流程 */ }
  }

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (statusFilter) params.set('status', statusFilter)
      if (regionFilter) params.set('region', regionFilter)
      if (search) params.set('search', search)
      const resp = await adminClient.get<any, any>(`/proxies?${params}`)
      setRows(resp.items || [])
      setTotal(resp.total || 0)
      loadRegionSummary()
    } catch (e: any) { message.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [page, pageSize, statusFilter, regionFilter])

  const submitCreate = async () => {
    const v = await form.validateFields()
    // 后端 expires_at 为 naive DateTime、前端按本地时间显示，故发送本地墙钟（不转 UTC）
    if (v.expires_at) v.expires_at = v.expires_at.format('YYYY-MM-DDTHH:mm:ss')
    await adminClient.post('/proxies', v)
    setCreateOpen(false); form.resetFields(); message.success('已创建'); load()
  }
  const submitEdit = async () => {
    if (!editOpen) return
    const v = await editForm.validateFields()
    if (v.expires_at && typeof v.expires_at !== 'string') v.expires_at = v.expires_at.format('YYYY-MM-DDTHH:mm:ss')
    await adminClient.patch(`/proxies/${editOpen.id}`, v)
    setEditOpen(null); message.success('已保存'); load()
  }
  const del = async (p: Proxy) => {
    await adminClient.delete(`/proxies/${p.id}`)
    message.success('已删除'); load()
  }
  const expireOverdue = async () => {
    const res = await adminClient.post<any, any>('/proxies/_expire-overdue', {})
    message.success(`已处理 ${res?.expired_count ?? 0} 条到期代理`)
    load()
  }
  const unblockPlatform = async (proxyId: string, code: string) => {
    try {
      await adminClient.post(`/proxies/${proxyId}/unblock-platform`, { platform_code: code })
      message.success(`已解除「${platformLabel(code)}」屏蔽`)
      load()
    } catch (e: any) { message.error(e.message) }
  }
  const runHealthCheck = async () => {
    setChecking(true)
    try {
      const res = await adminClient.post<any, any>('/proxies/health-check', {})
      message.success(`巡检完成：正常 ${res?.ok ?? 0} / 慢 ${res?.slow ?? 0} / 不通 ${res?.dead ?? 0}`)
      load()
    } catch (e: any) { message.error(e.message) } finally { setChecking(false) }
  }

  const formItems = (
    <>
      <Form.Item name="name" label="节点名" rules={[{ required: true }]}><Input placeholder="如：广州-100M" /></Form.Item>
      <Form.Item name="region" label="地区"><Input placeholder="如：广东省" /></Form.Item>
      <Space.Compact style={{ width: '100%' }}>
        <Form.Item name="server_add" label="IP / 域名" rules={[{ required: true }]} style={{ flex: 1, marginRight: 8 }}>
          <Input placeholder="例：1.2.3.4 或 proxy.example.com" />
        </Form.Item>
        <Form.Item name="server_port" label="端口" rules={[{ required: true }]} style={{ width: 130 }}>
          <InputNumber min={1} max={65535} style={{ width: '100%' }} />
        </Form.Item>
      </Space.Compact>
      <Form.Item name="proxy_type" label="类型" initialValue="socks5">
        <Select options={[{ value: 'socks5', label: 'socks5' }, { value: 'http', label: 'http' }]} />
      </Form.Item>
      <Space.Compact style={{ width: '100%' }}>
        <Form.Item name="user_name" label="用户名（可选）" style={{ flex: 1, marginRight: 8 }}>
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item name="password" label="密码（可选）" style={{ flex: 1 }}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Space.Compact>
      <Space.Compact style={{ width: '100%' }}>
        <Form.Item name="max_users" label="每平台容量上限（空=默认 50，即每个平台最多 N 个账号）" style={{ flex: 1, marginRight: 8 }}>
          <InputNumber min={1} max={100000} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="expires_at" label="过期时间（空=永久）" style={{ flex: 1 }}>
          <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
        </Form.Item>
      </Space.Compact>
      <Form.Item name="sort_order" label="排序权重（越大越靠前，影响区域下发顺序 + 列表顺序；不影响分配）" initialValue={0}>
        <InputNumber min={-100000} max={100000} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name="order_no" label="采购订单号（可选）"><Input /></Form.Item>
      <Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="status" label="状态" initialValue="active">
        <Select options={[
          { value: 'active', label: '启用' },
          { value: 'expired', label: '已过期' },
          { value: 'disabled', label: '禁用' },
        ]} />
      </Form.Item>
    </>
  )

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="按节点名 / IP 搜索"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onSearch={() => { setPage(1); load() }}
          style={{ width: 240 }} allowClear
        />
        <Select placeholder="状态" allowClear value={statusFilter} onChange={setStatusFilter} style={{ width: 120 }}
          options={[
            { value: 'active', label: '启用' },
            { value: 'expired', label: '已过期' },
            { value: 'disabled', label: '禁用' },
          ]} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新增代理</Button>
        <Button icon={<ImportOutlined />} onClick={() => setBulkOpen(true)}>批量导入</Button>
        <Button icon={<ClockCircleOutlined />} onClick={expireOverdue}>处理过期代理</Button>
        <Button icon={<ThunderboltOutlined />} loading={checking} onClick={runHealthCheck}>立即巡检</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </Space>

      {regionSummary.length > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 12px', background: '#fafafa', borderRadius: 8 }}>
          <Space size={[8, 8]} wrap>
            <span style={{ color: '#888', fontSize: 12 }}>区域概览（可用/总数 · 账号，点击筛选）：</span>
            <Tag.CheckableTag checked={!regionFilter} onChange={() => { setRegionFilter(undefined); setPage(1) }}>
              全部
            </Tag.CheckableTag>
            {regionSummary.map((r) => {
              if (r.region == null) {
                return (
                  <Tooltip key="__null__" title="未填区域的代理：仅用于不指定区域的默认分配，不在区域接口对平台下发">
                    <Tag>未分区 · {r.usable}/{r.total} · 账号 {r.account_count}</Tag>
                  </Tooltip>
                )
              }
              const noUsable = r.usable === 0
              return (
                <Tooltip key={r.region} title={noUsable ? '该区域当前无可用代理，平台选此区域会降级到其它区域' : undefined}>
                  <Tag.CheckableTag
                    checked={regionFilter === r.region}
                    onChange={(c) => { setRegionFilter(c ? r.region! : undefined); setPage(1) }}
                  >
                    <span style={{ color: noUsable ? '#ef4444' : undefined }}>
                      {r.region} · 可用 {r.usable}/{r.total} · 账号 {r.account_count}
                    </span>
                  </Tag.CheckableTag>
                </Tooltip>
              )
            })}
          </Space>
        </div>
      )}

      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        scroll={{ x: 1400 }}
        expandable={{
          onExpand: (expanded, record: Proxy) => {
            if (expanded) loadUsage(record.id)  // 每次展开刷新，避免绑定/删除后数据过期
          },
          expandedRowRender: (record: Proxy) => {
            const u = usageMap[record.id]
            if (u === 'loading' || u === undefined) {
              return <span style={{ color: '#888' }}>加载中…</span>
            }
            if (u.length === 0) {
              return <span style={{ color: '#888' }}>该代理暂未绑定任何平台账号</span>
            }
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {u.map(item => (
                  <Tag key={item.platform_code} color={item.full ? 'red' : 'blue'}>
                    {platformLabel(item.platform_code)}：{item.count} / {item.cap}
                    {item.full ? '（满）' : ''}
                  </Tag>
                ))}
              </div>
            )
          },
        }}
        pagination={{
          current: page, pageSize, total,
          showSizeChanger: true, pageSizeOptions: [20, 50, 100],
          onChange: (p, ps) => { setPage(p); setPageSize(ps) },
          showTotal: t => `共 ${t} 条`,
        }}
        columns={[
          { title: '节点名', dataIndex: 'name', width: 160, fixed: 'left' },
          {
            title: '排序', dataIndex: 'sort_order', width: 70,
            render: (v: number) => <span style={{ color: v ? '#1677ff' : '#bbb' }}>{v ?? 0}</span>,
          },
          { title: '地区', dataIndex: 'region', width: 100 },
          {
            title: '地址', width: 220,
            render: (_, p: Proxy) => (
              <Typography.Text copyable={{ text: `${p.server_add}:${p.server_port}` }}>
                <code style={{ fontSize: 12 }}>{p.server_add}:{p.server_port}</code>
              </Typography.Text>
            ),
          },
          {
            title: '类型', dataIndex: 'proxy_type', width: 80,
            render: (t: string) => <Tag color={t === 'socks5' ? 'blue' : 'cyan'}>{t}</Tag>,
          },
          {
            title: '已绑账号', width: 130,
            render: (_, p: Proxy) => (
              <Tooltip title={`容量按平台计：每个平台最多 ${p.effective_max_users} 个账号（${p.max_users ? '自定义' : '全局默认'}）。当前为该代理跨所有平台的总绑定数。`}>
                <span style={{ color: '#22c55e' }}>{p.current_account_count}</span>
                <span style={{ color: '#888' }}> 个 · 每平台上限 {p.effective_max_users}</span>
              </Tooltip>
            ),
          },
          {
            title: '过期时间', dataIndex: 'expires_at', width: 180,
            render: (d: string | null) => {
              if (!d) return <Tag>永久</Tag>
              const dt = dayjs(d)
              const overdue = dt.isBefore(dayjs())
              return (
                <span style={{ color: overdue ? '#ef4444' : undefined }}>
                  {dt.format('YYYY-MM-DD HH:mm')}
                  {overdue && ' (已到期)'}
                </span>
              )
            },
          },
          {
            title: '状态', dataIndex: 'status', width: 100,
            render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
          },
          {
            title: '连通性', width: 150,
            render: (_, p: Proxy) => {
              const m = HEALTH_META[p.health] ?? HEALTH_META.unknown
              return (
                <Tooltip title={
                  p.last_check_at
                    ? `最近检测 ${dayjs(p.last_check_at).format('MM-DD HH:mm')}${p.fail_count ? ` · 连续失败 ${p.fail_count} 次` : ''}`
                    : '尚未检测'
                }>
                  <Tag color={m.color}>{m.label}</Tag>
                  {p.last_latency_ms != null && (
                    <span style={{ color: '#888', fontSize: 12 }}>{p.last_latency_ms}ms</span>
                  )}
                </Tooltip>
              )
            },
          },
          {
            title: '平台屏蔽', width: 170,
            render: (_, p: Proxy) => (
              p.blocked_platforms?.length ? (
                <Space size={4} wrap>
                  {p.blocked_platforms.map((code) => (
                    <Popconfirm
                      key={code}
                      title={`解除「${platformLabel(code)}」对该代理的屏蔽？`}
                      description="该平台账号下次可重新分到此代理"
                      onConfirm={() => unblockPlatform(p.id, code)}
                    >
                      <Tag color="red" style={{ cursor: 'pointer' }}>{platformLabel(code)} ✕</Tag>
                    </Popconfirm>
                  ))}
                </Space>
              ) : <span style={{ color: '#bbb' }}>-</span>
            ),
          },
          { title: '订单号', dataIndex: 'order_no', width: 120, ellipsis: true },
          { title: '备注', dataIndex: 'notes', ellipsis: true },
          {
            title: '操作', width: 160, fixed: 'right',
            render: (_, p: Proxy) => (
              <Space size="small">
                <Button size="small" icon={<EditOutlined />} onClick={() => {
                  setEditOpen(p)
                  editForm.setFieldsValue({
                    ...p,
                    password: '', // 编辑时不回显，空提交=不修改
                    expires_at: p.expires_at ? dayjs(p.expires_at) : undefined,
                  })
                }}>编辑</Button>
                <Popconfirm
                  title={`删除代理「${p.name}」？`}
                  description={p.current_account_count > 0 ? `已绑定 ${p.current_account_count} 个账号将被解绑` : undefined}
                  onConfirm={() => del(p)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal title="新增代理" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={submitCreate} width={620}>
        <Form form={form} layout="vertical">{formItems}</Form>
      </Modal>

      <Drawer title="编辑代理" width={560} open={!!editOpen} onClose={() => setEditOpen(null)}
        extra={<Button type="primary" onClick={submitEdit}>保存</Button>}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="密码留空提交=不修改原密码" />
        <Form form={editForm} layout="vertical">{formItems}</Form>
      </Drawer>

      <BulkImportModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onDone={() => { setBulkOpen(false); load() }}
      />
    </div>
  )
}


/* ─────────── 批量导入子组件 ─────────── */

interface BulkRow {
  name: string
  server_add: string
  server_port: number
  region?: string
  user_name?: string
  password?: string
}

function BulkImportModal({ open, onClose, onDone }: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [text, setText] = useState('')
  const [sharedForm] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  /** 把每行拆成字段。分隔符自适应：tab / 空格 / 逗号 / 中文逗号 / 竖线。 */
  const rows: BulkRow[] = useMemo(() => parseRows(text), [text])
  const invalidLines = useMemo(() => {
    const lines = text.split('\n').map(s => s.trim()).filter(l => l && !l.startsWith('#'))
    return lines.length - rows.length
  }, [text, rows])

  const submit = async () => {
    if (rows.length === 0) { message.warning('请粘贴至少 1 条代理'); return }
    const shared = await sharedForm.validateFields().catch(() => null)
    if (shared && shared.expires_at && typeof shared.expires_at !== 'string') {
      shared.expires_at = shared.expires_at.format('YYYY-MM-DDTHH:mm:ss')
    }
    setSubmitting(true)
    try {
      const res = await adminClient.post<any, any>('/proxies/bulk', { rows, shared })
      message.success(`已导入 ${res?.count ?? 0} 条`)
      setText('')
      sharedForm.resetFields()
      onDone()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="批量导入代理"
      open={open}
      onCancel={onClose}
      onOk={submit}
      okText={`导入 ${rows.length} 条`}
      okButtonProps={{ disabled: rows.length === 0, loading: submitting }}
      width={920}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
            每行一条代理，字段顺序：<br />
            <code>name  ip  port  [region]  [user_name]  [password]</code><br />
            分隔符自适应（Tab / 空格 / 逗号 / 中文逗号 / 竖线）；空字段用 - 占位；# 开头注释
          </Typography.Paragraph>
          <Input.TextArea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={
              '示例：\n广州-100M  1.2.3.4  1080  广东省  alice  secret\n深圳-100M, 5.6.7.8, 1080\n北京-100M | 9.10.11.12 | 1080'
            }
            rows={14}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <div style={{ marginTop: 8 }}>
            {rows.length > 0 && <Tag color="green">已解析 {rows.length} 条</Tag>}
            {invalidLines > 0 && <Tag color="orange">{invalidLines} 行格式错误已忽略</Tag>}
          </div>
        </div>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            共享字段：行里没填的字段从这里取
          </Typography.Text>
          <Form form={sharedForm} layout="vertical" style={{ marginTop: 8 }}>
            <Form.Item name="region" label="地区"><Input /></Form.Item>
            <Form.Item name="proxy_type" label="类型" initialValue="socks5">
              <Select options={[{ value: 'socks5' }, { value: 'http' }]} />
            </Form.Item>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="user_name" label="共享用户名" style={{ flex: 1, marginRight: 8 }}>
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name="password" label="共享密码" style={{ flex: 1 }}>
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </Space.Compact>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="max_users" label="每平台容量上限" style={{ flex: 1, marginRight: 8 }}>
                <InputNumber min={1} max={100000} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="expires_at" label="过期时间" style={{ flex: 1 }}>
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Space.Compact>
            <Form.Item name="sort_order" label="排序权重（越大越靠前；不影响分配）">
              <InputNumber min={-100000} max={100000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="order_no" label="采购订单号"><Input /></Form.Item>
            <Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item>
          </Form>
        </div>
      </div>
    </Modal>
  )
}

/** 把粘贴的多行文本拆成代理行。 */
function parseRows(text: string): BulkRow[] {
  const out: BulkRow[] = []
  const SEP = /[\s,，|\t]+/
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(SEP).map(s => s.trim()).filter(Boolean)
    if (parts.length < 3) continue
    const port = Number(parts[2])
    if (!parts[0] || !parts[1] || !Number.isFinite(port) || port < 1 || port > 65535) continue
    const row: BulkRow = { name: parts[0], server_add: parts[1], server_port: port }
    const pick = (i: number) => {
      const v = parts[i]
      return v && v !== '-' ? v : undefined
    }
    if (parts[3] != null) row.region = pick(3)
    if (parts[4] != null) row.user_name = pick(4)
    if (parts[5] != null) row.password = pick(5)
    out.push(row)
  }
  return out
}
