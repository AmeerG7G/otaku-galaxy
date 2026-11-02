import { Space, Tabs } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { fetchAnalyticsPeriods } from '../../api/analyticsApi'
import { PageHeader } from '../../components/ui/PageHeader'
import { AnalyticsFilters } from './AnalyticsFilters'
import { ANALYTICS_TABS, type AnalyticsTabKey as TabKey } from './analyticsTabs'
import { useAnalyticsFilters } from './useAnalyticsFilters'
import { CompareTab } from './tabs/CompareTab'
import { CustomersTab } from './tabs/CustomersTab'
import { GovernoratesTab } from './tabs/GovernoratesTab'
import { MarketingTab } from './tabs/MarketingTab'
import { NotificationsTab } from './tabs/NotificationsTab'
import { OverviewTab } from './tabs/OverviewTab'
import { PeriodsTab } from './tabs/PeriodsTab'
import { ProductsTab } from './tabs/ProductsTab'
import { SalesTab } from './tabs/SalesTab'

/**
 * «التحليلات» — قسمٌ مستقل (`analytics`) عن الرئيسية التشغيلية (D4).
 *
 * التبويب والفترة والمقارنة في الرابط: تبقى بعد التحديث والرجوع، ويُشارَك رابطٌ
 * بعينه. التبويب النشط وحده يجلب بياناته.
 */
export default function AnalyticsPage() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const active: TabKey = ANALYTICS_TABS.some((t) => t.key === tab) ? (tab as TabKey) : 'overview'
  const periods = useQuery({ queryKey: ['analytics', 'periods'], queryFn: fetchAnalyticsPeriods, staleTime: 5 * 60_000 })
  const firstMonth = periods.data?.months[periods.data.months.length - 1]?.month
  const filters = useAnalyticsFilters(firstMonth)
  const props = { range: filters.range, compare: filters.compare }
  const usesRange = active !== 'compare' && active !== 'periods'

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="التحليلات" />
      <Tabs
        activeKey={active}
        onChange={(key) => navigate(`/analytics/${key}${location.search}`)}
        items={ANALYTICS_TABS.map((t) => ({ key: t.key, label: t.label }))}
      />
      {usesRange && (
        <AnalyticsFilters
          preset={filters.preset}
          range={filters.range}
          compare={filters.compare}
          showCompare={active === 'overview'}
          onPreset={filters.setPreset}
          onCustom={filters.setCustom}
          onCompare={filters.setCompare}
        />
      )}
      {active === 'overview' && <OverviewTab {...props} />}
      {active === 'sales' && <SalesTab {...props} />}
      {active === 'customers' && <CustomersTab {...props} />}
      {active === 'products' && <ProductsTab {...props} />}
      {active === 'governorates' && <GovernoratesTab {...props} />}
      {active === 'marketing' && <MarketingTab {...props} />}
      {active === 'notifications' && <NotificationsTab {...props} />}
      {active === 'compare' && <CompareTab />}
      {active === 'periods' && <PeriodsTab />}
    </Space>
  )
}
