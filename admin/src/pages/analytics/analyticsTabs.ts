/** تبويبات «التحليلات» — المفتاح جزءٌ من الرابط (`/analytics/:tab`). */
export const ANALYTICS_TABS = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'sales', label: 'المبيعات' },
  { key: 'customers', label: 'الزبائن' },
  { key: 'products', label: 'المنتجات' },
  { key: 'governorates', label: 'المحافظات' },
  { key: 'marketing', label: 'التسويق' },
  { key: 'notifications', label: 'الإشعارات' },
  { key: 'compare', label: 'المقارنات' },
  { key: 'periods', label: 'الفترات' },
] as const

export type AnalyticsTabKey = (typeof ANALYTICS_TABS)[number]['key']
