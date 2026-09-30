import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/ordersApi', () => ({ listOrders: vi.fn() }))

import { listOrders } from '../api/ordersApi'
import OrdersPage from './OrdersPage'
import type { AdminOrder, AdminOrderList } from '../types/orders'
import { DESKTOP, PHONE, setViewportWidth } from '../test/viewport'

/**
 * الطلبات — «الجدول لا يتّسع ولا يُمرَّر أفقياً» (STEP 66).
 *
 * على ١٠٢٤px كان ٤٤٠px من الجدول خارج الشاشة (الإجمالي والحالة والتاريخ
 * والإجراءات، على يسار الجدول في RTL) وشريطه الأفقي الوحيد تحت آخر صفّ،
 * ٤٨٤px تحت حافّة الشاشة. وكان الهاتف يُعرض «9647…+» والعدد «١ منتجات».
 */

function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: 'o-1',
    number: '10420',
    status: 'PENDING_ADMIN_CONFIRMATION',
    province: 'بغداد',
    deliveryFee: 5000,
    fullAddress: 'الكرادة',
    phone: '07701234567',
    productsTotal: 125000,
    discount: 0,
    total: 130000,
    customer: { id: 'u-1', name: 'عبدالرحمن محمد عبدالكريم الجبوري', phone: '+9647701234567' },
    createdAt: '2026-09-29T09:30:00Z',
    items: [{ productId: 'p', productName: 'مجسّم', imageUrl: null, optionValue: null, price: 125000, quantity: 1, lineTotal: 125000 }],
    zoneName: null,
    deliveryNote: null,
    rejectionReason: null,
    deliveryDiscount: 0,
    dispatchedAt: null,
    deliveredAt: null,
    ratingReminderAt: null,
    ratingReminderSentAt: null,
    ...overrides,
  } as AdminOrder
}

const list: AdminOrderList = {
  items: [order(), order({ id: 'o-2', number: '10421', status: 'OUT_FOR_DELIVERY', items: [] as AdminOrder['items'] })],
  page: 1,
  limit: 12,
  total: 2,
  hasMore: false,
  statusCounts: { PENDING_ADMIN_CONFIRMATION: 1, CONFIRMED: 0, PREPARING: 0, OUT_FOR_DELIVERY: 1, COMPLETED: 0, REJECTED: 0 },
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <MemoryRouter initialEntries={['/orders']}>
            <OrdersPage />
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('الطلبات — جدولٌ يُفحص كلّه (STEP 66)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listOrders).mockResolvedValue(list)
  })
  afterEach(() => setViewportWidth(PHONE))

  it('[regression] الشاشة العريضة: كل الأعمدة، الجدول بعرضه الطبيعي في حاوية تمرير، ورقم الطلب والإجراءات مثبّتان', async () => {
    setViewportWidth(DESKTOP)
    const { container } = renderPage()
    const row = (await screen.findByText('#10420')).closest('tr')!
    for (const title of ['رقم الطلب', 'الزبون', 'الهاتف', 'المحافظة', 'المنتجات', 'الإجمالي', 'الحالة', 'التاريخ', 'الإجراءات']) {
      expect(screen.getAllByText(title).length, title).toBeGreaterThan(0)
    }
    // ١١٠+٢٢٠+١٦٠+١٤٠+١١٠+١٤٠+١٣٠+١٩٠+٢٠٠ — لا يُضغط دونه، يتمرّر.
    expect((container.querySelector('.ant-table-body > table') as HTMLTableElement).style.width).toBe('1400px')
    expect(container.querySelector('.ant-table-sticky-holder')).not.toBeNull()
    const cells = row.querySelectorAll('td')
    expect(cells[0]!.className).toContain('ant-table-cell-fix-start')
    expect(cells[cells.length - 1]!.className).toContain('ant-table-cell-fix-end')
    // الإجراءات في الخلية المثبّتة نفسها.
    expect(within(cells[cells.length - 1]! as HTMLElement).getByText('عرض').closest('a')).toHaveAttribute('href', '/orders/o-1')
    expect(within(cells[cells.length - 1]! as HTMLElement).getByText('واتساب').closest('a')).toHaveAttribute('href', 'https://wa.me/9647701234567')
  })

  it('الهاتف LTR («+9647…» لا «…9647+») والعدد بتمييزه العربي', async () => {
    setViewportWidth(DESKTOP)
    renderPage()
    const phone = (await screen.findAllByTestId('phone-text'))[0]!
    expect(phone).toHaveTextContent('+9647701234567')
    expect(phone.style.direction).toBe('ltr')
    expect(screen.getByText('منتج واحد')).toBeInTheDocument()
    expect(screen.queryByText('1 منتجات')).toBeNull()
  })

  it('الهاتف: بطاقةٌ لكل طلب بكل ما في الصفّ وإجراءاته — بلا جدولٍ يُمرَّر', async () => {
    setViewportWidth(PHONE)
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelectorAll('[data-row-key]')).toHaveLength(2))
    expect(container.querySelector('.ant-table')).toBeNull()
    const card = container.querySelector('[data-row-key="o-1"]') as HTMLElement
    for (const text of ['#10420', 'عبدالرحمن محمد عبدالكريم الجبوري', '130,000 د.ع', 'عرض', 'واتساب', 'طلب جديد']) {
      expect(within(card).getAllByText(text, { exact: false }).length, text).toBeGreaterThan(0)
    }
  })
})
