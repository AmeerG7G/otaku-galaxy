import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.setConfig({ testTimeout: 30_000 })

vi.mock('../api/adminAccountsApi', () => ({
  fetchAdminMe: vi.fn(),
  updateOwnProfile: vi.fn(),
  listSubAdmins: vi.fn(),
  createSubAdmin: vi.fn(),
  updateSubAdmin: vi.fn(),
  deleteSubAdmin: vi.fn(),
  listAudit: vi.fn(),
}))

import {
  createSubAdmin,
  fetchAdminMe,
  listAudit,
  listSubAdmins,
  updateOwnProfile,
  updateSubAdmin,
} from '../api/adminAccountsApi'
import { useAuthStore } from '../stores/authStore'
import AdminsPage from './AdminsPage'
import type { AdminProfile, SubAdmin } from '../types/adminPermissions'

const superAdmin: AdminProfile = { id: 's', username: 'المدير', phone: '+9647800000000', isSuperAdmin: true, permissions: [] }
const subAdmin: AdminProfile = { id: 'b', username: 'مشرف', phone: '+9647800000005', isSuperAdmin: false, permissions: ['admins', 'orders'] }

const orders: SubAdmin = {
  id: 'x1',
  username: 'مشرف الطلبات',
  phone: '+9647800009910',
  isActive: true,
  permissions: ['orders'],
  createdAt: '2026-09-29T10:00:00Z',
  updatedAt: '2026-09-29T10:00:00Z',
  createdByName: 'المدير',
  lastActivityAt: null,
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <MemoryRouter>
            <AdminsPage />
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

/**
 * «المسؤولون» (STEP 64 §7–§10). الخادم يفرض كل شيء؛ الصفحة تعرض لكلٍّ ما
 * يخصّه: الأعلى يدير الفرعيين ويرى السجلّ، والفرعي يرى ملفّه وحده.
 */
describe('صفحة المسؤولين', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ token: 't', user: null })
    vi.mocked(listSubAdmins).mockResolvedValue({ items: [orders] })
    vi.mocked(listAudit).mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, hasMore: false })
  })

  it('المسؤول الفرعي يرى «ملفّي» وحده — لا قائمة مسؤولين ولا سجلّ', async () => {
    vi.mocked(fetchAdminMe).mockResolvedValue(subAdmin)
    renderPage()
    expect(await screen.findByDisplayValue('مشرف')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'المسؤولون' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'سجلّ النشاط' })).toBeNull()
    expect(listSubAdmins).not.toHaveBeenCalled()
    expect(listAudit).not.toHaveBeenCalled()
  })

  it('ملفّي: تغيير كلمة المرور يطلب الحالية ويرسل الحقلين وحدهما', async () => {
    vi.mocked(fetchAdminMe).mockResolvedValue(subAdmin)
    vi.mocked(updateOwnProfile).mockResolvedValue({ profile: subAdmin, token: 'new-token' })
    const user = userEvent.setup()
    renderPage()
    await screen.findByDisplayValue('مشرف')
    const [newPassword, confirm, current] = [
      screen.getByLabelText('كلمة المرور الجديدة'),
      screen.getByLabelText('تأكيد كلمة المرور الجديدة'),
      screen.getByLabelText('كلمة المرور الحالية'),
    ]
    await user.type(newPassword, 'brand-new-pass-1')
    await user.type(confirm, 'brand-new-pass-1')
    await user.click(screen.getByText('حفظ'))
    expect(await screen.findByText('أدخل كلمة المرور الحالية')).toBeInTheDocument()
    expect(updateOwnProfile).not.toHaveBeenCalled()

    await user.type(current, 'old-pass-123')
    await user.click(screen.getByText('حفظ'))
    await waitFor(() =>
      expect(updateOwnProfile).toHaveBeenCalledWith({ newPassword: 'brand-new-pass-1', currentPassword: 'old-pass-123' }),
    )
    // التوكن الجديد يحلّ محلّ القديم (الجلسات الأخرى سقطت).
    await waitFor(() => expect(useAuthStore.getState().token).toBe('t'))
  })

  it('المسؤول الأعلى: قائمة المسؤولين بصلاحياتهم، وإنشاء مسؤولٍ بصلاحيات مختارة', async () => {
    vi.mocked(fetchAdminMe).mockResolvedValue(superAdmin)
    vi.mocked(createSubAdmin).mockResolvedValue({ ...orders, id: 'x2' })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('tab', { name: 'المسؤولون' }))
    const row = (await screen.findByText('مشرف الطلبات')).closest('[data-row-key]') as HTMLElement
    expect(within(row).getByText('الطلبات')).toBeInTheDocument()

    await user.click(screen.getByText('مسؤول جديد'))
    const dialog = (await screen.findByText('مسؤول جديد', { selector: '.ant-modal-title' })).closest('.ant-modal') as HTMLElement
    await user.type(within(dialog).getByLabelText('الاسم'), 'مشرف التقييمات')
    await user.type(within(dialog).getByLabelText('رقم الهاتف'), '07800009911')
    await user.type(within(dialog).getByLabelText('كلمة المرور'), 'reviews-pass-1')
    await user.click(within(dialog).getByLabelText('التقييمات'))
    await user.click(within(dialog).getByLabelText('الطلبات'))
    await user.click(within(dialog).getByText('إنشاء'))
    await waitFor(() =>
      expect(createSubAdmin).toHaveBeenCalledWith({
        username: 'مشرف التقييمات',
        phone: '07800009911',
        password: 'reviews-pass-1',
        permissions: expect.arrayContaining(['reviews', 'orders']),
      }),
    )
  })

  it('المسؤول الأعلى يوقف مسؤولاً — يُرسل الحقل المتغيّر وحده', async () => {
    vi.mocked(fetchAdminMe).mockResolvedValue(superAdmin)
    vi.mocked(updateSubAdmin).mockResolvedValue({ ...orders, isActive: false })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('tab', { name: 'المسؤولون' }))
    const row = (await screen.findByText('مشرف الطلبات')).closest('[data-row-key]') as HTMLElement
    await user.click(within(row).getByText('تعديل'))
    const dialog = (await screen.findByText('تعديل مشرف الطلبات')).closest('.ant-modal') as HTMLElement
    await user.click(within(dialog).getByRole('switch'))
    await user.click(within(dialog).getByText('حفظ'))
    await waitFor(() => expect(updateSubAdmin).toHaveBeenCalledWith('x1', { isActive: false }))
  })
})
