/** Webhook 事件日志 + 死信重发。 */
import { useEffect, useState } from 'react'
import { Button, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import { ReloadOutlined, RedoOutlined, EyeOutlined } from '@ant-design/icons'
import { adminClient } from '../api/client'

interface EventRow {
  id: string
  app_id: string | null
  lapi_event_type: string
  signature_ok: number
  forward_status: string
  forward_attempts: number
  forwarded_at: string | null
  last_error: string | null
  created_at: string
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'default', ok: 'green', failed: 'orange', dead: 'red', skipped: 'default',
}

export default function WebhookEvents() {
  const [rows, setRows] = useState<EventRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [forwardStatus, setForwardStatus] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<any | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (forwardStatus) params.set('forward_status', forwardStatus)
      const resp = await adminClient.get<any, any>(`/webhook-events?${params}`)
      setRows(resp.items || [])
      setTotal(resp.total || 0)
    } catch (e: any) { message.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [page, pageSize, forwardStatus])

  const retry = async (r: EventRow) => {
    await adminClient.post(`/webhook-events/${r.id}/retry`, {})
    message.success('已重新入队')
    load()
  }
  const viewDetail = async (r: EventRow) => {
    const data = await adminClient.get<any, any>(`/webhook-events/${r.id}`)
    setDetail(data)
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Select placeholder="转发状态" allowClear value={forwardStatus} onChange={setForwardStatus}
          style={{ width: 160 }}
          options={['pending', 'ok', 'failed', 'dead', 'skipped'].map(v => ({ value: v }))} />
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
          { title: '事件类型', dataIndex: 'lapi_event_type', width: 140 },
          { title: '租户', dataIndex: 'app_id', width: 240, render: (v) => v ? <code style={{ fontSize: 11 }}>{v.slice(0, 8)}</code> : <Tag>未归属</Tag> },
          { title: '签名', dataIndex: 'signature_ok', width: 80, render: (v: number) => <Tag color={v ? 'green' : 'red'}>{v ? 'OK' : 'NG'}</Tag> },
          {
            title: '转发状态', dataIndex: 'forward_status', width: 110,
            render: (s: string) => <Tag color={STATUS_COLOR[s] || 'default'}>{s}</Tag>,
          },
          { title: '尝试次数', dataIndex: 'forward_attempts', width: 80 },
          { title: '最近错误', dataIndex: 'last_error', ellipsis: true },
          { title: '创建时间', dataIndex: 'created_at', width: 180, render: (d: string) => new Date(d).toLocaleString('zh-CN') },
          {
            title: '操作', width: 160,
            render: (_, r: EventRow) => (
              <Space size="small">
                <Button size="small" icon={<EyeOutlined />} onClick={() => viewDetail(r)}>详情</Button>
                {(r.forward_status === 'dead' || r.forward_status === 'failed') && (
                  <Button size="small" icon={<RedoOutlined />} onClick={() => retry(r)}>重发</Button>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal title="事件详情" open={!!detail} onCancel={() => setDetail(null)} footer={null} width={720}>
        {detail && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Paragraph>
              <Typography.Text strong>事件 ID：</Typography.Text>
              <Typography.Text copyable code>{detail.id}</Typography.Text>
            </Typography.Paragraph>
            <Typography.Paragraph>
              <Typography.Text strong>原始 payload：</Typography.Text>
              <pre style={{
                background: '#f5f5f5', padding: 12, borderRadius: 4, maxHeight: 360, overflow: 'auto',
                fontSize: 12,
              }}>
                {JSON.stringify(detail.raw_payload, null, 2)}
              </pre>
            </Typography.Paragraph>
          </Space>
        )}
      </Modal>
    </div>
  )
}
