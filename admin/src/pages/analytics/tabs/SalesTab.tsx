import { useState } from 'react'
import { Segmented, Space } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { fetchAnalyticsSales } from '../../../api/analyticsApi'
import { ChartCard } from '../../../components/analytics/ChartCard'
import { DataTable } from '../../../components/analytics/DataTable'
import { StackedBars } from '../../../components/analytics/StackedBars'
import { TrendChart } from '../../../components/analytics/TrendChart'
import type { SalesPoint } from '../../../types/analytics'
import { dayLabel, formatIqd, formatNumber, monthLabel, shortMonthLabel, storeToday } from '../../../utils/periods'
import { QueryView, type TabProps } from './shared'

function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return `${month}-${String(last).padStart(2, '0')}`
}

export function SalesTab({ range }: TabProps) {
  const [granularity, setGranularity] = useState<'month' | 'day'>('month')
  const today = storeToday()
  const dayTo = lastDayOf(range.to) < today ? lastDayOf(range.to) : today
  const params =
    granularity === 'month'
      ? { granularity, from: range.from, to: range.to }
      : { granularity, from: `${range.from}-01`, to: dayTo }
  const sales = useQuery({
    queryKey: ['analytics', 'sales', params.granularity, params.from, params.to],
    queryFn: () => fetchAnalyticsSales(params),
    staleTime: 5 * 60_000,
  })
  const formatX = granularity === 'month' ? shortMonthLabel : dayLabel
  const hasProfit = (rows: SalesPoint[]) => rows.some((r) => r.profit !== undefined)

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Segmented
        value={granularity}
        onChange={(value) => setGranularity(value as 'month' | 'day')}
        options={[
          { value: 'month', label: 'شهري' },
          { value: 'day', label: 'يومي' },
        ]}
        aria-label="الدقّة"
      />
      <QueryView query={sales}>
        {(data) => (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <ChartCard
              title="الإيراد والإجمالي"
              empty={data.series.length === 0}
              note="الإيراد = الإجمالي ناقص خصومات المنتجات. رسوم التوصيل ليست إيراداً."
              chart={
                <TrendChart
                  data={data.series.map((p) => ({ period: p.period, salesRevenue: p.salesRevenue, grossSales: p.grossSales }))}
                  xKey="period"
                  series={[
                    { key: 'salesRevenue', label: 'إيراد المبيعات', slot: 0 },
                    { key: 'grossSales', label: 'الإجمالي قبل الخصومات', slot: 1, dashed: true },
                  ]}
                  formatX={formatX}
                  formatValue={formatIqd}
                  partialLast={data.partial}
                />
              }
              table={
                <DataTable
                  rows={data.series}
                  rowKey={(row) => row.period}
                  columns={[
                    { title: granularity === 'month' ? 'الشهر' : 'اليوم', width: 130, dataIndex: 'period', render: (v) => (granularity === 'month' ? monthLabel(String(v)) : String(v)) },
                    { title: 'إيراد المبيعات', width: 150, dataIndex: 'salesRevenue', render: (v) => formatIqd(Number(v)) },
                    { title: 'الإجمالي', width: 150, dataIndex: 'grossSales', render: (v) => formatIqd(Number(v)) },
                    { title: 'خصم الميلاد', width: 130, dataIndex: 'birthdayDiscounts', render: (v) => formatIqd(Number(v)) },
                    { title: 'خصم المزايا', width: 130, dataIndex: 'loyaltyDiscounts', render: (v) => formatIqd(Number(v)) },
                    { title: 'مكتملة', width: 90, dataIndex: 'ordersCompleted', render: (v) => formatNumber(Number(v)) },
                    { title: 'مرفوضة', width: 90, dataIndex: 'ordersRejected', render: (v) => formatNumber(Number(v)) },
                    { title: 'القطع', width: 90, dataIndex: 'unitsSold', render: (v) => formatNumber(Number(v)) },
                    { title: 'متوسط الطلب', width: 130, dataIndex: 'averageOrderValue', render: (v) => formatIqd(v === null ? null : Number(v)) },
                    ...(hasProfit(data.series)
                      ? [
                          {
                            title: 'الربح الإجمالي',
                            width: 150,
                            render: (_: unknown, row: SalesPoint) =>
                              row.profit?.available ? formatIqd(row.profit.grossProfit) : 'غير متاح',
                          },
                        ]
                      : []),
                  ]}
                />
              }
            />
            <ChartCard
              title="الطلبات المكتملة والمرفوضة"
              empty={data.series.length === 0}
              chart={
                <StackedBars
                  data={data.series.map((p) => ({ period: p.period, completed: p.ordersCompleted, rejected: p.ordersRejected }))}
                  xKey="period"
                  series={[
                    { key: 'completed', label: 'مكتملة', slot: 0 },
                    { key: 'rejected', label: 'مرفوضة', slot: 1 },
                  ]}
                  formatX={formatX}
                  formatValue={(v) => formatNumber(v)}
                />
              }
              table={
                <DataTable
                  rows={data.series}
                  rowKey={(row) => row.period}
                  columns={[
                    { title: 'الفترة', width: 130, dataIndex: 'period' },
                    { title: 'مُنشأة', width: 100, dataIndex: 'ordersPlaced', render: (v) => formatNumber(Number(v)) },
                    { title: 'مكتملة', width: 100, dataIndex: 'ordersCompleted', render: (v) => formatNumber(Number(v)) },
                    { title: 'مرفوضة', width: 100, dataIndex: 'ordersRejected', render: (v) => formatNumber(Number(v)) },
                  ]}
                />
              }
            />
          </Space>
        )}
      </QueryView>
    </Space>
  )
}
