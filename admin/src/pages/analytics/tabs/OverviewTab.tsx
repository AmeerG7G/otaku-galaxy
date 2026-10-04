import { Card, Space, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { fetchAnalyticsOverview, fetchAnalyticsSales } from '../../../api/analyticsApi'
import { AnalyticsKpi } from '../../../components/analytics/AnalyticsKpi'
import { ChartCard } from '../../../components/analytics/ChartCard'
import { DataTable } from '../../../components/analytics/DataTable'
import { TrendChart } from '../../../components/analytics/TrendChart'
import type { OverviewKpiKey, Profit } from '../../../types/analytics'
import { formatIqd, formatNumber, monthLabel, shiftMonth, shortMonthLabel } from '../../../utils/periods'
import { Cell, Grid, QueryView, type TabProps } from './shared'
import { compareLabelFor } from './tabUtils'

const KPIS: Array<{ key: OverviewKpiKey; title: string; money?: boolean; decimals?: boolean }> = [
  { key: 'salesRevenue', title: 'إيراد المبيعات (بدون التوصيل)', money: true },
  { key: 'grossSales', title: 'إجمالي المبيعات قبل الخصومات', money: true },
  { key: 'productDiscounts', title: 'خصومات المنتجات (ميلاد + مزايا)', money: true },
  { key: 'ordersCompleted', title: 'طلبات مكتملة' },
  { key: 'ordersPlaced', title: 'طلبات مُنشأة' },
  { key: 'ordersRejected', title: 'طلبات مرفوضة' },
  { key: 'averageOrderValue', title: 'متوسط قيمة الطلب', money: true },
  { key: 'highestOrderValue', title: 'أعلى قيمة طلب', money: true },
  { key: 'unitsSold', title: 'القطع المباعة' },
  { key: 'unitsPerOrder', title: 'متوسط القطع لكل طلب', decimals: true },
  { key: 'newCustomers', title: 'زبائن جدد' },
  { key: 'buyers', title: 'زبائن اشتروا' },
  { key: 'activeCustomers', title: 'زبائن نشطون' },
  { key: 'customersMale', title: 'الزبائن — ذكور' },
  { key: 'customersFemale', title: 'الزبائن — إناث' },
  { key: 'processingAtEnd', title: 'قيد المعالجة في نهاية الفترة' },
]

function ProfitCard({ profit, compareLabel }: { profit: { current: Profit; previous: Profit | null }; compareLabel: string | null }) {
  const { current } = profit
  return (
    <Card variant="borderless" title="الربح الإجمالي (للمسؤول الأعلى)" data-testid="profit-card">
      {current.available ? (
        <Space direction="vertical" size={4}>
          <Typography.Text style={{ fontSize: 26, fontWeight: 800 }} className="tnum">
            {formatIqd(current.grossProfit)}
          </Typography.Text>
          <Typography.Text type="secondary">
            الهامش {formatNumber(current.marginPercent, true)}% · تكلفة البضاعة {formatIqd(current.cogs)}
          </Typography.Text>
          {compareLabel && profit.previous && (
            <Typography.Text type="secondary">
              {compareLabel}: {profit.previous.available ? formatIqd(profit.previous.grossProfit) : 'غير متاح'}
            </Typography.Text>
          )}
        </Space>
      ) : (
        <Typography.Text>
          غير متاح — تكلفة الشراء غير مسجّلة لـ{' '}
          {formatNumber(current.coverage.itemLines - current.coverage.itemLinesWithCost)} من{' '}
          {formatNumber(current.coverage.itemLines)} بنداً مكتملاً في هذه الفترة.
        </Typography.Text>
      )}
    </Card>
  )
}

export function OverviewTab({ range, compare }: TabProps) {
  const overview = useQuery({
    queryKey: ['analytics', 'overview', range.from, range.to, compare],
    queryFn: () => fetchAnalyticsOverview({ ...range, compare }),
    staleTime: 5 * 60_000,
  })
  // اتجاه الإيراد: المدى نفسه، أو آخر ستة أشهر حتى نهايته لمدى شهرٍ واحد.
  const trendFrom = range.from === range.to ? shiftMonth(range.to, -5) : range.from
  const trend = useQuery({
    queryKey: ['analytics', 'sales', 'month', trendFrom, range.to],
    queryFn: () => fetchAnalyticsSales({ granularity: 'month', from: trendFrom, to: range.to }),
    staleTime: 5 * 60_000,
  })

  return (
    <QueryView query={overview}>
      {(data) => {
        const compareLabel = compareLabelFor(compare, data.compare?.window)
        return (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Grid>
              {KPIS.map(({ key, title, money, decimals }) => (
                <Cell key={key}>
                  <AnalyticsKpi
                    title={title}
                    kpi={data.kpis[key]}
                    compareLabel={compareLabel}
                    format={(value) =>
                      value === null
                        ? key === 'activeCustomers' || key === 'buyers'
                          ? 'غير متاح'
                          : '—'
                        : money
                          ? formatIqd(value)
                          : formatNumber(value, decimals)
                    }
                  />
                </Cell>
              ))}
            </Grid>
            {data.profit && <ProfitCard profit={data.profit} compareLabel={compareLabel} />}
            <QueryView query={trend}>
              {(sales) => (
                <ChartCard
                  title="الإيراد الشهري"
                  empty={sales.series.length === 0}
                  note={sales.partial ? `${monthLabel(range.to)} جارٍ — النقطة الأخيرة جوفاء حتى يكتمل الشهر.` : undefined}
                  chart={
                    <TrendChart
                      data={sales.series.map((p) => ({ period: p.period, salesRevenue: p.salesRevenue, grossSales: p.grossSales }))}
                      xKey="period"
                      series={[
                        { key: 'salesRevenue', label: 'إيراد المبيعات', slot: 0 },
                        { key: 'grossSales', label: 'الإجمالي قبل الخصومات', slot: 1, dashed: true },
                      ]}
                      formatX={shortMonthLabel}
                      formatValue={formatIqd}
                      partialLast={sales.partial}
                    />
                  }
                  table={
                    <DataTable
                      rows={sales.series}
                      rowKey={(row) => row.period}
                      columns={[
                        { title: 'الشهر', width: 140, dataIndex: 'period', render: (v) => monthLabel(String(v)) },
                        { title: 'إيراد المبيعات', width: 160, dataIndex: 'salesRevenue', render: (v) => formatIqd(Number(v)) },
                        { title: 'الإجمالي', width: 160, dataIndex: 'grossSales', render: (v) => formatIqd(Number(v)) },
                        { title: 'طلبات مكتملة', width: 120, dataIndex: 'ordersCompleted', render: (v) => formatNumber(Number(v)) },
                      ]}
                    />
                  }
                />
              )}
            </QueryView>
          </Space>
        )
      }}
    </QueryView>
  )
}
