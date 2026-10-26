import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

vi.setConfig({ testTimeout: 30_000 })

vi.mock('../../api/analyticsApi', () => ({
  fetchAnalyticsPeriods: vi.fn(),
  fetchAnalyticsOverview: vi.fn(),
  fetchAnalyticsCompare: vi.fn(),
  fetchAnalyticsSales: vi.fn(),
  fetchAnalyticsCustomers: vi.fn(),
  fetchAnalyticsProducts: vi.fn(),
  fetchAnalyticsInventory: vi.fn(),
  fetchAnalyticsCategories: vi.fn(),
  fetchAnalyticsGovernorates: vi.fn(),
  fetchAnalyticsMarketing: vi.fn(),
  fetchAnalyticsBehaviour: vi.fn(),
  fetchAnalyticsNotifications: vi.fn(),
}))

import * as api from '../../api/analyticsApi'
import type { Kpi, OverviewKpiKey, OverviewResponse } from '../../types/analytics'
import { currentMonth, shiftMonth } from '../../utils/periods'
import AnalyticsPage from './AnalyticsPage'

const kpi = (current: number | null, previous: number | null = null): Kpi => ({
  current,
  previous,
  delta: current !== null && previous !== null ? current - previous : null,
  percent: current !== null && previous ? Math.round(((current - previous) / previous) * 1000) / 10 : null,
})

const window = (from: string, to: string) => ({ from: `${from}-01`, to: `${to}-01`, months: [`${from}-01`], partial: false })

function overview(overrides: Partial<OverviewResponse> = {}): OverviewResponse {
  const keys: OverviewKpiKey[] = [
    'salesRevenue', 'grossSales', 'productDiscounts', 'ordersPlaced', 'ordersCompleted', 'ordersRejected',
    'averageOrderValue', 'highestOrderValue', 'unitsSold', 'unitsPerOrder', 'newCustomers', 'buyers',
    'activeCustomers', 'customersMale', 'customersFemale', 'processingAtEnd',
  ]
  const kpis = Object.fromEntries(keys.map((k) => [k, kpi(1, 1)])) as Record<OverviewKpiKey, Kpi>
  kpis.salesRevenue = kpi(29500, 19000)
  kpis.activeCustomers = kpi(null, null)
  return {
    range: { from: '1990-05', to: '1990-05', window: window('1990-05', '1990-05'), partial: false, asOf: '2026-10-04' },
    compare: { mode: 'previous', window: window('1990-04', '1990-04') },
    kpis,
    ...overrides,
  }
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/analytics/:tab" element={<AnalyticsPage />} />
            </Routes>
            <LocationProbe />
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(api.fetchAnalyticsPeriods).mockResolvedValue({
    definitionsVersion: 1,
    asOf: '2026-10-04',
    tracking: { enabledNow: false, epochs: [] },
    inventoryMeasuredSince: null,
    months: [],
  })
  vi.mocked(api.fetchAnalyticsSales).mockResolvedValue({
    granularity: 'month',
    window: window('1990-05', '1990-05'),
    partial: false,
    asOf: '2026-10-04',
    series: [],
  })
})

afterEach(() => vi.clearAllMocks())

describe('«التحليلات» — نظرة عامة', () => {
  it('[CRITICAL] المؤشّر يعرض القيمة والفرق والنسبة وأساس المقارنة، و«غير متاح» لما لم يُقَس', async () => {
    vi.mocked(api.fetchAnalyticsOverview).mockResolvedValue(overview())
    renderAt('/analytics')
    const revenue = await screen.findByText('إيراد المبيعات (بدون التوصيل)')
    const card = revenue.closest('.ant-card') as HTMLElement
    expect(within(card).getByText(/29,500 د\.ع/)).toBeInTheDocument()
    expect(within(card).getByText(/\+55\.3%/)).toBeInTheDocument()
    const active = screen.getByText('زبائن نشطون').closest('.ant-card') as HTMLElement
    expect(within(active).getByText('غير متاح')).toBeInTheDocument()
  })

  it('[CRITICAL] بلا حقل الربح (غير الأعلى) لا بطاقة ربح؛ وبه تُعرض، و«غير متاح» بتغطيةٍ ناقصة بلا رقم', async () => {
    vi.mocked(api.fetchAnalyticsOverview).mockResolvedValue(overview())
    const first = renderAt('/analytics')
    await screen.findByText('إيراد المبيعات (بدون التوصيل)')
    expect(screen.queryByTestId('profit-card')).not.toBeInTheDocument()
    first.unmount()

    vi.mocked(api.fetchAnalyticsOverview).mockResolvedValue(
      overview({
        profit: {
          current: { available: false, grossProfit: null, cogs: null, marginPercent: null, coverage: { itemLines: 3, itemLinesWithCost: 2 } },
          previous: null,
        },
      }),
    )
    renderAt('/analytics')
    const card = await screen.findByTestId('profit-card')
    expect(card).toHaveTextContent('غير متاح')
    expect(card).toHaveTextContent('1 من 3')
  })

  it('اختيار «الشهر السابق» يجلب ذلك الشهر ويُحفظ في الرابط', async () => {
    vi.mocked(api.fetchAnalyticsOverview).mockResolvedValue(overview())
    renderAt('/analytics/overview')
    await screen.findByText('إيراد المبيعات (بدون التوصيل)')
    await userEvent.click(screen.getByText('الشهر السابق'))
    const previous = shiftMonth(currentMonth(), -1)
    await waitFor(() =>
      expect(api.fetchAnalyticsOverview).toHaveBeenLastCalledWith({ from: previous, to: previous, compare: 'previous' }),
    )
    expect(screen.getByTestId('location')).toHaveTextContent('period=previous')
  })

  it('الشهر الجاري مُعلَّم «جارٍ»', async () => {
    vi.mocked(api.fetchAnalyticsOverview).mockResolvedValue(overview())
    renderAt('/analytics')
    await screen.findByText('إيراد المبيعات (بدون التوصيل)')
    expect(screen.getByText(/جارٍ — حتى/)).toBeInTheDocument()
  })
})

describe('«التحليلات» — التبويبات', () => {
  it('[CRITICAL] الجنس فئتان فقط: ذكور وإناث، بلا ثالثة ولا ملاحظة', async () => {
    vi.mocked(api.fetchAnalyticsCustomers).mockResolvedValue({
      window: window('1990-05', '1990-05'),
      partial: false,
      asOf: '2026-10-04',
      genderDistribution: { male: 6, female: 6 },
      monthly: [],
      dailyActivity: [],
      tracking: { enabledNow: false, epochs: [] },
    })
    renderAt('/analytics/customers')
    const split = await screen.findByTestId('gender-split')
    expect(split).toHaveTextContent('ذكور')
    expect(split).toHaveTextContent('إناث')
    expect(document.body.textContent).not.toMatch(/غير محدد|لم يُحدَّد|مجهول|غير معروف|آخر \(/)
  })

  it('[CRITICAL] الإشعارات: «مقبولة لدى FCM» و«فُتحت بالنقر» — لا «وصلت»', async () => {
    vi.mocked(api.fetchAnalyticsNotifications).mockResolvedValue({
      window: window('1990-05', '1990-05'),
      partial: false,
      push: { configured: false },
      campaigns: 2,
      activeDevices: [],
      delivery: [
        {
          date: '1990-05-01', audience: 'customer', created: 3, acceptedByFcm: 1, failed: 1, skippedNotConfigured: 0,
          skippedPreference: 1, skippedNoDevices: 0, devicesAcceptedByFcm: 1, devicesInvalid: 1,
        },
      ],
      engagement: [{ date: '1990-05-01', readInApp: 1, openedFromPush: 0 }],
      byType: [],
    })
    renderAt('/analytics/notifications')
    expect((await screen.findAllByText('مقبولة لدى FCM')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('فُتحت بالنقر').length).toBeGreaterThan(0)
    expect(screen.getByText('الإشعارات الفورية غير مُعدّة')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/وصلت|سُلِّمت للجهاز|delivered/)
  })

  it('التسويق يعلن الكوبونات ومصدر الزبون «غير متاح» بدل الاختلاق', async () => {
    vi.mocked(api.fetchAnalyticsMarketing).mockResolvedValue({
      window: window('1990-05', '1990-05'),
      partial: false,
      registrations: { submitted: 0, approved: 0 },
      newCustomers: 0,
      birthday: { discountTotal: 0, completedOrders: 0, usedOnRejectedOrders: 0 },
      loyalty: { discountTotal: 0, discountClaims: 0, giftClaims: 0, giftsFulfilled: 0 },
      deliveryPromoGiven: 0,
      promoMarkdown: { total: 0, coverage: { itemLines: 0, itemLinesWithListPrice: 0 } },
      shares: [],
      topSearches: [],
      tracking: { enabledNow: false, epochs: [] },
      unavailable: ['coupons', 'attribution'],
    })
    renderAt('/analytics/marketing')
    expect(await screen.findByText(/لا نظام كوبونات/)).toBeInTheDocument()
    expect(screen.getByText(/لا آلية إسنادٍ موثوقة/)).toBeInTheDocument()
    expect(screen.getAllByText(/لم يُقَس بعد/).length).toBeGreaterThan(0)
  })

  it('تبديل التبويب يغيّر الرابط ويحتفظ بالمرشِّحات', async () => {
    vi.mocked(api.fetchAnalyticsOverview).mockResolvedValue(overview())
    vi.mocked(api.fetchAnalyticsGovernorates).mockResolvedValue({ window: window('1990-05', '1990-05'), partial: false, items: [] })
    renderAt('/analytics/overview?period=previous')
    await screen.findByText('إيراد المبيعات (بدون التوصيل)')
    await userEvent.click(screen.getByRole('tab', { name: 'المحافظات' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/analytics/governorates?period=previous'))
    expect(api.fetchAnalyticsGovernorates).toHaveBeenCalled()
  })

  it('المخطّط يُرسم (SVG) ومعه جدولٌ بديل بالقيم نفسها', async () => {
    vi.mocked(api.fetchAnalyticsSales).mockResolvedValue({
      granularity: 'month',
      window: window('1990-04', '1990-05'),
      partial: false,
      asOf: '2026-10-04',
      series: [
        { period: '1990-04-01', ordersPlaced: 2, ordersCompleted: 2, ordersRejected: 0, grossSales: 20000, productDiscounts: 1000, birthdayDiscounts: 1000, loyaltyDiscounts: 0, salesRevenue: 19000, unitsSold: 4, averageOrderValue: 9500, highestOrderValue: 10000 },
        { period: '1990-05-01', ordersPlaced: 3, ordersCompleted: 3, ordersRejected: 1, grossSales: 30000, productDiscounts: 500, birthdayDiscounts: 0, loyaltyDiscounts: 500, salesRevenue: 29500, unitsSold: 6, averageOrderValue: 9833, highestOrderValue: 15000 },
      ],
    })
    renderAt('/analytics/sales')
    const charts = await screen.findAllByTestId('trend-chart')
    expect(charts[0]!.querySelector('svg')).not.toBeNull()
    const card = charts[0]!.closest('.ant-card') as HTMLElement
    await userEvent.click(within(card).getByText('جدول'))
    expect(within(card).getAllByText('29,500 د.ع').length).toBeGreaterThan(0)
    // لا عمود ربح لغير الأعلى (الحقل غائب من الردّ).
    expect(within(card).queryByText('الربح الإجمالي')).not.toBeInTheDocument()
  })
})
