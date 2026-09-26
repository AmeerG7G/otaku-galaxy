import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Avatar,
  Button,
  Drawer,
  Grid,
  Image,
  Layout,
  Menu,
  Modal,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { LogoutOutlined, MenuOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons'
import { NAV_ITEMS, activeMenuKey, navTitleFor } from './nav'
import { useAuthStore } from '../stores/authStore'
import { ENV_BADGE } from '../config/env'
import { useTheme } from '../theme/ThemeProvider'

const { Sider, Header, Content } = Layout

function SidebarBrand() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '20px 20px 18px',
        flexShrink: 0,
      }}
    >
      <Image
        src="/otaku-square-mark.png"
        alt="مجرة الأوتاكو"
        width={40}
        height={40}
        style={{
          borderRadius: 14,
          boxShadow: '0 6px 18px rgba(124, 92, 255, 0.4)',
          flexShrink: 0,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: 'var(--og-sidebar-text)',
            fontWeight: 800,
            fontSize: 16,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          مجرة الأوتاكو
        </div>
        <div style={{ color: 'var(--og-sidebar-text-muted)', fontSize: 12, marginTop: 2 }}>
          لوحة التحكم
        </div>
      </div>
    </div>
  )
}

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const screens = Grid.useBreakpoint()
  const username = useAuthStore((state) => state.user?.username)
  const clear = useAuthStore((state) => state.clear)
  const { theme, toggleTheme } = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isDesktop = Boolean(screens.lg)
  const selectedKey = activeMenuKey(location.pathname)
  const sectionTitle = navTitleFor(selectedKey)

  function handleMenuClick({ key }: { key: string }) {
    navigate(key)
    setDrawerOpen(false)
  }

  function handleLogout() {
    Modal.confirm({
      title: 'تأكيد تسجيل الخروج',
      content: 'هل أنت متأكد أنك تريد تسجيل الخروج؟',
      okText: 'تسجيل الخروج',
      okType: 'danger',
      cancelText: 'إلغاء',
      centered: true,
      direction: 'rtl',
      onOk() {
        clear()
        navigate('/login', { replace: true })
      },
    })
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
        gap: 10,
        padding: '14px 16px',
        borderTop: '1px solid var(--og-sidebar-divider)',
        flexShrink: 0,
      }}
    >
      <Avatar
        size={36}
        style={{ background: 'var(--og-gradient)', fontWeight: 700, fontSize: 15 }}
      >
        {username?.charAt(0) ?? 'م'}
      </Avatar>
      <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
        <Typography.Text
          style={{ color: 'var(--og-sidebar-text)', display: 'block', fontSize: 14, fontWeight: 600 }}
          ellipsis
        >
          {username ?? '…'}
        </Typography.Text>
        <Typography.Text style={{ color: 'var(--og-sidebar-text-muted)', fontSize: 12 }}>
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
          style={{ color: 'var(--og-sidebar-text)' }}
        />
      </Tooltip>
    </div>
  )

  return (
    <Layout style={{ minHeight: '100vh', width: '100%' }}>
      {isDesktop ? (
        <Sider
          width={264}
          theme="dark"
          style={{
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflow: 'hidden',
          }}
          styles={{
            body: {
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              background: 'var(--og-sidebar-gradient)',
              borderInlineEnd: '1px solid var(--og-sidebar-divider)',
            },
          }}
        >
          <SidebarBrand />
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 12 }}>
            {sidebarMenu}
          </div>
          {userPanel}
        </Sider>
      ) : (
        <Drawer
          placement="right"
          width={280}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          styles={{
            body: {
              padding: 0,
              background: 'var(--og-sidebar-gradient)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            },
            header: { borderBottom: '1px solid var(--og-sidebar-divider)' },
          }}
          title={<SidebarBrand />}
          closable
        >
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 12 }}>
            {sidebarMenu}
          </div>
          {userPanel}
        </Drawer>
      )}

      <Layout style={{ minWidth: 0 }}>
        <Header
          style={{
            background: 'var(--og-surface)',
            paddingInline: isDesktop ? 24 : 12,
            height: 64,
            lineHeight: '64px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderBottom: '1px solid var(--og-border)',
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
              style={{ display: 'inline-flex', alignItems: 'center' }}
            />
          )}
          <Typography.Text
            strong
            style={{ fontSize: 17, whiteSpace: 'nowrap' }}
            ellipsis
          >
            {sectionTitle}
          </Typography.Text>
          {/* شارة البيئة: تُظهر بوضوح أن هذه ليست لوحة الإنتاج. */}
          {ENV_BADGE && (
            <Tag color={ENV_BADGE.color} style={{ fontWeight: 700, margin: 0 }}>
              {ENV_BADGE.label}
            </Tag>
          )}
          <div style={{ flex: 1 }} />
          <Tooltip title={theme === 'light' ? 'الوضع الداكن' : 'الوضع الفاتح'}>
            <Button
              type="text"
              icon={theme === 'light' ? <MoonOutlined /> : <SunOutlined />}
              aria-label={theme === 'light' ? 'تبديل إلى الوضع الداكن' : 'تبديل إلى الوضع الفاتح'}
              onClick={toggleTheme}
              style={{ color: 'var(--og-text)' }}
            />
          </Tooltip>
          {isDesktop ? (
            <Space size={6}>
              <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                {username}
              </Typography.Text>
              <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                مشرف
              </Tag>
            </Space>
          ) : null}
        </Header>
        <Content
          style={{
            padding: isDesktop ? 24 : 12,
            minWidth: 0,
            overflowX: 'hidden',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}