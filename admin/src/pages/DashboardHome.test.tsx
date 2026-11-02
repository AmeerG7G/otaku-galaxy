import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.setConfig({ testTimeout: 30_000 })

vi.mock('../api/communityApi', () => ({ fetchDashboardStats: vi.fn() }))
vi.mock('../api/ordersApi', () => ({ listOrders: vi.fn() }))
vi.mock('../hooks/useAdminProfile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useAdminProfile')>()),
  useCan: vi.fn(() => false),
}))

import { fetchDashboardStats } from '../api/communityApi'
import { listOrders } from '../api/ordersApi'
import { useCan } from '../hooks/useAdminProfile'
import type { DashboardStats } from '../types/community'
import DashboardHome from './DashboardHome'

const stats: DashboardStats = {
  orders: {
    total: 20,
    byStatus: { PENDING_ADMIN_CONFIRMATION: 2, CONFIRMED: 0, PREPARING: 0, OUT_FOR_DELIVERY: 3, COMPLETED: 14, REJECTED: 1 },
  },
  revenue: { completed: 180000, inProgress: 24000, completedThisMonth: 36000 },
  products: { total: 40, active: 35, lowStock: 4, outOfStock: 2 },
  customers: { total: 30, active: 29 },
  reviews: { pending: 1 },
  birthdays: { today: 0, upcoming7: 2, missing: 5 },
  notifications: { total: 50, last7Days: 6 },
  lowStockProducts: [],
}

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <MemoryRouter>
            <DashboardHome />
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(fetchDashboardStats).mockResolvedValue(stats)
  vi.mocked(listOrders).mockResolvedValue({ items: [], total: 0, page: 1, limit: 6 } as never)
})

afterEach(() => vi.clearAllMocks())

describe('الرئيسية (D4)', () => {
  it('[CRITICAL] كل مؤشّرات الرئيسية باقية، والإيراد بتسميةٍ دقيقة «بدون التوصيل»', async () => {
    renderHome()
    expect(await screen.findByText('إيراد المبيعات المكتملة (بدون التوصيل)')).toBeInTheDocument()
    expect(screen.getByText('إيراد هذا الشهر (بدون التوصيل)')).toBeInTheDocument()
    expect(screen.getByText('قيمة الطلبات الجارية (بدون التوصيل)')).toBeInTheDocument()
    for (const title of ['طلبات بانتظار الموافقة', 'قيد التوصيل', 'نفد المخزون', 'إجمالي الطلبات', 'طلبات مكتملة', 'الزبائن', 'إشعارات آخر ٧ أيام']) {
      expect(screen.getByText(title)).toBeInTheDocument()
    }
    expect(await screen.findByText(/180,000/)).toBeInTheDocument()
  })

  it('[CRITICAL] لا نصوص تعليمية: لا وصف تحت العناوين ولا جُمل شرح تحت المؤشّرات', async () => {
    renderHome()
    await screen.findByText('قاربت النفاد: 4')
    const text = document.body.textContent ?? ''
    for (const phrase of [
      'أرقام حقيقية مباشرة من قاعدة البيانات',
      'بانتظار قرارك',
      'الإيراد يحسب عند التسليم',
      'قنوات التواصل الداخلية',
      'حصيلة الطلبات والزبائن',
      'تحتاج قبولاً أو رفضاً',
      'لا تظهر في التطبيق قبل نشرها',
      'التهنئة تُرسَل يدوياً',
      'مجموع الطلبات التي استلمها',
      'جمهور رسالة',
      'لا إشعارات دفع',
    ]) {
      expect(text, phrase).not.toContain(phrase)
    }
    // البيانات تبقى أرقاماً مختصرة.
    expect(screen.getByText('قاربت النفاد: 4')).toBeInTheDocument()
    expect(screen.getByText('الإجمالي: 40')).toBeInTheDocument()
  })

  it('رابط «التحليلات التفصيلية» لمن يملك قسم التحليلات وحده', async () => {
    const first = renderHome()
    await screen.findByText('إيراد المبيعات المكتملة (بدون التوصيل)')
    expect(screen.queryByText('التحليلات التفصيلية')).not.toBeInTheDocument()
    first.unmount()
    vi.mocked(useCan).mockReturnValue(true)
    renderHome()
    expect(await screen.findByText('التحليلات التفصيلية')).toBeInTheDocument()
    vi.mocked(useCan).mockReturnValue(false)
  })
})
