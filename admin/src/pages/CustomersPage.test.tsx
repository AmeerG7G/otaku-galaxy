import { describe, expect, it, vi, beforeEach } from 'vitest'

// انظر التعليق نفسه في `OffersPage.test.tsx`: مهلة أوسع لجداول antd في jsdom.
vi.setConfig({ testTimeout: 20_000 })
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../queryClient'

vi.mock('../api/customersApi', () => ({
  listCustomers: vi.fn(),
  setUserActive: vi.fn(),
}))
vi.mock('../api/pointsApi', () => ({ getCustomerPoints: vi.fn() }))

import { listCustomers, setUserActive } from '../api/customersApi'
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

function renderPage(queryClient = createQueryClient({ retry: false })) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider direction="rtl">
        <AntApp>
          {/* الصفوف تربط بملفّ الزبون (`/customers/:id`) — تحتاج موجِّهاً. */}
          <MemoryRouter>
            <CustomersPage />
          </MemoryRouter>
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

/**
 * تزامن الجنس مع التطبيق: الزبون غيّر جنسه من هاتفه، فاللوحة تقرأ القيمة
 * الجديدة مع أول جلبٍ تالٍ — «تحديث»، أو الدخول إلى الصفحة من جديد
 * (`staleTime` صفر: كل تركيبٍ يعيد الجلب) — ولا تبقى القيمة القديمة في
 * ذاكرة React Query بعد وصول الجديدة. لا حقلٌ محلي ولا مصدرٌ ثانٍ.
 */
describe('تزامن الجنس مع تغييره من التطبيق', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[CRITICAL] «تحديث» بعد تغيير الزبون لجنسه يعرض القيمة الجديدة ويُزيل القديمة', async () => {
    vi.mocked(listCustomers).mockResolvedValue(listOf([customer({ gender: 'male' })]))
    renderPage()
    expect(await screen.findByText('ذكر')).toBeInTheDocument()

    // الزبون بدّل من التطبيق؛ الخادم يعيد الآن «أنثى» — واللوحة لا تعرف بعد.
    vi.mocked(listCustomers).mockResolvedValue(listOf([customer({ gender: 'female' })]))
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /تحديث/ }))

    expect(await screen.findByText('أنثى')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('ذكر')).not.toBeInTheDocument())
  })

  it('[CRITICAL] الدخول إلى الصفحة من جديد يعيد الجلب ولا يكتفي بالذاكرة', async () => {
    const queryClient = createQueryClient({ retry: false })
    vi.mocked(listCustomers).mockResolvedValue(listOf([customer({ gender: 'male' })]))
    const first = renderPage(queryClient)
    expect(await screen.findByText('ذكر')).toBeInTheDocument()
    const fetchesBefore = vi.mocked(listCustomers).mock.calls.length
    first.unmount()

    vi.mocked(listCustomers).mockResolvedValue(listOf([customer({ gender: 'female' })]))
    renderPage(queryClient)
    await waitFor(() =>
      expect(vi.mocked(listCustomers).mock.calls.length).toBeGreaterThan(fetchesBefore),
    )
    expect(await screen.findByText('أنثى')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('ذكر')).not.toBeInTheDocument())
  })

  it('العدّادات تتبع الخادم بعد التحديث لا الصفحة المعروضة', async () => {
    // أرقامٌ مميَّزة كي لا تلتبس بغيرها في الصفحة: ٩٠٠٠ ذكور / ٣٠٠٠ إناث،
    // ثم بعد تبديل زبونٍ واحد ٨٩٩٩ / ٣٠٠١.
    vi.mocked(listCustomers).mockResolvedValue({
      ...listOf([customer({ gender: 'male' })]),
      genderCounts: { total: 12000, male: 9000, female: 3000, unknown: 0 },
    })
    renderPage()
    expect(await screen.findByText('ذكر')).toBeInTheDocument()
    const digitsBefore = document.body.textContent!.replace(/[\s,\u066C]/g, '')
    expect(digitsBefore).toContain('3000')

    vi.mocked(listCustomers).mockResolvedValue({
      ...listOf([customer({ gender: 'female' })]),
      genderCounts: { total: 12000, male: 8999, female: 3001, unknown: 0 },
    })
    await userEvent.setup().click(screen.getByRole('button', { name: /تحديث/ }))
    expect(await screen.findByText('أنثى')).toBeInTheDocument()
    await waitFor(() => {
      const digits = document.body.textContent!.replace(/[\s,\u066C]/g, '')
      expect(digits).toContain('3001')
      expect(digits).toContain('8999')
      expect(digits).not.toContain('3000')
    })
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

/**
 * الحظر والتفعيل — القرار الذي رآه المسؤول في النافذة هو ما يُرسل.
 *
 * [CRITICAL] كان الزرّ يرسل طلباً بلا جسم فيقلب الخادم الحالة الراهنة أياً
 * كانت: مسؤولان يريان «نشط» ويضغطان «حظر» كانا يُنهيان بزبونٍ **مفعَّل**،
 * وكذلك إعادة الضغط بعد مهلة. الحالة المقصودة في الطلب تجعله متكرّراً آمناً.
 */
describe('حظر العميل وتفعيله', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // استعلامات نصّية لا `ByRole`: حساب الأدوار على جدول antd كاملٍ في jsdom
  // يستغرق ثوانيَ لكل استعلام، فيقترب الاختبار من مهلته تحت الحِمل.
  async function confirmAction(label: 'حظر' | 'تفعيل') {
    renderPage()
    await userEvent.click((await screen.findByText(label)).closest('button')!)
    // antd يكتب العنوان مرتين (للقارئ الآلي وللعين) داخل النافذة نفسها.
    const [title] = await screen.findAllByText(label === 'حظر' ? 'حظر العميل؟' : 'تفعيل العميل؟')
    const dialog = title!.closest('.ant-modal') as HTMLElement
    await userEvent.click(within(dialog).getByText(label).closest('button')!)
  }

  it('[CRITICAL] «حظر» يرسل isActive=false صراحةً', async () => {
    vi.mocked(listCustomers).mockResolvedValue(listOf([customer({ isActive: true })]))
    vi.mocked(setUserActive).mockResolvedValue({ row: { id: 'u1', isActive: false }, message: 'تم' })
    await confirmAction('حظر')
    await waitFor(() => expect(setUserActive).toHaveBeenCalledTimes(1))
    expect(vi.mocked(setUserActive).mock.calls[0]![0]).toEqual({ id: 'u1', isActive: false })
  })

  it('[CRITICAL] «تفعيل» لمحظور يرسل isActive=true صراحةً', async () => {
    vi.mocked(listCustomers).mockResolvedValue(listOf([customer({ isActive: false })]))
    vi.mocked(setUserActive).mockResolvedValue({ row: { id: 'u1', isActive: true }, message: 'تم' })
    await confirmAction('تفعيل')
    await waitFor(() => expect(setUserActive).toHaveBeenCalledTimes(1))
    expect(vi.mocked(setUserActive).mock.calls[0]![0]).toEqual({ id: 'u1', isActive: true })
  })
})
