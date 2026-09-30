import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/accountRequestsApi', () => ({
  listAccountRequests: vi.fn(),
  approveAccountRequest: vi.fn(),
  rejectAccountRequest: vi.fn(),
}))
vi.mock('../api/customersApi', () => ({
  setCustomerPassword: vi.fn(),
}))

import { approveAccountRequest, listAccountRequests, rejectAccountRequest } from '../api/accountRequestsApi'
import { setCustomerPassword } from '../api/customersApi'
import AccountRequestsPage from './AccountRequestsPage'
import type { AccountRequest, AccountRequestListResponse } from '../types/accountRequests'
import { DESKTOP, PHONE, setViewportWidth } from '../test/viewport'

/**
 * طلبات الحساب في اللوحة.
 *
 * ما تحرسه: الطلب يُعرض بما أُرسل **وبجانبه** المخزَّن (لا قرار آلي)؛
 * الموافقة تخصّ التسجيل وحده؛ إعادة التعيين تُحسم بوضع كلمة مرور — والكلمة
 * لا تُعرض بعد الحفظ ولا تُطلب أي «كلمة مؤقّتة».
 */

function request(overrides: Partial<AccountRequest> = {}): AccountRequest {
  return {
    id: 'req-1',
    kind: 'registration',
    status: 'pending',
    submitted: { phone: '+9647701234567', username: 'زبون جديد', gender: 'male', levelKey: null },
    account: {
      id: 'u1',
      username: 'زبون جديد',
      phone: '+9647701234567',
      gender: 'male',
      isActive: true,
      isVerified: false,
      levelKey: 'beginner',
      levelNumber: 1,
      points: 0,
      createdAt: '2026-09-01T00:00:00Z',
    },
    match: null,
    adminNote: null,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

function listOf(items: AccountRequest[]): AccountRequestListResponse {
  return {
    items,
    page: 1,
    limit: 20,
    total: items.length,
    hasMore: false,
    pending: {
      registration: items.filter((i) => i.kind === 'registration' && i.status === 'pending').length,
      password_reset: items.filter((i) => i.kind === 'password_reset' && i.status === 'pending').length,
    },
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <MemoryRouter>
            <AccountRequestsPage />
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('طلب إنشاء الحساب', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAccountRequests).mockResolvedValue(listOf([request()]))
    vi.mocked(approveAccountRequest).mockResolvedValue({ row: request({ status: 'approved' }), message: 'تمت الموافقة' })
    vi.mocked(rejectAccountRequest).mockResolvedValue({ row: request({ status: 'rejected' }), message: 'رُفض الطلب' })
  })

  it('يظهر معلَّقاً بما أُرسل، وبأزرار موافقة/رفض/واتساب — ولا زرّ كلمة مرور', async () => {
    renderPage()
    const row = (await screen.findByText('+9647701234567')).closest('[data-row-key]')! as HTMLElement
    expect(within(row).getByText('قيد المراجعة')).toBeInTheDocument()
    expect(within(row).getByText('موافقة')).toBeInTheDocument()
    expect(within(row).getByText('رفض')).toBeInTheDocument()
    expect(within(row).getByText('واتساب').closest('a')).toHaveAttribute('href', 'https://wa.me/9647701234567')
    expect(within(row).queryByText('تغيير كلمة المرور')).not.toBeInTheDocument()
  })

  it('[CRITICAL] الموافقة تمرّ بتأكيدٍ يذكّر بتحقّق واتساب ثم تستدعي المسار الإداري', async () => {
    const user = userEvent.setup()
    renderPage()
    const row = (await screen.findByText('+9647701234567')).closest('[data-row-key]')! as HTMLElement
    await user.click(within(row).getByText('موافقة'))
    expect(await screen.findByText(/هل تحقّقت من زبون جديد/)).toBeInTheDocument()
    await user.click(screen.getByText('موافقة وتفعيل'))
    await waitFor(() => expect(approveAccountRequest).toHaveBeenCalledWith('req-1', undefined))
  })

  it('الرفض يمرّ بتأكيدٍ ويُرسل الملاحظة', async () => {
    const user = userEvent.setup()
    renderPage()
    const row = (await screen.findByText('+9647701234567')).closest('[data-row-key]')! as HTMLElement
    await user.click(within(row).getByText('رفض'))
    await user.type(await screen.findByPlaceholderText(/سبب الرفض/), 'لم يردّ')
    // زرّ التأكيد في الحوار (الثاني: الأول زرّ الصفّ).
    const buttons = screen.getAllByText('رفض').map((el) => el.closest('button')!)
    await user.click(buttons[buttons.length - 1]!)
    await waitFor(() => expect(rejectAccountRequest).toHaveBeenCalledWith('req-1', 'لم يردّ'))
  })

  it('لا كلمة مرور ولا تجزئة في ما يُعرض', async () => {
    renderPage()
    await screen.findByText('+9647701234567')
    expect(document.body.textContent).not.toMatch(/password|hash|\$2/i)
  })
})

describe('طلب إعادة تعيين كلمة المرور', () => {
  const reset = request({
    id: 'req-2',
    kind: 'password_reset',
    submitted: { phone: '+9647701234567', username: 'اسم آخر', gender: 'female', levelKey: 'legend' },
    account: { ...request().account!, isVerified: true, username: 'أمير', gender: 'male', levelKey: 'beginner' },
    match: { username: false, gender: false, level: false },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAccountRequests).mockResolvedValue(listOf([reset]))
    vi.mocked(setCustomerPassword).mockResolvedValue({
      row: { customerId: 'u1', request: { id: 'req-2', status: 'approved' } },
      message: 'وُضعت كلمة المرور الجديدة',
    })
  })

  it('[CRITICAL] يُعرض المرسَل بجانب المخزَّن مع إشارات مطابقة — ولا موافقة بلا كلمة مرور', async () => {
    renderPage()
    const row = (await screen.findByText('اسم آخر')).closest('[data-row-key]')! as HTMLElement
    expect(within(row).getByText('أمير')).toBeInTheDocument()
    expect(within(row).getByText('✗ الاسم')).toBeInTheDocument()
    expect(within(row).getByText('✗ الجنس')).toBeInTheDocument()
    expect(within(row).getByText('✗ المستوى')).toBeInTheDocument()
    expect(within(row).queryByText('موافقة')).not.toBeInTheDocument()
    expect(within(row).getByText('تغيير كلمة المرور')).toBeInTheDocument()
  })

  it('[CRITICAL] وضع الكلمة يرسلها مرّةً مع معرّف الطلب — ولا يعرضها بعد الحفظ ولا يسمّيها مؤقّتة', async () => {
    const user = userEvent.setup()
    renderPage()
    const row = (await screen.findByText('اسم آخر')).closest('[data-row-key]')! as HTMLElement
    await user.click(within(row).getByText('تغيير كلمة المرور'))
    const dialog = (await screen.findByText(/تحقّق من هوية الزبون عبر واتساب/)).closest('.ant-modal') as HTMLElement
    // النصّ التفسيري يقول «لا كلمة مؤقّتة» — الحوار لا يطلب ولا يعد بمؤقّتة.
    expect(dialog.textContent).toMatch(/لا كلمة مؤقّتة/)
    expect(dialog.textContent).not.toMatch(/must|force|expir/i)
    await user.type(within(dialog).getByTestId('new-password'), 'admin-set-pass-9')
    await user.type(within(dialog).getByTestId('confirm-password'), 'admin-set-pass-9')
    await user.click(within(dialog).getByText('حفظ كلمة المرور'))
    await waitFor(() =>
      expect(setCustomerPassword).toHaveBeenCalledWith('u1', { newPassword: 'admin-set-pass-9', requestId: 'req-2' }),
    )
    await waitFor(() => expect(screen.queryByTestId('new-password')).not.toBeInTheDocument())
    expect(document.body.textContent).not.toContain('admin-set-pass-9')
  })

  it('كلمتان غير متطابقتين لا تُرسلان', async () => {
    const user = userEvent.setup()
    renderPage()
    const row = (await screen.findByText('اسم آخر')).closest('[data-row-key]')! as HTMLElement
    await user.click(within(row).getByText('تغيير كلمة المرور'))
    const dialog = (await screen.findByText(/تحقّق من هوية الزبون عبر واتساب/)).closest('.ant-modal') as HTMLElement
    await user.type(within(dialog).getByTestId('new-password'), 'admin-set-pass-9')
    await user.type(within(dialog).getByTestId('confirm-password'), 'different-pass-9')
    await user.click(within(dialog).getByText('حفظ كلمة المرور'))
    expect(await screen.findByText('كلمتا المرور غير متطابقتين')).toBeInTheDocument()
    expect(setCustomerPassword).not.toHaveBeenCalled()
  })

  it('رقمٌ بلا حساب: لا زرّ كلمة مرور، وإشارة «لا حساب بهذا الرقم»', async () => {
    vi.mocked(listAccountRequests).mockResolvedValue(listOf([{ ...reset, id: 'req-3', account: null, match: null }]))
    renderPage()
    const row = (await screen.findByText('اسم آخر')).closest('[data-row-key]')! as HTMLElement
    expect(within(row).getByText('لا حساب بهذا الرقم')).toBeInTheDocument()
    expect(within(row).getByText('تغيير كلمة المرور').closest('button')).toBeDisabled()
  })
})

/**
 * STEP 64 §1 — على الهاتف كان الجدول بعرضٍ ثابت (عمود إجراءات 300) بلا تمرير،
 * فتُقصّ الأزرار ولا تُضغط. الآن بطاقةٌ لكل طلب بكل معلوماته وإجراءاته.
 */
describe('طلبات الحساب على الهاتف والشاشة العريضة', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAccountRequests).mockResolvedValue(listOf([request()]))
    vi.mocked(approveAccountRequest).mockResolvedValue({ row: request({ status: 'approved' }), message: 'تمت الموافقة' })
  })

  afterEach(() => setViewportWidth(PHONE))

  it('الهاتف: بطاقة لا جدول — المرسَل والمخزَّن والحالة والإجراءات كلها ظاهرة، والموافقة تعمل', async () => {
    setViewportWidth(PHONE)
    const user = userEvent.setup()
    const { container } = renderPage()
    const card = (await screen.findByText('+9647701234567')).closest('[data-row-key]')! as HTMLElement
    expect(container.querySelector('.ant-table')).toBeNull()
    expect(card.closest('.ant-card')).not.toBeNull()
    expect(within(card).getByText('ما أرسله الزبون')).toBeInTheDocument()
    expect(within(card).getByText('الحساب المخزَّن')).toBeInTheDocument()
    expect(within(card).getByText('قيد المراجعة')).toBeInTheDocument()
    expect(within(card).getByText('واتساب').closest('a')).toHaveAttribute('href', 'https://wa.me/9647701234567')
    await user.click(within(card).getByText('موافقة'))
    await user.click(await screen.findByText('موافقة وتفعيل'))
    await waitFor(() => expect(approveAccountRequest).toHaveBeenCalledWith('req-1', undefined))
  })

  it('الشاشة العريضة: الجدول نفسه كما كان', async () => {
    setViewportWidth(DESKTOP)
    const { container } = renderPage()
    const row = (await screen.findByText('+9647701234567')).closest('[data-row-key]')! as HTMLElement
    expect(row.tagName).toBe('TR')
    expect(container.querySelector('.ant-table')).not.toBeNull()
  })

  /**
   * [STEP 66] «الجدول لا يُمرَّر ولا يُرى كاملاً». بلا `scroll.x` سُحق
   * «ما أرسله الزبون» إلى ٤٠px (الاسم حرفاً حرفاً، الرقم «+9647 / 71234 /
   * 5678») وخرج الفائض من البطاقة فقُصّ بلا شريط. الآن عرضٌ لكل عمود،
   * الجدول حاوية تمريرٍ بعرضه الطبيعي، والإجراءات مثبّتة في نهايته.
   */
  it('[regression] الشاشة العريضة: الجدول بعرضه الطبيعي يتمرّر، والإجراءات مثبّتة، والرقم LTR لا يتكسّر', async () => {
    setViewportWidth(DESKTOP)
    const { container } = renderPage()
    const row = (await screen.findByText('+9647701234567')).closest('tr')! as HTMLElement
    // ٤٨ (التوسيع) + ١٣٠ + ٢٣٠ + ٢٧٠ + ١٣٠ + ١٨٠ + ٢٤٠
    expect((container.querySelector('.ant-table-body > table') as HTMLTableElement).style.width).toBe('1228px')
    expect(container.querySelector('.ant-table-sticky-holder')).not.toBeNull()
    const cells = row.querySelectorAll('td')
    const actions = cells[cells.length - 1]! as HTMLElement
    expect(actions.className).toContain('ant-table-cell-fix-end')
    expect(within(actions).getByText('موافقة')).toBeInTheDocument()
    expect(within(actions).getByText('رفض')).toBeInTheDocument()
    const phone = within(row).getByTestId('phone-text')
    expect(phone.style.direction).toBe('ltr')
    expect(phone.style.whiteSpace).toBe('nowrap')
  })
})
