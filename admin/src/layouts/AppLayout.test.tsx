import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { App as AntApp, ConfigProvider, Modal } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.setConfig({ testTimeout: 30_000 })

vi.mock('../api/adminAccountsApi', () => ({
  fetchAdminMe: vi.fn(),
  fetchPushStatus: vi.fn(async () => ({ configured: false, devices: 0 })),
  fetchAdminNotificationPrefs: vi.fn(async () => ({ prefs: {} })),
  setAdminNotificationPref: vi.fn(),
}))
vi.mock('../push/webPush', () => ({
  disableWebPush: vi.fn(),
  resyncWebPush: vi.fn(async () => undefined),
  onForegroundPush: vi.fn(() => () => {}),
  enableWebPush: vi.fn(),
  storedToken: vi.fn(() => null),
  webPushConfigured: vi.fn(() => false),
  webPushSupported: vi.fn(() => false),
}))

import { fetchAdminMe } from '../api/adminAccountsApi'
import { disableWebPush, resyncWebPush } from '../push/webPush'
import { useAuthStore } from '../stores/authStore'
import { DESKTOP, PHONE, setViewportWidth } from '../test/viewport'
import { ThemeProvider } from '../theme/ThemeProvider'
import AppLayout from './AppLayout'

function renderLayout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <ConfigProvider direction="rtl">
          <AntApp>
            <MemoryRouter initialEntries={['/orders']}>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path="/orders" element={<div>الطلبات</div>} />
                  <Route path="/admins" element={<div>صفحة المسؤولين</div>} />
                </Route>
                <Route path="/login" element={<div>صفحة الدخول</div>} />
              </Routes>
            </MemoryRouter>
          </AntApp>
        </ConfigProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

/**
 * إشعارات هاتف المسؤول والجلسة (STEP 64، مراجعة الأمان).
 *
 * [SECURITY] الخادم يعطّل أجهزة المسؤول حين تسقط جلساته؛ اللوحة تكمل الدائرة:
 * الخروج يلغي جهاز هذا المتصفّح **قبل** مسح التوكن (بعده يرتدّ بـ401 فيبقى
 * المتصفّح المشترك يستقبل أسماء الزبائن وأرقامهم لمن يستعمله بعدك)، وكل جلسةٍ
 * جديدة تعيد ربط رمز المتصفّح المحفوظ.
 */
describe('AppLayout — push device and session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // الشريط الجانبي بزرّ الخروج — على الشاشة العريضة.
    setViewportWidth(DESKTOP)
    useAuthStore.setState({ token: 'session-token', user: { id: 'a1', username: 'مسؤول', phone: '+9647800000001', role: 'admin' } as never })
    vi.mocked(fetchAdminMe).mockResolvedValue({
      id: 'a1',
      username: 'مسؤول',
      phone: '+9647800000001',
      isSuperAdmin: true,
      permissions: [],
    })
  })

  afterEach(() => {
    // `Modal.confirm` ثابتٌ خارج شجرة React — لا يُزال مع تنظيف الاختبار.
    Modal.destroyAll()
    setViewportWidth(PHONE)
  })

  it('a session re-links this browser’s saved push token', async () => {
    renderLayout()
    await waitFor(() => expect(resyncWebPush).toHaveBeenCalledTimes(1))
  })

  it('[SECURITY] logout unregisters this browser while the session token is still valid, then clears it', async () => {
    const tokenAtUnregister: Array<string | null> = []
    vi.mocked(disableWebPush).mockImplementation(async () => {
      tokenAtUnregister.push(useAuthStore.getState().token)
    })
    const user = userEvent.setup()
    renderLayout()
    await user.click(await screen.findByRole('button', { name: 'تسجيل الخروج' }))
    const confirm = (await screen.findAllByText('هل أنت متأكد أنك تريد تسجيل الخروج؟')).at(-1)!
    const dialog = confirm.closest('.ant-modal') as HTMLElement
    await user.click(dialog.querySelector('.ant-btn-dangerous') as HTMLElement)

    await waitFor(() => expect(useAuthStore.getState().token).toBeNull())
    expect(disableWebPush).toHaveBeenCalledTimes(1)
    expect(tokenAtUnregister).toEqual(['session-token'])
    expect(await screen.findByText('صفحة الدخول')).toBeInTheDocument()
  })

  it('a failed unregister never blocks logout', async () => {
    vi.mocked(disableWebPush).mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    renderLayout()
    await user.click(await screen.findByRole('button', { name: 'تسجيل الخروج' }))
    const confirm = (await screen.findAllByText('هل أنت متأكد أنك تريد تسجيل الخروج؟')).at(-1)!
    await user.click((confirm.closest('.ant-modal') as HTMLElement).querySelector('.ant-btn-dangerous') as HTMLElement)
    await waitFor(() => expect(useAuthStore.getState().token).toBeNull())
  })
})

/**
 * [STEP 66] «قسم إدارة المسؤولين غير موجود».
 *
 * الصفحة والمسار وبند القائمة كلها موجودة منذ STEP 64 — لكن «المسؤولون» آخر
 * بندٍ في القائمة، وعلى شاشة ١٣٦٦×٧٦٨ يقع تحت حافّتها بـ٣٦٥px، وشريط تمريرها
 * داكنٌ على داكن لا يُرى. فبدا القسم غير موجود. الإصلاح: مدخلٌ ظاهر دائماً في
 * لوحة المستخدم أسفل الشريط الجانبي (لمن يملك القسم فقط)، وشريط تمريرٍ مرئي،
 * والبند المفتوح يُمرَّر إليه.
 */
describe('AppLayout — «المسؤولون» في المتناول (STEP 66)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setViewportWidth(DESKTOP)
    useAuthStore.setState({ token: 'session-token', user: { id: 'a1', username: 'مسؤول', phone: '+9647800000001', role: 'admin' } as never })
  })
  afterEach(() => setViewportWidth(PHONE))

  const profileOf = (isSuperAdmin: boolean, permissions: string[]) =>
    vi.mocked(fetchAdminMe).mockResolvedValue({ id: 'a1', username: 'مسؤول', phone: '+9647800000001', isSuperAdmin, permissions } as never)

  it('المسؤول الأعلى: مدخلٌ ظاهر دائماً إلى «المسؤولون» يفتح الصفحة', async () => {
    profileOf(true, [])
    const user = userEvent.setup()
    renderLayout()
    await user.click(await screen.findByRole('button', { name: 'المسؤولون والصلاحيات' }))
    expect(await screen.findByText('صفحة المسؤولين')).toBeInTheDocument()
  })

  it('مسؤولٌ فرعي يملك «المسؤولون» (ملفّه): المدخل ظاهر', async () => {
    profileOf(false, ['orders', 'admins'])
    renderLayout()
    expect(await screen.findByRole('button', { name: 'المسؤولون والصلاحيات' })).toBeInTheDocument()
  })

  it('[SECURITY] مسؤولٌ فرعي بلا «المسؤولون»: لا مدخل ولا بند', async () => {
    profileOf(false, ['orders'])
    renderLayout()
    await screen.findByRole('button', { name: 'تسجيل الخروج' })
    await waitFor(() => expect(fetchAdminMe).toHaveBeenCalled())
    // القائمة تُبنى من الملفّ: «الطلبات» ظاهرة، و«المسؤولون» لا بنداً ولا زرّاً.
    await screen.findAllByText('الطلبات')
    expect(screen.queryByRole('button', { name: 'المسؤولون والصلاحيات' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /المسؤولون/ })).toBeNull()
  })

  it('شريط تمرير القائمة الجانبية مرئيّ على خلفيتها الداكنة', async () => {
    profileOf(true, [])
    renderLayout()
    const scroller = await screen.findByTestId('sidebar-menu-scroll')
    expect(scroller.classList.contains('og-sidebar-scroll')).toBe(true)
  })

  it('[CRITICAL] المحتوى يقصّ بـclip لا hidden — وإلا صار حاوية تمرير فلا يلتصق رأس الجدول ولا شريطه', async () => {
    profileOf(true, [])
    renderLayout()
    const content = await screen.findByTestId('app-content')
    expect(content.getAttribute('style')).toMatch(/overflow-x:\s*clip/)
    expect(content.getAttribute('style')).not.toMatch(/overflow-x:\s*hidden/)
  })
})
