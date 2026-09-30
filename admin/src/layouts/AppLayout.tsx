import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  App,
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
import {
  BellOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoonOutlined,
  SunOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import { activeMenuKey, navItemsFor, navTitleFor } from './nav'
import { APP_HEADER_HEIGHT } from './metrics'
import { useAdminProfile } from '../hooks/useAdminProfile'
import { canAccess } from '../types/adminPermissions'
import AdminPushDrawer from '../components/AdminPushDrawer'
import { disableWebPush, onForegroundPush, resyncWebPush } from '../push/webPush'
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
  const { data: profile } = useAdminProfile()
  const storedName = useAuthStore((state) => state.user?.username)
  const username = profile?.username ?? storedName
  const clear = useAuthStore((state) => state.clear)
  const { theme, toggleTheme } = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pushOpen, setPushOpen] = useState(false)
  const { notification } = App.useApp()

  // جلسةٌ جديدة: رمز هذا المتصفّح (إن فُعّل سابقاً) يُربط بها من جديد.
  useEffect(() => {
    void resyncWebPush()
  }, [])

  // اللوحة مفتوحة ومرئية: عامل الخدمة يسلّم التنبيه هنا بدل إشعار النظام.
  useEffect(
    () =>
      onForegroundPush((data) => {
        const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : null
        notification.info({
          message: data.title ?? 'تنبيه',
          description: data.body,
          placement: 'topLeft',
          btn: url ? (
            <Button size="small" type="primary" onClick={() => navigate(url)}>
              فتح
            </Button>
          ) : undefined,
        })
      }),
    [navigate, notification],
  )

  const isDesktop = Boolean(screens.lg)
  const selectedKey = activeMenuKey(location.pathname)
  const sectionTitle = navTitleFor(selectedKey)
  const canManageAdmins = canAccess(profile, 'admins')
  const menuScrollRef = useRef<HTMLDivElement | null>(null)

  // القسم المفتوح يظهر في القائمة وإن كان في آخرها: «المسؤولون» كان تحت
  // حافّة القائمة بـ٣٦٥px على شاشة ٧٦٨ فيبدو القسم غير موجود.
  // تمريرُ حاوية القائمة وحدها — `scrollIntoView` يمرّر الصفحة كلها معها.
  useEffect(() => {
    const scroller = menuScrollRef.current
    const selected = scroller?.querySelector<HTMLElement>('.ant-menu-item-selected')
    if (!scroller || !selected) return
    const box = scroller.getBoundingClientRect()
    const item = selected.getBoundingClientRect()
    const margin = 8
    if (item.bottom > box.bottom) scroller.scrollTop += item.bottom - box.bottom + margin
    else if (item.top < box.top) scroller.scrollTop -= box.top - item.top + margin
  }, [selectedKey, drawerOpen, profile])

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
      async onOk() {
        // [SECURITY] الإلغاء **قبل** مسح التوكن — المسار محميّ، وبعد الخروج
        // يرتدّ بـ401 فيبقى المتصفّح يستقبل إشعارات اللوحة لمن يستعمله بعدك
        // (القاعدة نفسها في `PushRegistrar.onLogout` بالتطبيق).
        await disableWebPush().catch(() => undefined)
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
      items={navItemsFor(profile)}
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
          {profile?.isSuperAdmin ? 'المسؤول الأعلى' : 'مسؤول'}
        </Typography.Text>
      </div>
      {/*
        [STEP 66] مدخلٌ ظاهر دائماً إلى «المسؤولون» (ملفّي، والمسؤولون وسجلّ
        النشاط للأعلى): القسم آخر القائمة، وعلى شاشة حاسوبٍ عادية يقع تحت
        حافّتها بلا شريط تمرير يُرى — فبدا للمالك أن القسم غير موجود. يظهر
        لمن يملك قسم «المسؤولون» فقط؛ والخادم يفرض الصلاحية في كل الأحوال.
      */}
      {canManageAdmins && (
        <Tooltip title="المسؤولون والصلاحيات">
          <Button
            ghost
            type="text"
            icon={<UserSwitchOutlined />}
            aria-label="المسؤولون والصلاحيات"
            data-testid="admins-shortcut"
            onClick={() => handleMenuClick({ key: '/admins' })}
            style={{ color: 'var(--og-sidebar-text)' }}
          />
        </Tooltip>
      )}
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
          <div
            ref={menuScrollRef}
            className="og-sidebar-scroll"
            data-testid="sidebar-menu-scroll"
            style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 12 }}
          >
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
          <div
            ref={menuScrollRef}
            className="og-sidebar-scroll"
            data-testid="sidebar-menu-scroll"
            style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 12 }}
          >
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
            height: APP_HEADER_HEIGHT,
            lineHeight: `${APP_HEADER_HEIGHT}px`,
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
          <Tooltip title="إشعارات هذا الجهاز">
            <Button
              type="text"
              icon={<BellOutlined />}
              aria-label="إشعارات هذا الجهاز"
              onClick={() => setPushOpen(true)}
              style={{ color: 'var(--og-text)' }}
            />
          </Tooltip>
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
                {profile?.isSuperAdmin ? 'المسؤول الأعلى' : 'مسؤول'}
              </Tag>
            </Space>
          ) : null}
        </Header>
        {/*
          [CRITICAL] `clip` لا `hidden`. الفائض الأفقي يُقصّ هنا كي لا تنزاح
          اللوحة كلها جانبياً، لكن `overflow-x: hidden` يجعل `overflow-y`
          تلقائياً `auto` فيصير `main` حاوية تمرير — فيلتصق كل عنصرٍ `sticky`
          داخله (رأس الجدول وشريط تمريره الأفقي) بـ`main` الذي لا يتمرّر أبداً
          بدل الصفحة. `clip` يقصّ بلا حاوية تمرير. والجداول العريضة لا تعتمد
          على هذا القصّ: كلٌّ منها حاوية تمريرٍ أفقي بذاته (`ResponsiveTable`).
        */}
        <Content
          data-testid="app-content"
          style={{
            padding: isDesktop ? 24 : 12,
            minWidth: 0,
            overflowX: 'clip',
          }}
        >
          <Outlet />
        </Content>
        <AdminPushDrawer open={pushOpen} onClose={() => setPushOpen(false)} />
      </Layout>
    </Layout>
  )
}