import { useQuery } from '@tanstack/react-query'
import { fetchAnalyticsGovernorates } from '../../../api/analyticsApi'
import { BarRanking } from '../../../components/analytics/BarRanking'
import { ChartCard } from '../../../components/analytics/ChartCard'
import { DataTable } from '../../../components/analytics/DataTable'
import { formatIqd, formatNumber } from '../../../utils/periods'
import { QueryView, type TabProps } from './shared'

export function GovernoratesTab({ range }: TabProps) {
  const governorates = useQuery({
    queryKey: ['analytics', 'governorates', range.from, range.to],
    queryFn: () => fetchAnalyticsGovernorates(range),
    staleTime: 5 * 60_000,
  })
  return (
    <QueryView query={governorates}>
      {(data) => (
        <ChartCard
          title="إيراد المبيعات حسب محافظة التوصيل"
          empty={data.items.length === 0}
          chart={
            <BarRanking
              data={data.items.map((g) => ({ label: g.name ?? '—', value: g.salesRevenue }))}
              formatValue={formatIqd}
              valueLabel="إيراد المبيعات"
            />
          }
          table={
            <DataTable
              rows={data.items}
              rowKey={(row) => row.governorateId}
              columns={[
                { title: 'المحافظة', width: 150, dataIndex: 'name', render: (v) => String(v ?? '—') },
                { title: 'مُنشأة', width: 90, dataIndex: 'ordersPlaced', render: (v) => formatNumber(Number(v)) },
                { title: 'مكتملة', width: 90, dataIndex: 'ordersCompleted', render: (v) => formatNumber(Number(v)) },
                { title: 'مرفوضة', width: 90, dataIndex: 'ordersRejected', render: (v) => formatNumber(Number(v)) },
                { title: 'إيراد المبيعات', width: 150, dataIndex: 'salesRevenue', render: (v) => formatIqd(Number(v)) },
                { title: 'متوسط الطلب', width: 130, dataIndex: 'averageOrderValue', render: (v) => formatIqd(v === null ? null : Number(v)) },
                { title: 'نسبة الرفض', width: 110, dataIndex: 'rejectionRatePercent', render: (v) => (v === null ? '—' : `${formatNumber(Number(v), true)}%`) },
                { title: 'مشترون', width: 100, dataIndex: 'buyers', render: (v) => (v === null ? '—' : formatNumber(Number(v))) },
              ]}
            />
          }
        />
      )}
    </QueryView>
  )
}
