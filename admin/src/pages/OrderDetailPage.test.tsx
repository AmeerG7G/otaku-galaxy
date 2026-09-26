import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.setConfig({ testTimeout: 20_000 })

vi.mock('../api/ordersApi', () => ({
  getOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
}))

import { getOrder } from '../api/ordersApi'
import OrderDetailPage from './OrderDetailPage'
import type { AdminOrder } from '../types/orders'

/**
 * تفاصيل الطلب — عرض فائض خصم التوصيل.
 *
 * [CRITICAL] الفائض مبلغٌ محاسبي للمتجر لا سطرٌ في فاتورة الزبون. يُعرض
 * خارج جدول الإجماليات ومعنوناً صراحةً، ولا يدخل أي حساب: اللوحة تعرض ما
 * أرسله الخادم ولا تشتقّ إجمالياً من عندها.
 */

function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: 'o1',
    number: '1001',
    status: 'PENDING_ADMIN_CONFIRMATION',
    province: 'بغداد',
    deliveryFee: 5000,
    fullAddress: 'الكرادة',
    phone: '+9647701234567',
    productsTotal: 90000,
    discount: 0,
    total: 90000,
    deliveryDiscount: 5000,
    createdAt: '2026-01-01T00:00:00Z',
    items: [],
    statusHistory: [],
    customer: { id: 'u1', name: 'أمير', phone: '+9647701234567' },
    zoneName: null,
    deliveryNote: null,
    rejectionReason: null,
    dispatchedAt: null,
    deliveredAt: null,
    ratingReminderAt: null,
    ratingReminderSentAt: null,
    canReview: false,
    reviewableProductCount: 0,
    ...overrides,
  } as AdminOrder
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <MemoryRouter initialEntries={['/orders/o1']}>
            <Routes>
              <Route path="/orders/:id" element={<OrderDetailPage />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('فائض خصم التوصيل في تفاصيل الطلب', () => {
  beforeEach(() => vi.clearAllMocks())

  it('[CRITICAL] يظهر معنوناً كمبلغ متجر لا كخصم للزبون', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      order({ deliveryDiscountExcess: 1000 }),
    )
    renderPage()

    expect(await screen.findByText(/فائض خصم التوصيل/)).toBeInTheDocument()
    expect(
      screen.getByText(/مبلغ محتفَظ به للمتجر — لم يُخصم من الزبون/),
    ).toBeInTheDocument()
  })

  it('[CRITICAL] الإجمالي المعروض هو إجمالي الخادم لا محسوباً في اللوحة', async () => {
    // الخام ٦٬٠٠٠، الفائض ١٬٠٠٠ — والإجمالي يبقى ٩٠٬٠٠٠ كما أرسله الخادم.
    vi.mocked(getOrder).mockResolvedValue(
      order({ deliveryDiscountExcess: 1000, total: 90000 }),
    )
    renderPage()

    await screen.findByText(/فائض خصم التوصيل/)
    const digits = document.body.textContent!.replace(/[\s,٬]/g, '')
    expect(digits).toContain('90000')
    // لا أثر لـ٨٩٬٠٠٠: الفائض لم يُطرح من الإجمالي في أي مكان.
    expect(digits).not.toContain('89000')
  })

  it('يعرض التوصيل بعد الخصم صراحةً', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      order({ deliveryDiscountExcess: 1000 }),
    )
    renderPage()
    expect(await screen.findByText('التوصيل بعد الخصم')).toBeInTheDocument()
  })

  it('لا يظهر شيء حين لا فائض', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      order({ deliveryDiscountExcess: 0, deliveryDiscount: 2000, total: 93000 }),
    )
    renderPage()
    await waitFor(() => expect(getOrder).toHaveBeenCalled())
    await screen.findByText('الإجماليات')
    expect(screen.queryByText(/فائض خصم التوصيل/)).not.toBeInTheDocument()
  })

  it('الحقل الغائب (قوائم لا تحمله) لا يكسر الصفحة', async () => {
    const withoutField = order()
    delete (withoutField as Partial<AdminOrder>).deliveryDiscountExcess
    vi.mocked(getOrder).mockResolvedValue(withoutField)
    renderPage()

    await screen.findByText('الإجماليات')
    expect(screen.queryByText(/فائض خصم التوصيل/)).not.toBeInTheDocument()
  })
})

/**
 * الكمية المطلوبة والمخزون الحالي (STEP 59).
 *
 * المخزون المعروض هو ما أرسله الخادم عند فتح الطلب — المخزون **الآن**، لا لقطة
 * الإنشاء. معلومةٌ للمسؤول لا قرار: القبول يعيد الفحص تحت القفل على الخادم.
 */
describe('الكمية المطلوبة والمخزون الحالي في تفاصيل الطلب', () => {
  beforeEach(() => vi.clearAllMocks())

  const line = (overrides: Record<string, unknown>) => ({
    productId: 'p1',
    productName: 'حقيبة ناروتو',
    imageUrl: null,
    optionValue: null,
    price: 10000,
    quantity: 3,
    lineTotal: 30000,
    ...overrides,
  })

  it('يعرض الكمية المطلوبة والمخزون الحالي لكل منتج', async () => {
    vi.mocked(getOrder).mockResolvedValue(order({ items: [line({ currentStock: 6 })] as never }))
    renderPage()
    expect(await screen.findByRole('columnheader', { name: 'الكمية المطلوبة' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'المخزون الحالي' })).toBeInTheDocument()
    const row = screen.getByText('حقيبة ناروتو').closest('tr')!
    expect(row).toHaveTextContent('3')
    expect(row).toHaveTextContent('6')
    expect(row).not.toHaveTextContent('غير كافٍ')
  })

  it('[CRITICAL] طلبٌ منتظر يطلب أكثر من المخزون الحالي يُعلَّم «غير كافٍ»', async () => {
    vi.mocked(getOrder).mockResolvedValue(order({ items: [line({ quantity: 1, currentStock: 0 })] as never }))
    renderPage()
    const row = (await screen.findByText('حقيبة ناروتو')).closest('tr')!
    expect(row).toHaveTextContent('غير كافٍ')
  })

  it('منتجٌ حُذف من القاعدة لا يُخمَّن له مخزون', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      order({ items: [line({ optionValue: 'أحمر', currentStock: null })] as never }),
    )
    renderPage()
    const row = (await screen.findByText('حقيبة ناروتو')).closest('tr')!
    expect(row).toHaveTextContent('—')
  })

  it('بعد القبول لا يُعلَّم نقص: المخزون استُهلك بالفعل', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      order({ status: 'OUT_FOR_DELIVERY', items: [line({ quantity: 1, currentStock: 0 })] as never }),
    )
    renderPage()
    const row = (await screen.findByText('حقيبة ناروتو')).closest('tr')!
    expect(row).not.toHaveTextContent('غير كافٍ')
  })
})
