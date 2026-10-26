import { get } from './client'
import type {
  BehaviourResponse,
  CategoriesResponse,
  CompareMode,
  CompareResponse,
  CustomersResponse,
  GovernoratesResponse,
  InventoryResponse,
  MarketingResponse,
  NotificationsAnalyticsResponse,
  OverviewResponse,
  PeriodsResponse,
  ProductsResponse,
  ProductsView,
  SalesResponse,
} from '../types/analytics'

/**
 * «التحليلات» — قراءةٌ فقط (`/admin/analytics/*`، قسم `analytics`).
 * المدى أشهرٌ بصيغة YYYY-MM؛ ومخطّط المبيعات اليومي أيامٌ YYYY-MM-DD.
 */
export interface MonthRange {
  from: string
  to: string
}

export const fetchAnalyticsPeriods = () => get<PeriodsResponse>('/admin/analytics/periods')

export const fetchAnalyticsOverview = (range: MonthRange & { compare: CompareMode }) =>
  get<OverviewResponse>('/admin/analytics/overview', { params: range })

export const fetchAnalyticsCompare = (a: string, b: string) =>
  get<CompareResponse>('/admin/analytics/compare', { params: { a, b } })

export const fetchAnalyticsSales = (params: { granularity: 'day' | 'month'; from: string; to: string }) =>
  get<SalesResponse>('/admin/analytics/sales', { params })

export const fetchAnalyticsCustomers = (range: MonthRange) =>
  get<CustomersResponse>('/admin/analytics/customers', { params: range })

export const fetchAnalyticsProducts = (
  params: MonthRange & { view: ProductsView; sort?: 'units' | 'revenue'; page?: number; limit?: number; categoryId?: string },
) => get<ProductsResponse>('/admin/analytics/products', { params })

export const fetchAnalyticsInventory = (range: MonthRange) =>
  get<InventoryResponse>('/admin/analytics/inventory', { params: range })

export const fetchAnalyticsCategories = (range: MonthRange) =>
  get<CategoriesResponse>('/admin/analytics/categories', { params: range })

export const fetchAnalyticsGovernorates = (range: MonthRange) =>
  get<GovernoratesResponse>('/admin/analytics/governorates', { params: range })

export const fetchAnalyticsMarketing = (range: MonthRange) =>
  get<MarketingResponse>('/admin/analytics/marketing', { params: range })

export const fetchAnalyticsBehaviour = (range: MonthRange) =>
  get<BehaviourResponse>('/admin/analytics/behaviour', { params: range })

export const fetchAnalyticsNotifications = (range: MonthRange) =>
  get<NotificationsAnalyticsResponse>('/admin/analytics/notifications', { params: range })
