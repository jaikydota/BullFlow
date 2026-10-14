/** 全租户发布任务监控。 */
import { useEffect, useState } from 'react'
import { Button, Input, Select, Space, Table, Tag, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { adminClient } from '../api/client'

interface Task {
  id: string
  platform_code: string
  status: string
  total_count: number
  success_count: number
  failed_count: number
  pre_pub_time: number | null
  created_at: string
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'default', publishing: 'processing', success: 'green',
  partial: 'orange', failed: 'red', cancelled: 'default',
}

export default function PublishTasks() {
  const [rows, setRows] = useState<Task[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [status, setStatus] = useState<string | undefined>()
  const [appIdFilter, setAppIdFilter] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (status) params.set('status', status)
      if (appIdFilter) params.set('app_id_filter', appIdFilter)
      const resp = await adminClient.get<any, any>(`/publish-tasks?${params}`)
      setRows(resp.items || [])
      setTotal(resp.total || 0)
    } catch (e: any) { message.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [page, pageSize, status])

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input placeholder="按 app_id 过滤" value={appIdFilter} onChange={e => setAppIdFilter(e.target.value)} style={{ width: 240 }} />
        <Select placeholder="状态" allowClear value={status} onChange={setStatus} style={{ width: 140 }}
          options={['pending', 'publishing', 'success', 'partial', 'failed', 'cancelled'].map(v => ({ value: v }))} />
        <Button onClick={() => { setPage(1); load() }}>查询</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={{
          current: page, pageSize, total,
          showSizeChanger: true, pageSizeOptions: [20, 50, 100],
          onChange: (p, ps) => { setPage(p); setPageSize(ps) },
          showTotal: t => `共 ${t} 条`,
        }}
        columns={[
          { title: 'ID', dataIndex: 'id', render: (v: string) => <code style={{ fontSize: 11 }}>{v.slice(0, 8)}</code> },
          { title: '平台', dataIndex: 'platform_code', width: 120 },
          {
            title: '状态', dataIndex: 'status', width: 110,
            render: (s: string) => <Tag color={STATUS_COLOR[s] || 'default'}>{s}</Tag>,
          },
          {
            title: '账号进度', width: 140,
            render: (_, r: Task) => (
              <span>
                <span style={{ color: '#22c55e' }}>{r.success_count}</span>
                {' / '}
                <span style={{ color: '#ef4444' }}>{r.failed_count}</span>
                {' / '}
                <span>{r.total_count}</span>
              </span>
            ),
          },
          {
            title: '定时', dataIndex: 'pre_pub_time', width: 180,
            render: (t: number | null) => t ? new Date(t).toLocaleString('zh-CN') : '-',
          },
          { title: '创建时间', dataIndex: 'created_at', width: 180, render: (d: string) => new Date(d).toLocaleString('zh-CN') },
        ]}
      />
    </div>
  )
}
