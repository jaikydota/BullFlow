/** 租户账号绑定视图（mapping 表，每行 1 条 binding；同一 lapi_account 可有多行）。 */
import { useEffect, useState } from 'react'
import { Button, Select, Popconfirm, Space, Table, Tag, message } from 'antd'
import { ReloadOutlined, DisconnectOutlined } from '@ant-design/icons'
import { adminClient } from '../api/client'
import { platformLabel } from '../constants/platforms'

interface Binding {
  id: string
  app_id: string
  app_name: string | null
  account_id: string | null
  lapi_account_id: string | null
  platform_code: string | null
  platform_user_name: string | null
  custom_label: string | null
  status: string
  bound_at: string | null
  created_at: string
}

interface Tenant {
  id: string
  name: string
  app_id: string
  status: string
}

export default function TenantBindings() {
  const [rows, setRows] = useState<Binding[]>([])
  const [loading, setLoading] = useState(false)
  const [appIdFilter, setAppIdFilter] = useState<string | undefined>()
  const [tenants, setTenants] = useState<Tenant[]>([])

  const loadTenants = async () => {
    try {
      setTenants(await adminClient.get<Tenant[], Tenant[]>('/tenants'))
    } catch (e: any) { message.error(e.message) }
  }

  const load = async () => {
    setLoading(true)
    try {
      const q = appIdFilter ? `?app_id_filter=${appIdFilter}` : ''
      setRows(await adminClient.get<Binding[], Binding[]>(`/accounts/bindings${q}`))
    } catch (e: any) { message.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { loadTenants() }, [])
  useEffect(() => { load() }, [appIdFilter])

  const unbind = async (b: Binding) => {
    const res = await adminClient.delete<any, any>(`/accounts/bindings/${b.id}`)
    if (res?.lapi_revoked) {
      message.success('已解绑；该账号已无其它租户绑定，已同步在灵径侧删除')
    } else {
      message.success(`已解绑（该账号还被 ${res?.remaining_bindings ?? 0} 个租户绑定）`)
    }
    load()
  }

  const tenantOptions = tenants.map(t => ({
    value: t.app_id,
    label: `${t.name} (${t.app_id})${t.status !== 'active' ? ' · 已停用' : ''}`,
  }))

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="按租户过滤（可空=全部）"
          value={appIdFilter}
          onChange={(v) => setAppIdFilter(v || undefined)}
          options={tenantOptions}
          allowClear showSearch optionFilterProp="label"
          style={{ width: 320 }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => { loadTenants(); load() }}>刷新</Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: t => `共 ${t} 条` }}
        columns={[
          { title: '租户', dataIndex: 'app_name', width: 200,
            render: (n, r: Binding) => <div>{n}<div style={{ fontSize: 11, color: '#999' }}>{r.app_id}</div></div> },
          { title: '账号 ID', dataIndex: 'account_id', width: 230,
            render: (v: string | null) => v ? <code style={{ fontSize: 12 }}>{v}</code> : '-' },
          { title: '灵径会话 ID', dataIndex: 'lapi_account_id', width: 230,
            render: (v: string | null) => v ? <code style={{ fontSize: 12, color: '#888' }}>{v}</code> : '-' },
          {
            title: '平台', dataIndex: 'platform_code', width: 140,
            render: (c: string | null) => c ? <span>{platformLabel(c)} <span style={{ fontSize: 11, color: '#999' }}>{c}</span></span> : '-',
          },
          { title: '账号名', dataIndex: 'platform_user_name' },
          { title: '别名', dataIndex: 'custom_label', render: (v) => v || '-' },
          { title: '状态', dataIndex: 'status', width: 80, render: (s: string) => <Tag color={s === 'active' ? 'green' : 'default'}>{s}</Tag> },
          { title: '绑定时间', dataIndex: 'bound_at', width: 160, render: (d: string | null) => d ? new Date(d).toLocaleString('zh-CN') : '-' },
          {
            title: '操作', width: 100,
            render: (_, b: Binding) => (
              <Popconfirm
                title="解绑该租户与账号"
                description="若解绑后该账号已无任何租户绑定，将同步在灵径侧删除该账号"
                onConfirm={() => unbind(b)}
              >
                <Button size="small" danger icon={<DisconnectOutlined />}>解绑</Button>
              </Popconfirm>
            ),
          },
        ]}
      />
    </div>
  )
}
