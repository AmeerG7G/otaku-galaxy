import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
 * تفاصيل الطلب — لون كل سطر (STEP 74): الاسم والمربّع وصورة اللون، ومخزون اللون.
 *
 * (القالب منسوخ من `OrderDetailPage.test.tsx`.) تفاصيل الطلب — عرض فائض خصم التوصيل.
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

const item = (overrides: Record<string, unknown>) => ({
  productId: 'p1',
  productName: 'تيشيرت ناروتو',
  imageUrl: '/uploads/product/red.png',
  optionValue: null,
  price: 15000,
  pairPrice: null,
  quantity: 2,
  lineTotal: 30000,
  currentStock: 1,
  variantId: null,
  variantColorName: null,
  variantColorNameAr: null,
  variantColorNameCkb: null,
  variantColorHex: null,
  ...overrides,
})

describe('ألوان سطور الطلب', () => {
  beforeEach(() => vi.clearAllMocks())

  it('[CRITICAL] المنتج نفسه بلونين سطران: لكلٍّ اسمه ومربّعه وصورته ومخزون لونه', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      order({
        items: [
          item({ variantId: 'v-red', variantColorName: 'أحمر', variantColorNameAr: 'أحمر', variantColorHex: '#FF0000', currentStock: 1 }),
          item({ variantId: 'v-blue', variantColorName: 'أزرق', variantColorNameAr: 'أزرق', imageUrl: '/uploads/product/blue.png', quantity: 1, lineTotal: 15000, currentStock: 9 }),
        ],
      } as never),
    )
    renderPage()
    const colors = await screen.findAllByTestId('order-item-color')
    expect(colors.map((el) => el.textContent)).toEqual(['أحمر', 'أزرق'])
    // المربّع للّون الذي له رمز وحده.
    expect(within(colors[0]!).getByTestId('color-swatch')).toHaveStyle({ background: '#FF0000' })
    expect(within(colors[1]!).queryByTestId('color-swatch')).toBeNull()
    // الصورة صورة اللون المحفوظة مع الطلب.
    const images = screen.getAllByRole('img', { name: 'تيشيرت ناروتو' }) as HTMLImageElement[]
    expect(images.map((img) => img.getAttribute('src'))).toEqual([
      'http://localhost:4000/uploads/product/red.png',
      'http://localhost:4000/uploads/product/blue.png',
    ])
    // مخزون الأحمر (١) أقل من المطلوب (٢) — «غير كافٍ» على سطره وحده.
    expect(screen.getAllByText('غير كافٍ')).toHaveLength(1)
    const rows = Array.from(document.querySelectorAll<HTMLElement>('tr[data-row-key]'))
    expect(rows.map((r) => r.dataset.rowKey)).toEqual(['p1:v-red:', 'p1:v-blue:'])
    expect(within(rows[0]!).getByText('غير كافٍ')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('9')).toBeInTheDocument()
  })

  it('سطرٌ بلا لون يعرض «—»', async () => {
    vi.mocked(getOrder).mockResolvedValue(order({ items: [item({ currentStock: 5 })] } as never))
    renderPage()
    await screen.findByText('تيشيرت ناروتو')
    expect(screen.queryByTestId('order-item-color')).toBeNull()
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThan(0))
  })
})
