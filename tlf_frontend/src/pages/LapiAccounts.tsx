/** 平台底层账号（去重视图）：一行=一个物理社媒号，含灵径(国内)与 Composio(海外)两类上游。 */
import { useEffect, useMemo, useState } from 'react'
import {
  Avatar, Button, Card, Checkbox, Input, Select, Popconfirm, Space, Statistic, Table, Tag, Tooltip, message, Modal, Typography, Alert,
} from 'antd'
import { ReloadOutlined, SyncOutlined, DeleteOutlined, CloudSyncOutlined, LinkOutlined, SwapOutlined, ProfileOutlined, ClearOutlined } from '@ant-design/icons'
import { adminClient } from '../api/client'
import { PLATFORM_OPTIONS, platformLabel } from '../constants/platforms'

interface LapiAccount {
  id: string
  account_id: string            // 稳定账号 id（acc_xxx）
  lapi_account_id: string | null // 当前底层灵径会话 id
  platform_code: string
  platform_user_id: string
  platform_user_name: string | null
  platform_avatar: string | null
  platform_home_url: string | null
  status: string
  provider: string              // lapi=灵径(国内) / composio=海外
  proxy_id: string | null
  proxy_name: string | null
  proxy_server: string | null
  proxy_region: string | null   // 账号选定的分发代理区域
  binding_count: number
  last_authed_at: string | null
  last_sync_at: string | null
  created_at: string
}

interface SyncAllResult {
  target_app_id: string | null
  target_app_name: string | null
  total_remote: number
  synced_sessions: number
  distinct_accounts: number   // 去重后触达的独立物理账号数
  merged_duplicates: number   // 同一物理号的重复灵径会话（合并，旧会话已 revoke）
  created_bindings: number
  dirty_released: number
  revoked_sessions: number
}

interface ReapCandidate {
  account_id: string
  platform_code: string
  platform_user_name: string | null
  platform_user_id: string
  status: string
  last_active_at: string | null
  inactive_days: number | null
}

interface AccountStats {
  total: number               // 去重后物理账号总数（MediaAccount）
  provider_lapi: number
  provider_composio: number
  status_active: number
  status_expired: number
  status_revoked: number
  active_sessions: number     // 本地灵径活跃会话数（对账基准：≈灵径侧应有账号数）
  active_bindings: number     // 租户 active 绑定总数
}

export default function LapiAccounts() {
  const [rows, setRows] = useState<LapiAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [platform, setPlatform] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [providerFilter, setProviderFilter] = useState<string | undefined>()
  const [proxyFilter, setProxyFilter] = useState<string | undefined>()
  const [proxyList, setProxyList] = useState<any[]>([])
  const [showInactiveProxies, setShowInactiveProxies] = useState(false)
  const [syncingAll, setSyncingAll] = useState(false)
  const [result, setResult] = useState<SyncAllResult | null>(null)
  const [stats, setStats] = useState<AccountStats | null>(null)
  // 不活跃账号回收：dry-run 预览 → 确认执行
  const [reapPreview, setReapPreview] = useState<{ days: number; candidates: ReapCandidate[] } | null>(null)
  const [reapLoading, setReapLoading] = useState(false)
  const [reapExecuting, setReapExecuting] = useState(false)
  // 改代理弹窗
  const [proxyEditTarget, setProxyEditTarget] = useState<LapiAccount | null>(null)
  const [proxyEditValue, setProxyEditValue] = useState<string | undefined>()
  const [proxyEditSaving, setProxyEditSaving] = useState(false)
  // 作者信息（调试）弹窗
  const [authorInfo, setAuthorInfo] = useState<{ account: LapiAccount; data: any } | null>(null)
  const [authorInfoLoadingId, setAuthorInfoLoadingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (platform) p.set('platform_code', platform)
      if (statusFilter) p.set('status', statusFilter)
      if (providerFilter) p.set('provider', providerFilter)
      if (proxyFilter) p.set('proxy_id', proxyFilter)
      if (search.trim()) p.set('search', search.trim())
      const qs = p.toString()
      const data = await adminClient.get<LapiAccount[], LapiAccount[]>(`/accounts/lapi${qs ? `?${qs}` : ''}`)
      setRows(data)
    } catch (e: any) { message.error(e.message) }
    setLoading(false)
    // 顶部统计不受过滤影响，随列表一起刷新（best-effort）
    adminClient.get<AccountStats, AccountStats>('/accounts/lapi/stats')
      .then(setStats).catch(() => {})
  }
  useEffect(() => { load() }, [platform, statusFilter, providerFilter, proxyFilter])

  // 加载代理列表供「按代理筛选」下拉
  useEffect(() => {
    adminClient.get<any, any>('/proxies?page=1&page_size=200')
      .then(res => setProxyList(res?.items || []))
      .catch(() => {})
  }, [])

  // 下拉选项：默认只列可用代理；勾选后含禁用/过期，并在标签上标注状态
  const proxyOpts = useMemo(() => proxyList
    .filter((p: any) => showInactiveProxies || p.status === 'active')
    .map((p: any) => {
      const tag = p.status === 'disabled' ? ' · 已禁用'
        : p.status === 'expired' ? ' · 已过期'
        : p.health === 'dead' ? ' · 不通'
        : ''
      return { value: p.id, label: `${p.name}（${p.server_add}:${p.server_port}）${tag}` }
    }), [proxyList, showInactiveProxies])

  const sync = async (a: LapiAccount) => {
    try {
      const r = await adminClient.post<any, any>(`/accounts/lapi/${a.account_id}/sync`, {})
      // 海外账号：同步会重新拉昵称 / 头像并回填平台用户 id；身份接口失败时明确提示去看网关日志
      if (a.provider === 'composio' && r && r.identity_resolved === false) {
        message.warning('已同步状态，但平台身份接口未返回用户信息（昵称 / 头像仍为空），请查看网关日志中 [composio] 的告警')
      } else {
        message.success('已同步')
      }
    } catch (e: any) { message.error(e.message) }
    load()
  }
  const del = async (a: LapiAccount) => {
    await adminClient.delete(`/accounts/lapi/${a.account_id}`)
    message.success('已彻底删除（含灵径侧）')
    load()
  }
  // 【调试】拉灵径「作者信息」原始返回（含 raw），用于核对各平台主页 id 字段名（如快手 eid）
  const showAuthorInfo = async (a: LapiAccount) => {
    setAuthorInfoLoadingId(a.account_id)
    try {
      const data = await adminClient.post<any, any>(`/accounts/lapi/${a.account_id}/author-info`, {})
      setAuthorInfo({ account: a, data })
    } catch (e: any) {
      message.error(e.message || '获取作者信息失败')
    } finally {
      setAuthorInfoLoadingId(null)
    }
  }

  // 可分配的代理选项（仅 active，标注延迟/慢）
  const assignProxyOpts = useMemo(() => proxyList
    .filter((p: any) => p.status === 'active')
    .map((p: any) => {
      const tag = p.health === 'slow' ? ' · 慢' : p.health === 'dead' ? ' · 不通' : ''
      return { value: p.id, label: `${p.name}（${p.server_add}:${p.server_port}）${tag}` }
    }), [proxyList])

  const openProxyEdit = (a: LapiAccount) => {
    setProxyEditTarget(a)
    setProxyEditValue(a.proxy_id || undefined)
  }
  const submitProxyEdit = async () => {
    if (!proxyEditTarget) return
    setProxyEditSaving(true)
    try {
      await adminClient.post(`/accounts/lapi/${proxyEditTarget.account_id}/proxy`, {
        proxy_id: proxyEditValue || null,
      })
      message.success('代理已修改')
      setProxyEditTarget(null)
      load()
    } catch (e: any) { message.error(e.message) } finally { setProxyEditSaving(false) }
  }

  /** 不活跃回收：先 dry-run 预览候选列表，确认后执行（灵径 revoke 停止扣费 + 本地标 expired） */
  const previewReap = async () => {
    setReapLoading(true)
    try {
      const res = await adminClient.post<any, { days: number; candidates: ReapCandidate[]; count: number }>(
        '/accounts/reap-inactive?dry_run=true', {},
      )
      setReapPreview({ days: res.days, candidates: res.candidates })
    } catch (e: any) { message.error(e.message) } finally { setReapLoading(false) }
  }
  const executeReap = async () => {
    setReapExecuting(true)
    try {
      const res = await adminClient.post<any, { reaped: ReapCandidate[]; failed: string[] }>(
        '/accounts/reap-inactive?dry_run=false', {},
      )
      message.success(`已回收 ${res.reaped.length} 个不活跃账号${res.failed.length ? `，失败 ${res.failed.length} 个` : ''}`)
      setReapPreview(null)
      load()
    } catch (e: any) { message.error(e.message) } finally { setReapExecuting(false) }
  }

  /** 全量同步：与灵径对齐——有租户绑定的刷新落账（去重）；无人绑定的灵径账号视为脏数据，
   *  直接在灵径侧 revoke 释放（不导入）；灵径侧已消失的本地会话标 revoked。 */
  const syncAll = async () => {
    setSyncingAll(true)
    try {
      const q = platform ? `?platform_code=${platform}` : ''
      const res = await adminClient.post<SyncAllResult, SyncAllResult>(`/accounts/sync-all${q}`, {})
      setResult(res)
      load()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSyncingAll(false)
    }
  }

  return (
    <div>
      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <Card size="small" style={{ minWidth: 150 }}>
            <Statistic
              title={<Tooltip title="去重后的物理账号数（一行=一个真实社媒号），与列表「共 N 条」一致">账号总数（去重）</Tooltip>}
              value={stats.total}
            />
          </Card>
          <Card size="small" style={{ minWidth: 170 }}>
            <Statistic title="灵径（国内）/ Composio（海外）" value={stats.provider_lapi} suffix={` / ${stats.provider_composio}`} />
          </Card>
          <Card size="small" style={{ minWidth: 190 }}>
            <Statistic
              title={<span>正常 / <span style={{ color: '#f97316' }}>过期</span> / <span style={{ color: '#ef4444' }}>撤销</span></span>}
              value={stats.status_active}
              valueStyle={{ color: '#16a34a' }}
              suffix={<span style={{ fontSize: 16 }}> / <span style={{ color: '#f97316' }}>{stats.status_expired}</span> / <span style={{ color: '#ef4444' }}>{stats.status_revoked}</span></span>}
            />
          </Card>
          <Card size="small" style={{ minWidth: 160 }}>
            <Statistic
              title={<Tooltip title="本地记录的灵径活跃会话数 = 灵径侧应计费账号数（对账基准）。灵径后台/全量同步返回数若明显大于该值，说明灵径侧有重复扫码或无主会话，跑一次全量同步即可 revoke 对齐">灵径活跃会话 ⓘ</Tooltip>}
              value={stats.active_sessions}
            />
          </Card>
          <Card size="small" style={{ minWidth: 140 }}>
            <Statistic title="租户绑定数" value={stats.active_bindings} />
          </Card>
        </div>
      )}
      <Alert
        type="info" showIcon style={{ marginBottom: 16 }}
        message="全量同步说明"
        description={
          <span>
            「全量同步」拉取灵径当前所有授权账号，与推量发对齐：
            <b>已被租户绑定的账号</b>刷新落账（去重，灵径侧每个物理号只留 1 条会话）；
            <b>灵径有、但推量发无人绑定的账号视为脏数据，直接在灵径侧 revoke 释放</b>（停止扣费、不导入）。
            灵径侧已消失的本地会话标记为 <Tag color="red">revoked</Tag>。填了「平台」过滤时只同步该平台。
          </span>
        }
      />
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="按昵称 / 用户ID / acc_id 搜索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={() => load()}
          allowClear
          style={{ width: 260 }}
        />
        <Select
          placeholder="按平台过滤（可空=全部）"
          value={platform || undefined}
          onChange={(v) => setPlatform(v || '')}
          options={PLATFORM_OPTIONS}
          allowClear showSearch optionFilterProp="label"
          style={{ width: 240 }}
        />
        <Select
          placeholder="按状态过滤"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'active', label: '正常' },
            { value: 'expired', label: '登录过期' },
            { value: 'revoked', label: '已撤销' },
          ]}
          allowClear
          style={{ width: 140 }}
        />
        <Select
          placeholder="按上游过滤"
          value={providerFilter}
          onChange={setProviderFilter}
          options={[
            { value: 'lapi', label: '灵径（国内）' },
            { value: 'composio', label: 'Composio（海外）' },
          ]}
          allowClear
          style={{ width: 160 }}
        />
        <Select
          placeholder="按代理过滤（可空=全部）"
          value={proxyFilter}
          onChange={(v) => setProxyFilter(v)}
          options={proxyOpts}
          allowClear showSearch optionFilterProp="label"
          style={{ width: 300 }}
        />
        <Checkbox
          checked={showInactiveProxies}
          onChange={(e) => setShowInactiveProxies(e.target.checked)}
        >显示禁用/过期代理</Checkbox>
        <Popconfirm
          title="全量同步灵径账号？"
          description={`将拉取灵径${platform ? `「${platformLabel(platform)}」平台` : '全部'}账号与推量发对齐：有主账号刷新落账，无人绑定的脏账号将在灵径侧 revoke 释放`}
          onConfirm={syncAll}
        >
          <Button type="primary" icon={<CloudSyncOutlined />} loading={syncingAll}>全量同步</Button>
        </Popconfirm>
        <Button icon={<ClearOutlined />} loading={reapLoading} onClick={previewReap}>回收不活跃账号</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: t => `共 ${t} 条` }}
        columns={[
          {
            title: '账号', width: 240,
            render: (_: any, r: LapiAccount) => (
              <Space>
                {r.platform_avatar && <Avatar src={r.platform_avatar} />}
                <div>
                  <div>{r.platform_user_name || r.platform_user_id}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{r.account_id}</div>
                </div>
              </Space>
            ),
          },
          {
            title: '平台', dataIndex: 'platform_code', width: 140,
            render: (c: string) => <span>{platformLabel(c)} <span style={{ fontSize: 11, color: '#999' }}>{c}</span></span>,
          },
          {
            title: '上游', dataIndex: 'provider', width: 110,
            render: (p: string) => p === 'composio'
              ? <Tag color="purple">Composio</Tag>
              : <Tag color="blue">灵径</Tag>,
          },
          {
            title: '状态', dataIndex: 'status', width: 110,
            render: (s: string) => {
              const map: Record<string, { color: string; label: string }> = {
                active: { color: 'green', label: '正常' },
                expired: { color: 'orange', label: '登录过期' },
                orphaned: { color: 'orange', label: 'orphaned' },
                revoked: { color: 'red', label: '已撤销' },
              }
              const m = map[s] ?? { color: 'red', label: s }
              return <Tag color={m.color}>{m.label}</Tag>
            },
          },
          {
            title: '当前代理', width: 200,
            render: (_: any, r: LapiAccount) => (
              r.provider === 'composio' ? <span style={{ color: '#bbb' }}>海外免代理</span> :
              <div>
                {r.proxy_server ? (
                  <>
                    <div style={{ fontSize: 12 }}>{r.proxy_name || '-'}</div>
                    <code style={{ fontSize: 11, color: '#999' }}>{r.proxy_server}</code>
                  </>
                ) : <span style={{ color: '#bbb' }}>未分配</span>}
                {r.proxy_region && (
                  <div style={{ marginTop: 2 }}>
                    <Tag color="geekblue" style={{ fontSize: 11, marginInlineEnd: 0 }}>区域 {r.proxy_region}</Tag>
                  </div>
                )}
              </div>
            ),
          },
          { title: '租户绑定数', dataIndex: 'binding_count', width: 120 },
          {
            title: '最近同步', dataIndex: 'last_sync_at', width: 180,
            render: (d: string | null) => d ? new Date(d).toLocaleString('zh-CN') : '-',
          },
          {
            title: '操作',
            render: (_: any, a: LapiAccount) => (
              <Space size="small">
                {a.platform_home_url && (
                  <Button
                    size="small" icon={<LinkOutlined />}
                    href={a.platform_home_url} target="_blank" rel="noopener noreferrer"
                  >前往主页</Button>
                )}
                {/* 同步两类账号都可用：灵径刷会话状态；Composio 重拉昵称 / 头像 / 主页并回填用户 id */}
                <Button size="small" icon={<SyncOutlined />} onClick={() => sync(a)}>同步</Button>
                {/* 改代理 / 作者信息是灵径会话专有，Composio(海外)账号无底层会话，隐藏 */}
                {a.provider !== 'composio' && (
                  <>
                    <Button size="small" icon={<SwapOutlined />} onClick={() => openProxyEdit(a)}>改代理</Button>
                    <Button
                      size="small" icon={<ProfileOutlined />}
                      loading={authorInfoLoadingId === a.account_id}
                      onClick={() => showAuthorInfo(a)}
                    >作者信息</Button>
                  </>
                )}
                <Popconfirm title="彻底删除（含灵径侧 revoke）？" onConfirm={() => del(a)}>
                  <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={`作者信息（调试）· ${authorInfo ? platformLabel(authorInfo.account.platform_code) : ''} · ${authorInfo?.account.platform_user_name || ''}`}
        open={!!authorInfo}
        onCancel={() => setAuthorInfo(null)}
        footer={<Button onClick={() => setAuthorInfo(null)}>关闭</Button>}
        width={760}
      >
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message="灵径「获取作者信息」原始返回"
          description="快手 web 主页所需的 eid（如 3xx3zy88mssj3gw）应在 raw 里。请把下面 JSON（尤其 raw 内容）整段复制发回，我据此确定字段名。"
        />
        <Typography.Paragraph copyable={{ text: JSON.stringify(authorInfo?.data ?? {}, null, 2) }}>
          <pre style={{ maxHeight: 440, overflow: 'auto', background: '#f6f6f6', padding: 12, borderRadius: 6, margin: 0 }}>
            {JSON.stringify(authorInfo?.data ?? {}, null, 2)}
          </pre>
        </Typography.Paragraph>
      </Modal>

      <Modal
        title={`回收不活跃账号（超过 ${reapPreview?.days ?? '-'} 天未使用）`}
        open={!!reapPreview}
        onCancel={() => setReapPreview(null)}
        width={720}
        footer={[
          <Button key="cancel" onClick={() => setReapPreview(null)}>取消</Button>,
          <Popconfirm
            key="ok"
            title={`确认回收这 ${reapPreview?.candidates.length ?? 0} 个账号？`}
            description="将在灵径侧 revoke（停止按天扣费），账号状态变为「登录过期」，下游需重新扫码绑定后恢复"
            onConfirm={executeReap}
            disabled={!reapPreview?.candidates.length}
          >
            <Button type="primary" danger loading={reapExecuting} disabled={!reapPreview?.candidates.length}>
              确认回收 {reapPreview?.candidates.length ?? 0} 个
            </Button>
          </Popconfirm>,
        ]}
      >
        <Alert
          type="warning" showIcon style={{ marginBottom: 12 }}
          message="灵径按会话按天扣费"
          description={
            <span>
              「使用」= 发布 / 取分类 / 风控操作 / 重新扫码授权；<b>不含登录态轮询与自动刷指标</b>（下游定时任务不算活跃）。
              回收后：灵径侧 revoke 停止扣费，账号标为「登录过期」——下游列表仍显示该账号（acc_xxx 不变），
              登录态检查返回掉线，重新扫码绑定即可恢复。后台每 12 小时也会自动跑一轮（.env 可配）。
            </span>
          }
        />
        {reapPreview?.candidates.length ? (
          <Table
            rowKey="account_id"
            size="small"
            dataSource={reapPreview.candidates}
            pagination={{ pageSize: 10, showTotal: t => `共 ${t} 条` }}
            columns={[
              {
                title: '账号',
                render: (_: any, c: ReapCandidate) => (
                  <div>
                    <div>{c.platform_user_name || c.platform_user_id}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>{c.account_id}</div>
                  </div>
                ),
              },
              { title: '平台', dataIndex: 'platform_code', width: 130, render: (c: string) => platformLabel(c) },
              {
                title: '状态', dataIndex: 'status', width: 100,
                render: (s: string) => <Tag color={s === 'active' ? 'green' : 'orange'}>{s === 'active' ? '正常' : '登录过期'}</Tag>,
              },
              { title: '不活跃天数', dataIndex: 'inactive_days', width: 110, render: (d: number | null) => d != null ? `${d} 天` : '-' },
              {
                title: '最后活跃', dataIndex: 'last_active_at', width: 170,
                render: (d: string | null) => d ? new Date(d).toLocaleString('zh-CN') : '-',
              },
            ]}
          />
        ) : (
          <Typography.Text type="secondary">没有符合条件的不活跃账号。</Typography.Text>
        )}
      </Modal>

      <Modal
        title="全量同步完成"
        open={!!result}
        onCancel={() => setResult(null)}
        onOk={() => setResult(null)}
        okText="知道了"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        {result && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Paragraph>
              {result.target_app_name ? (
                <>
                  已归属到租户：<b>{result.target_app_name}</b>
                  <Typography.Text code style={{ marginLeft: 8 }}>{result.target_app_id}</Typography.Text>
                </>
              ) : (
                <Typography.Text type="secondary">仅刷新底层账号，未改动任何租户绑定。</Typography.Text>
              )}
            </Typography.Paragraph>
            <Space size="large" wrap>
              <span>灵径返回：<b>{result.total_remote}</b> 个会话</span>
              <span style={{ color: '#3b82f6' }}>刷新落账：{result.synced_sessions}（独立账号 {result.distinct_accounts}）</span>
              <span style={{ color: '#8b5cf6' }}>新增绑定：{result.created_bindings}</span>
              <span style={{ color: '#f97316' }}>释放无主脏账号：{result.dirty_released}</span>
              <span style={{ color: '#ef4444' }}>标记吊销会话：{result.revoked_sessions}</span>
            </Space>
            {(result.merged_duplicates > 0 || result.dirty_released > 0) && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                灵径返回的是「会话」数（同一账号重复扫码会产生多条）：本次
                {result.merged_duplicates > 0 && <>合并重复会话 <b>{result.merged_duplicates}</b> 条（旧会话已在灵径侧 revoke 停止扣费）</>}
                {result.merged_duplicates > 0 && result.dirty_released > 0 && '；'}
                {result.dirty_released > 0 && <>释放无主会话 <b>{result.dirty_released}</b> 条</>}
                。因此列表里去重后的账号数会小于灵径返回数，属正常现象。
              </Typography.Text>
            )}
          </Space>
        )}
      </Modal>

      <Modal
        title="修改代理"
        open={!!proxyEditTarget}
        onCancel={() => setProxyEditTarget(null)}
        onOk={submitProxyEdit}
        okText="保存"
        confirmLoading={proxyEditSaving}
      >
        {proxyEditTarget && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              账号：{proxyEditTarget.platform_user_name || proxyEditTarget.platform_user_id}
              （{proxyEditTarget.account_id}）
            </Typography.Text>
            <Select
              placeholder="选择要切换到的代理（清空=解绑，下次自动分配）"
              value={proxyEditValue}
              onChange={setProxyEditValue}
              options={assignProxyOpts}
              allowClear showSearch optionFilterProp="label"
              style={{ width: '100%' }}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              仅作用于该账号当前会话；保存后立即生效，并清零新代理的「灵径侧失败」计数。
            </Typography.Text>
          </Space>
        )}
      </Modal>
    </div>
  )
}
