/**
 * 推量发后台登录页。
 *
 * 直接调本系统 /api/admin/v1/auth/login（tlf_backend 自有用户体系）。
 *
 * 初始管理员（首次启动 tlf_backend 自动 seed）：
 *   邮箱 / 密码见 tlf_backend/.env 的 TLF_ADMIN_INIT_EMAIL / TLF_ADMIN_INIT_PASSWORD
 */
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button, Card, Form, Input, message, Typography } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import axios from 'axios'

const TOKEN_KEY = 'tlf_admin_token'

interface LoginValues {
  email: string
  password: string
}

export default function Login() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const next = new URLSearchParams(location.search).get('next') || '/tenants'

  const onFinish = async (v: LoginValues) => {
    setLoading(true)
    try {
      const resp = await axios.post('/api/admin/v1/auth/login', v)
      const env = resp.data
      const data = env?.code === 0 ? env.data : env
      const token = data?.access_token
      if (!token) throw new Error('登录返回缺少 access_token')
      localStorage.setItem(TOKEN_KEY, token)
      message.success('登录成功')
      navigate(next, { replace: true })
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || '登录失败'
      message.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>推量发管理后台</Typography.Title>
          <Typography.Text type="secondary">多租户灵径网关</Typography.Text>
        </div>
        <Form layout="vertical" onFinish={onFinish} initialValues={{ email: 'admin@tlf.local' }}>
          <Form.Item name="email" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
            <Input prefix={<MailOutlined />} placeholder="email" autoComplete="username" size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block size="large">登录</Button>
        </Form>
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, fontSize: 12, textAlign: 'center' }}>
          首次启动自动 seed 凭据（来自 tlf_backend/.env），登录后请立即改密
        </Typography.Paragraph>
      </Card>
    </div>
  )
}
