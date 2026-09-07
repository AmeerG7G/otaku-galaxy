import { describe, expect, it, vi, beforeEach } from 'vitest'

// انظر التعليق نفسه في `OffersPage.test.tsx`: مهلة أوسع لجداول antd في jsdom.
vi.setConfig({ testTimeout: 20_000 })
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/customersApi', () => ({
  listCustomers: vi.fn(),
  toggleUserActive: vi.fn(),
}))
vi.mock('../api/pointsApi', () => ({ getCustomerPoints: vi.fn() }))

import { listCustomers } from '../api/customersApi'
import CustomersPage from './CustomersPage'
import { ApiError } from '../api/client'
import type { AdminCustomer, AdminCustomerListResponse } from '../types/customers'

/**
 * إدارة الزبائن: الجنس والهاتف.
 *
 * حدّان تحرسهما هذه الاختبارات: `null` تعني «غير محدد» لا «ذكر»، والعدّادات
 * تأتي من الخادم لا من الصفحة المعروضة.
 */

function customer(overrides: Partial<AdminCustomer> = {}): AdminCustomer {
  return {
    id: 'u1',
    username: 'أمير',
    phone: '+9647701234567',
    gender: 'male',
    avatarUrl: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    hasBirthday: false,
    birthDay: null,
    birthMonth: null,
    points: 0,
    ordersTotal: 0,
    ordersCompleted: 0,
    lastOrderAt: null,
    ...overrides,
  }
}

function listOf(items: AdminCustomer[]): AdminCustomerListResponse {
  return {
    items,
    page: 1,
    limit: 12,
    total: 1200,
    hasMore: true,
    genderCounts: { total: 1200, male: 700, female: 480, unknown: 20 },
  }
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <CustomersPage />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('عمود الجنس', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listCustomers).mockResolvedValue(
      listOf([
        customer({ id: 'u1', username: 'أمير', gender: 'male' }),
        customer({ id: 'u2', username: 'سارة', gender: 'female' }),
        customer({ id: 'u3', username: 'حساب قديم', gender: null }),
      ]),
    )
  })

  it('العمود موجود بعنوانه', async () => {
    // الجدول ذو التمرير الأفقي يكرّر رأسه في antd — العبرة بوجوده لا بعدده.
    renderPage()
    expect((await screen.findAllByText('الجنس')).length).toBeGreaterThan(0)
  })

  it('«ذكر» و«أنثى» تظهران بالقيمة المخزَّنة', async () => {
    renderPage()
    expect(await screen.findByText('ذكر')).toBeInTheDocument()
    expect(screen.getByText('أنثى')).toBeInTheDocument()
  })

  it('[CRITICAL] الحساب بلا جنس يُعرض «غير محدد» لا «ذكر»', async () => {
    renderPage()
    const row = (await screen.findByText('حساب قديم')).closest('tr')!
    expect(within(row).getByText('غير محدد')).toBeInTheDocument()
    expect(within(row).queryByText('ذكر')).not.toBeInTheDocument()
  })
})

describe('ترشيح الجنس', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listCustomers).mockResolvedValue(listOf([customer()]))
  })

  it('«جميع المستخدمين» لا يرسل ترشيحاً', async () => {
    renderPage()
    await waitFor(() => expect(listCustomers).toHaveBeenCalled())
    expect(vi.mocked(listCustomers).mock.calls[0]![0]).not.toHaveProperty('gender')
  })

  it('«الذكور» يرسل gender=male إلى الخادم', async () => {
    renderPage()
    await waitFor(() => expect(listCustomers).toHaveBeenCalled())
    await userEvent.click(screen.getByText('الذكور'))
    await waitFor(() =>
      expect(listCustomers).toHaveBeenCalledWith(
        expect.objectContaining({ gender: 'male', page: 1 }),
      ),
    )
  })

  it('«الإناث» يرسل gender=female إلى الخادم', async () => {
    renderPage()
    await waitFor(() => expect(listCustomers).toHaveBeenCalled())
    await userEvent.click(screen.getByText('الإناث'))
    await waitFor(() =>
      expect(listCustomers).toHaveBeenCalledWith(
        expect.objectContaining({ gender: 'female' }),
      ),
    )
  })

  it('[CRITICAL] الترشيح يجري على الخادم لا في المتصفح', async () => {
    renderPage()
    await waitFor(() => expect(listCustomers).toHaveBeenCalled())
    const callsBefore = vi.mocked(listCustomers).mock.calls.length
    await userEvent.click(screen.getByText('الإناث'))
    // تغيير الترشيح يُطلق طلباً جديداً؛ لو رُشِّح محلياً لما تغيّر عدد الطلبات.
    await waitFor(() =>
      expect(vi.mocked(listCustomers).mock.calls.length).toBeGreaterThan(callsBefore),
    )
  })
})

describe('تعداد الزبائن', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listCustomers).mockResolvedValue(listOf([customer()]))
  })

  it('[CRITICAL] الأعداد المعروضة هي أعداد الخادم لا طول الصفحة', async () => {
    renderPage()
    // صفحةٌ فيها زبون واحد، والعدّادات من الخادم: ١٢٠٠ / ٧٠٠ / ٤٨٠ / ٢٠.
    // انتظار وصول البيانات: «جميع المستخدمين» عنوانٌ للمرشِّح أيضاً فيوجد قبلها.
    await screen.findAllByText('أمير')
    const digits = document.body.textContent!.replace(/[\s,\u066C]/g, '')
    expect(digits).toContain('1200')
    expect(digits).toContain('700')
    expect(digits).toContain('480')
    expect(digits).toContain('20')
  })
})

describe('رقم الهاتف', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listCustomers).mockResolvedValue(
      listOf([customer({ phone: '+9647701234567' })]),
    )
  })

  it('[CRITICAL] يُعرض كاملاً بلا إخفاء', async () => {
    renderPage()
    const phone = await screen.findByText('+9647701234567')
    expect(phone).toBeInTheDocument()
    expect(phone.textContent).not.toContain('*')
  })

  it('زر واتساب يفتح المحادثة بالرقم الحقيقي ولا يرسل شيئاً', async () => {
    renderPage()
    await screen.findAllByText('أمير')
    const link = document.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]')
    expect(link).not.toBeNull()
    // الرقم الحقيقي كاملاً، وبلا `text=`: الرابط يفتح المحادثة ولا يرسل رسالة.
    expect(link!.getAttribute('href')).toBe('https://wa.me/9647701234567')
    expect(link!.getAttribute('href')).not.toContain('text=')
    expect(link!.textContent).toContain('واتساب')
    expect(link!.getAttribute('target')).toBe('_blank')
    expect(link!.getAttribute('rel')).toContain('noopener')
  })
})

describe('حالات الخطأ', () => {
  it('خطأ الصلاحية يظهر برسالته', async () => {
    vi.clearAllMocks()
    vi.mocked(listCustomers).mockRejectedValue(
      new ApiError('لا تملك صلاحية', 403, 'FORBIDDEN'),
    )
    renderPage()
    expect(await screen.findByText('تعذر تحميل العملاء')).toBeInTheDocument()
    expect(screen.getByText('لا تملك صلاحية')).toBeInTheDocument()
    expect(screen.queryByText(/تحقق من الشبكة/)).not.toBeInTheDocument()
  })
})
