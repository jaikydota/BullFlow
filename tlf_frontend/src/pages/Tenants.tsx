/**
 * 子租户管理。
 * - 列表 + 新建 + 重置 app_key / webhook_secret + 改 webhook_url + 启停
 * - 新建/重置 时弹出明文凭据一次性展示（带「复制」按钮）
 */
import { useEffect, useState } from 'react'
import {
  Button, Table, Modal, Form, Input, Tag, Space, Drawer, message, Popconfirm, Typography, Select,
} from 'antd'
import { ReloadOutlined, KeyOutlined, EditOutlined, StopOutlined } from '@ant-design/icons'
import { adminClient } from '../api/client'

interface Tenant {
  id: string
  name: string
  app_id: string
  webhook_url: string | null
  status: 'active' | 'disabled'
  description: string | null
  created_at: string
  updated_at: string
}

interface CreateResult extends Tenant {
  app_key_plaintext: string
  webhook_secret_plaintext: string
}

export default function Tenants() {
  const [rows, setRows] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState<Tenant | null>(null)
  const [credResult, setCredResult] = useState<{ tenant: CreateResult; label: string } | null>(null)
  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const data = await adminClient.get<Tenant[], Tenant[]>('/tenants')
      setRows(data)
    } catch (e: any) { message.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const doCreate = async () => {
    const v = await createForm.validateFields()
    const r = await adminClient.post<CreateResult, CreateResult>('/tenants', v)
    setCreateOpen(false)
    createForm.resetFields()
    await load()
    setCredResult({ tenant: r, label: '新租户创建成功' })
  }

  const doUpdate = async () => {
    if (!editOpen) return
    const v = await editForm.validateFields()
    await adminClient.patch(`/tenants/${editOpen.id}`, v)
    message.success('已保存')
    setEditOpen(null)
    await load()
  }

  const resetAppKey = async (t: Tenant) => {
    const r = await adminClient.post<CreateResult, CreateResult>(`/tenants/${t.id}/reset-app-key`, {})
    setCredResult({ tenant: r, label: '已重置 app_key，新明文：' })
  }

  const resetWebhookSecret = async (t: Tenant) => {
    const r = await adminClient.post<CreateResult, CreateResult>(`/tenants/${t.id}/reset-webhook-secret`, {})
    setCredResult({ tenant: r, label: '已重置 webhook_secret，新明文：' })
  }

  const doDisable = async (t: Tenant) => {
    await adminClient.delete(`/tenants/${t.id}`)
    message.success('已禁用')
    load()
  }


  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => setCreateOpen(true)}>新建子租户</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: t => `共 ${t} 条` }}
        columns={[
          { title: '名称', dataIndex: 'name' },
          {
            title: 'app_id', dataIndex: 'app_id',
            render: (v: string) => <Typography.Text copyable code>{v}</Typography.Text>,
          },
          { title: 'webhook_url', dataIndex: 'webhook_url', render: (v) => v || <Tag color="blue">纯轮询</Tag> },
          {
            title: '状态', dataIndex: 'status',
            render: (s: string) => <Tag color={s === 'active' ? 'green' : 'default'}>{s}</Tag>,
          },
          { title: '创建时间', dataIndex: 'created_at', render: (d: string) => new Date(d).toLocaleString('zh-CN') },
          {
            title: '操作',
            render: (_: any, t: Tenant) => (
              <Space size="small">
                <Button size="small" icon={<EditOutlined />} onClick={() => {
                  setEditOpen(t); editForm.setFieldsValue(t)
                }}>编辑</Button>
                <Button size="small" icon={<KeyOutlined />} onClick={() => resetAppKey(t)}>重置 key</Button>
                <Button size="small" icon={<KeyOutlined />} onClick={() => resetWebhookSecret(t)}>重置 secret</Button>
                <Popconfirm title="确认禁用？" onConfirm={() => doDisable(t)}>
                  <Button size="small" danger icon={<StopOutlined />}>禁用</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal title="新建子租户" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={doCreate}>
        <Form form={createForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="例如 matrix365 / xxx-小程序" />
          </Form.Item>
          <Form.Item
            name="webhook_url"
            label="Webhook URL（可选）"
            extra="留空 = 纯轮询模式：不推送事件，接入方通过 GET /auth/status/{op}、GET /tasks/{id} 等轮询获取绑定/发布进度。填写则额外实时推送（轮询仍可用）。"
          >
            <Input placeholder="留空 = 纯轮询；或 https://your-domain/api/v1/webhooks/tlf" />
          </Form.Item>
          <Form.Item name="description" label="备注"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Drawer title="编辑租户" width={420} open={!!editOpen} onClose={() => setEditOpen(null)} extra={
        <Button type="primary" onClick={doUpdate}>保存</Button>
      }>
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label="名称"><Input /></Form.Item>
          <Form.Item
            name="webhook_url"
            label="Webhook URL（可选）"
            extra="留空 = 纯轮询模式（接入方轮询 GET 接口取进度）；填写则额外实时推送事件。"
          >
            <Input placeholder="留空 = 纯轮询" />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={[{ value: 'active', label: '启用' }, { value: 'disabled', label: '禁用' }]} />
          </Form.Item>
          <Form.Item name="description" label="备注"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Drawer>

      <Modal title="敏感凭据 · 仅展示一次" open={!!credResult} onCancel={() => setCredResult(null)}
        onOk={() => setCredResult(null)} okText="我已保存">
        {credResult && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text strong>{credResult.label}</Typography.Text>
            <Typography.Paragraph>
              <Typography.Text strong>app_id：</Typography.Text>
              <Typography.Text copyable code>{credResult.tenant.app_id}</Typography.Text>
            </Typography.Paragraph>
            {credResult.tenant.app_key_plaintext !== '***' && (
              <Typography.Paragraph>
                <Typography.Text strong>app_key：</Typography.Text>
                <Typography.Text copyable code>{credResult.tenant.app_key_plaintext}</Typography.Text>
              </Typography.Paragraph>
            )}
            <Typography.Paragraph>
              <Typography.Text strong>webhook_secret：</Typography.Text>
              <Typography.Text copyable code>{credResult.tenant.webhook_secret_plaintext}</Typography.Text>
            </Typography.Paragraph>
            <Typography.Text type="warning">
              凭据离开此页面后将不可恢复，请妥善保管！
            </Typography.Text>
          </Space>
        )}
      </Modal>
    </div>
  )
}
