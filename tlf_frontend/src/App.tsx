import { useState, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom'
import { Layout, Menu, theme, Button, Space, message } from 'antd'
import {
  AppstoreOutlined,
  CloudServerOutlined,
  TeamOutlined,
  RocketOutlined,
  ApiOutlined,
  LinkOutlined,
  LogoutOutlined,
  ProfileOutlined,
} from '@ant-design/icons'
import Login from './pages/Login'
import Tenants from './pages/Tenants'
import LapiAccounts from './pages/LapiAccounts'
import TenantBindings from './pages/TenantBindings'
import Proxies from './pages/Proxies'
import PublishTasks from './pages/PublishTasks'
import WebhookEvents from './pages/WebhookEvents'
import PlatformCapabilities from './pages/PlatformCapabilities'

const { Header, Sider, Content } = Layout
const TOKEN_KEY = 'tlf_admin_token'

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  if (!localStorage.getItem(TOKEN_KEY)) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  return <>{children}</>
}

function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const { token } = theme.useToken()

  const navItems = [
    { key: '/tenants', title: '子租户', icon: <TeamOutlined /> },
    { key: '/accounts/lapi', title: '平台底层账号', icon: <AppstoreOutlined /> },
    { key: '/accounts/bindings', title: '租户账号绑定', icon: <LinkOutlined /> },
    { key: '/proxies', title: '代理池', icon: <CloudServerOutlined /> },
    { key: '/platforms', title: '平台能力', icon: <ProfileOutlined /> },
    { key: '/tasks', title: '发布任务监控', icon: <RocketOutlined /> },
    { key: '/webhook-events', title: 'Webhook 事件', icon: <ApiOutlined /> },
  ]
  const items = navItems.map(i => ({
    key: i.key,
    icon: i.icon,
    label: <Link to={i.key}>{i.title}</Link>,
  }))
  const current = navItems.find(i => location.pathname.startsWith(i.key))
  const selectedKey = current?.key

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY)
    message.success('已退出')
    navigate('/login')
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="light"
        style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}>
        <div style={{
          height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 600, fontSize: 16, color: token.colorPrimary,
        }}>
          {collapsed ? '推' : '推量发'}
        </div>
        <Menu mode="inline" items={items} selectedKeys={selectedKey ? [selectedKey] : []} />
      </Sider>
      <Layout>
        <Header style={{
          background: token.colorBgContainer,
          paddingInline: 24,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{current?.title ?? '推量发后台'}</span>
          <Space>
            <Button icon={<LogoutOutlined />} onClick={logout}>退出</Button>
          </Space>
        </Header>
        <Content style={{ padding: 24, background: token.colorBgLayout }}>
          <Routes>
            <Route path="/tenants" element={<Tenants />} />
            <Route path="/accounts/lapi" element={<LapiAccounts />} />
            <Route path="/accounts/bindings" element={<TenantBindings />} />
            <Route path="/proxies" element={<Proxies />} />
            <Route path="/platforms" element={<PlatformCapabilities />} />
            <Route path="/tasks" element={<PublishTasks />} />
            <Route path="/webhook-events" element={<WebhookEvents />} />
            <Route path="*" element={<Navigate to="/tenants" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<RequireAuth><AppLayout /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  )
}
