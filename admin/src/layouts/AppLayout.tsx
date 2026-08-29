import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Avatar,
  Button,
  Drawer,
  Grid,
  Layout,
  Menu,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  LogoutOutlined,
  MenuOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { NAV_ITEMS, activeMenuKey } from './nav'
import { useAuthStore } from '../stores/authStore'

import { ENV_BADGE } from '../config/env'

const { Sider, Header, Content } = Layout

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const screens = Grid.useBreakpoint()
  const username = useAuthStore((state) => state.user?.username)
  const clear = useAuthStore((state) => state.clear)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isDesktop = Boolean(screens.lg)
  const selectedKey = activeMenuKey(location.pathname)

  function handleMenuClick({ key }: { key: string }) {
    navigate(key)
    setDrawerOpen(false)
  }

  function handleLogout() {
    clear()
    navigate('/login', { replace: true })
  }

  const sidebarMenu = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      items={NAV_ITEMS}
      onClick={handleMenuClick}
      style={{ borderInlineEnd: 'none' }}
    />
  )

  const userPanel = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: 16,
      }}
    >
      <Avatar icon={<UserOutlined />} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', display: 'block' }}>
          {username ?? '…'}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          مدير المتجر
        </Typography.Text>
      </div>
      <Tooltip title="تسجيل الخروج">
        <Button
          ghost
          type="text"
          icon={<LogoutOutlined />}
          aria-label="تسجيل الخروج"
          onClick={handleLogout}
          style={{ color: 'rgba(255,255,255,0.85)' }}
        />
      </Tooltip>
    </div>
  )

  return (
    <Layout style={{ minHeight: '100vh', width: '100%' }}>
      {isDesktop ? (
        <Sider
          width={240}
          theme="dark"
          style={{
            position: 'sticky',
            top: 0,
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '16px',
              color: '#fff',
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            <span aria-hidden>🛸</span>
            <span>مجرات الاوتاكو</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>{sidebarMenu}</div>
          {userPanel}
        </Sider>
      ) : (
        <Drawer
          placement="right"
          width={260}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          styles={{ body: { padding: 0, background: '#001529' } }}
          title={
            <span style={{ color: '#fff' }}>مجرات الاوتاكو — لوحة التحكم</span>
          }
        >
          {sidebarMenu}
          {userPanel}
        </Drawer>
      )}

      <Layout style={{ minWidth: 0 }}>
        <Header
          style={{
            background: '#fff',
            paddingInline: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderBottom: '1px solid #f0f0f0',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          {!isDesktop && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
              aria-label="فتح القائمة"
            />
          )}
          <Typography.Text strong style={{ fontSize: 16 }}>
            لوحة تحكم مجرات الاوتاكو
          </Typography.Text>
          {/* شارة البيئة: تُظهر بوضوح أن هذه ليست لوحة الإنتاج. */}
          {ENV_BADGE && (
            <Tag color={ENV_BADGE.color} style={{ fontWeight: 700, margin: 0 }}>
              {ENV_BADGE.label}
            </Tag>
          )}
          <div style={{ flex: 1 }} />
          <Tag color="gold">مشرف</Tag>
          <Space size={4}>
            <Typography.Text>{username}</Typography.Text>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              aria-label="تسجيل الخروج"
            >
              تسجيل الخروج
            </Button>
          </Space>
        </Header>
        <Content style={{ padding: 24, minWidth: 0, overflowX: 'hidden' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}