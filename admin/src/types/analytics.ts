/**
 * أنواع «التحليلات» — مرآة ردود `backend/src/services/analytics/reports.ts` حرفياً.
 *
 * [CRITICAL] حقول الربح (`profit`، `marginBeforeOrderDiscounts`، `costCoverage`)
 * اختيارية: الخادم لا يرسلها إلا لمسؤولٍ أعلى (D1). غيابها لا يعني صفراً.
 * والجنس فئتان فقط: `male` و`female` (D5).
 */

export type CompareMode = 'none' | 'previous' | 'year'

export interface AnalyticsWindow {
  from: string
  to: string
  months: string[]
  partial: boolean
}

export interface Kpi {
  current: number | null
  previous: number | null
  delta: number | null
  percent: number | null
}

export interface Profit {
  available: boolean
  grossProfit: number | null
  cogs: number | null
  marginPercent: number | null
  coverage: { itemLines: number; itemLinesWithCost: number }
}

export type OverviewKpiKey =
  | 'salesRevenue'
  | 'grossSales'
  | 'productDiscounts'
  | 'ordersPlaced'
  | 'ordersCompleted'
  | 'ordersRejected'
  | 'averageOrderValue'
  | 'highestOrderValue'
  | 'unitsSold'
  | 'unitsPerOrder'
  | 'newCustomers'
  | 'buyers'
  | 'activeCustomers'
  | 'customersMale'
  | 'customersFemale'
  | 'processingAtEnd'

export interface OverviewResponse {
  range: { from: string; to: string; window: AnalyticsWindow; partial: boolean; asOf: string }
  compare: { mode: CompareMode; window: AnalyticsWindow } | null
  kpis: Record<OverviewKpiKey, Kpi>
  profit?: { current: Profit; previous: Profit | null }
}

export type CompareMetricKey =
  | 'salesRevenue'
  | 'grossSales'
  | 'productDiscounts'
  | 'ordersCompleted'
  | 'averageOrderValue'
  | 'unitsSold'
  | 'newCustomers'
  | 'buyers'
  | 'activeCustomers'
  | 'customersMale'
  | 'customersFemale'

export interface CompareResponse {
  a: { month: string; partial: boolean }
  b: { month: string; partial: boolean }
  metrics: Record<CompareMetricKey, Kpi>
  profit?: { a: Profit; b: Profit }
}

export interface SalesPoint {
  period: string
  ordersPlaced: number
  ordersCompleted: number
  ordersRejected: number
  grossSales: number
  productDiscounts: number
  birthdayDiscounts: number
  loyaltyDiscounts: number
  salesRevenue: number
  unitsSold: number
  averageOrderValue: number | null
  highestOrderValue: number | null
  profit?: Profit
}

export interface SalesResponse {
  granularity: 'day' | 'month'
  window: AnalyticsWindow
  partial: boolean
  asOf: string
  series: SalesPoint[]
}

export interface TrackingCoverage {
  enabledNow: boolean
  epochs: Array<{ enabledAt: string; disabledAt: string | null }>
}

export interface CustomersMonth {
  month: string
  customersEnd: number
  customersMale: number
  customersFemale: number
  newCustomers: number
  newCustomersMale: number
  newCustomersFemale: number
  buyers: number
  buyersMale: number
  buyersFemale: number
  newBuyers: number
  returningBuyers: number
  repeatBuyers: number
  activeCustomers: number | null
}

export interface CustomersResponse {
  window: AnalyticsWindow
  partial: boolean
  asOf: string
  genderDistribution: { male: number; female: number }
  monthly: CustomersMonth[]
  dailyActivity: Array<{ date: string; activeCustomers: number; logins: number }>
  tracking: TrackingCoverage
}

export type ProductsView = 'top' | 'bottom' | 'no_sales' | 'trending'

export interface TopProduct {
  productId: string
  name: string | null
  categoryId: string | null
  units: number
  grossValue: number
  orders: number
  marginBeforeOrderDiscounts?: number | null
  costCoverage?: { itemLines: number; itemLinesWithCost: number }
}

export interface SlowProduct {
  productId: string
  name: string | null
  categoryId: string | null
  stock: number
  units: number
  grossValue: number
}

export interface TrendingProduct {
  productId: string
  name: string | null
  currentUnits: number
  previousUnits: number
  delta: number
  percent: number | null
}

export type ProductsResponse =
  | { view: 'top'; window: AnalyticsWindow; total: number; items: TopProduct[] }
  | { view: 'bottom' | 'no_sales'; window: AnalyticsWindow; total: number; items: SlowProduct[] }
  | {
      view: 'trending'
      window: AnalyticsWindow
      compareWindow: AnalyticsWindow
      minUnits: number
      increasing: TrendingProduct[]
      decreasing: TrendingProduct[]
    }

export interface InventoryResponse {
  window: AnalyticsWindow
  current: { outOfStock: number; lowStock: number; lowStockThreshold: number }
  history:
    | {
        available: true
        items: Array<{
          productId: string
          name: string | null
          stockoutDays: number
          unitsSold: number
          averageStock: number
          turnover: number | null
        }>
      }
    | { available: false; measuredSince: string | null }
}

export interface CategoriesResponse {
  window: AnalyticsWindow
  items: Array<{
    categoryId: string
    name: string | null
    units: number
    grossValue: number
    orders: number
    sharePercent: number | null
    basis: { snapshotLines: number; currentCategoryLines: number }
  }>
}

export interface GovernoratesResponse {
  window: AnalyticsWindow
  partial: boolean
  items: Array<{
    governorateId: string
    name: string | null
    ordersPlaced: number
    ordersCompleted: number
    ordersRejected: number
    salesRevenue: number
    averageOrderValue: number | null
    rejectionRatePercent: number | null
    buyers: number | null
    monthly: Array<{ month: string; salesRevenue: number; ordersCompleted: number }>
  }>
}

export interface MarketingResponse {
  window: AnalyticsWindow
  partial: boolean
  registrations: { submitted: number; approved: number }
  newCustomers: number
  birthday: { discountTotal: number; completedOrders: number; usedOnRejectedOrders: number }
  loyalty: { discountTotal: number; discountClaims: number; giftClaims: number; giftsFulfilled: number }
  deliveryPromoGiven: number
  promoMarkdown: { total: number; coverage: { itemLines: number; itemLinesWithListPrice: number } }
  shares: Array<{ productId: string; name: string | null; shareOpens: number; shareConfirmed: number }>
  topSearches: Array<{ term: string; searches: number; zeroResult: number }>
  tracking: TrackingCoverage
  unavailable: Array<'coupons' | 'attribution'>
}

export interface BehaviourResponse {
  window: AnalyticsWindow
  tracking: TrackingCoverage
  totals: { productViews: number; cartAdds: number; shareOpens: number; shareConfirmed: number }
  topProducts: Array<{ productId: string; name: string | null; views: number; cartAdds: number }>
}

export interface NotificationsAnalyticsResponse {
  window: AnalyticsWindow
  partial: boolean
  push: { configured: boolean }
  campaigns: number
  activeDevices: Array<{ platform: string; count: number }>
  delivery: Array<{
    date: string
    audience: 'customer' | 'admin'
    created: number
    acceptedByFcm: number
    failed: number
    skippedNotConfigured: number
    skippedPreference: number
    skippedNoDevices: number
    devicesAcceptedByFcm: number
    devicesInvalid: number
  }>
  engagement: Array<{ date: string; readInApp: number; openedFromPush: number }>
  byType: Array<{ type: string; created: number; acceptedByFcm: number }>
}

export interface PeriodsResponse {
  definitionsVersion: number
  asOf: string
  tracking: TrackingCoverage
  inventoryMeasuredSince: string | null
  months: Array<{
    month: string
    status: 'open' | 'closed'
    partial: boolean
    closedAt: string | null
    computedAt: string | null
    definitionsVersion: number
    reconciliation: Record<string, unknown>
  }>
}
