import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.setConfig({ testTimeout: 20_000 })

vi.mock('../api/restockApi', () => ({
  listRestockDemand: vi.fn(),
  setRestockAt: vi.fn(),
}))

import { listRestockDemand, setRestockAt, type RestockDemandRow } from '../api/restockApi'
import { DESKTOP, PHONE, setViewportWidth } from '../test/viewport'
import RestockPage from './RestockPage'

/**
 * طلب إعادة التوفر — هاتف المشترك كاملاً.
 *
 * [CRITICAL] الشاشة تعرض ما أرسله `GET /admin/restock/demand` كما هو ولا
 * تقنّع شيئاً: التقنيع قرارٌ للخادم لا للواجهة. لو قنّعت اللوحة رقماً وصلها
 * كاملاً لصار للمشروع قاعدتا خصوصية تتباعدان.
 */

function row(overrides: Partial<RestockDemandRow> = {}): RestockDemandRow {
  return {
    productId: 'p1',
    name: 'حقيبة أنمي',
    subscriberCount: 1,
    restockAt: null,
    subscribers: [{ username: 'أمير', phone: '+9647701234567' }],
    ...overrides,
  } as RestockDemandRow
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <RestockPage />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

/** يفتح صف المنتج ليظهر المشتركون. */
async function expandFirstRow() {
  const toggle = document.querySelector<HTMLElement>('.ant-table-row-expand-icon')
  expect(toggle).not.toBeNull()
  await userEvent.click(toggle!)
}

describe('هاتف مشترك إعادة التوفر في اللوحة', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // الجدول بصفوفه القابلة للتوسيع — على الشاشة العريضة.
    setViewportWidth(DESKTOP)
    vi.mocked(listRestockDemand).mockResolvedValue([row()])
  })

  afterEach(() => setViewportWidth(PHONE))

  it('[CRITICAL] يعرض الرقم كاملاً بلا تقنيع', async () => {
    renderPage()
    await screen.findByText('حقيبة أنمي')
    await expandFirstRow()

    const phone = await screen.findByText('+9647701234567')
    expect(phone).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('****')
  })

  it('[CRITICAL] اللوحة لا تقنّع رقماً وصلها كاملاً', async () => {
    renderPage()
    await screen.findByText('حقيبة أنمي')
    await expandFirstRow()
    await screen.findByText('+9647701234567')
    // لا نجوم ولا نقاط اختصار في أي موضع من الصفحة.
    expect(document.body.textContent).not.toMatch(/\*{2,}/)
  })

  it('زر واتساب يفتح المحادثة بالرقم الحقيقي ولا يرسل شيئاً', async () => {
    renderPage()
    await screen.findByText('حقيبة أنمي')
    await expandFirstRow()
    await screen.findByText('+9647701234567')

    const link = document.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('https://wa.me/9647701234567')
    expect(link!.getAttribute('href')).not.toContain('text=')
    expect(link!.getAttribute('rel')).toContain('noopener')
  })

  it('يعرض عدة مشتركين، كلٌّ برقمه الكامل', async () => {
    vi.mocked(listRestockDemand).mockResolvedValue([
      row({
        subscriberCount: 2,
        subscribers: [
          { username: 'أمير', phone: '+9647701234567' },
          { username: 'سارة', phone: '+9647809876543' },
        ],
      }),
    ])
    renderPage()
    await screen.findByText('حقيبة أنمي')
    await expandFirstRow()

    expect(await screen.findByText('+9647701234567')).toBeInTheDocument()
    expect(screen.getByText('+9647809876543')).toBeInTheDocument()
    expect(
      document.querySelectorAll('a[href^="https://wa.me/"]'),
    ).toHaveLength(2)
  })

  it('المنتج بلا مشتركين لا يُوسَّع ولا يعرض رقماً', async () => {
    vi.mocked(listRestockDemand).mockResolvedValue([
      row({ subscriberCount: 0, subscribers: [] }),
    ])
    renderPage()
    await screen.findByText('حقيبة أنمي')
    await waitFor(() => expect(listRestockDemand).toHaveBeenCalled())
    expect(document.body.textContent).not.toContain('+964')
  })
})

/**
 * STEP 64 §11 — على الهاتف: بطاقة لكل منتج بلا تمرير جانبي، المنتظرون ظاهرون
 * بلا توسيع، والموعد يُحفظ بزرٍّ صريح (الاختيار وحده لا يُرسل شيئاً).
 */
describe('طلبات التوفر على الهاتف', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setViewportWidth(PHONE)
    vi.mocked(setRestockAt).mockResolvedValue(undefined as never)
  })

  it('بطاقةٌ لا جدول: المنتج والعدد والمنتظرون وواتساب ظاهرون بلا توسيع', async () => {
    vi.mocked(listRestockDemand).mockResolvedValue([row()])
    const { container } = renderPage()
    const card = (await screen.findByText('حقيبة أنمي')).closest('[data-row-key]')! as HTMLElement
    expect(container.querySelector('.ant-table')).toBeNull()
    expect(card.textContent).toContain('1 ينتظرون')
    expect(card.textContent).toContain('+9647701234567')
    expect(card.querySelector('a[href="https://wa.me/9647701234567"]')).not.toBeNull()
  })

  it('«حفظ» يرسل الموعد عبر المسار الضيّق؛ «تراجع» لا يرسل شيئاً', async () => {
    const at = '2026-12-01T09:00:00.000Z'
    vi.mocked(listRestockDemand).mockResolvedValue([row({ restockAt: at })])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('حقيبة أنمي')

    await user.click(screen.getByText('تعديل'))
    await user.click(screen.getByText('تراجع'))
    expect(setRestockAt).not.toHaveBeenCalled()

    await user.click(screen.getByText('تعديل'))
    await user.click(screen.getByText('حفظ'))
    await waitFor(() => expect(setRestockAt).toHaveBeenCalledWith('p1', at))
  })

  it('«إلغاء الموعد» يرسل null صراحةً', async () => {
    vi.mocked(listRestockDemand).mockResolvedValue([row({ restockAt: '2026-12-01T09:00:00.000Z' })])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('حقيبة أنمي')
    await user.click(screen.getByText('إلغاء الموعد'))
    await waitFor(() => expect(setRestockAt).toHaveBeenCalledWith('p1', null))
  })

  it('«حفظ» معطَّل بلا موعدٍ مختار', async () => {
    vi.mocked(listRestockDemand).mockResolvedValue([row()])
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('حقيبة أنمي')
    await user.click(screen.getByText('تحديد'))
    expect(screen.getByText('حفظ').closest('button')).toBeDisabled()
  })
})
