import { Card, Space } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { fetchAnalyticsCustomers } from '../../../api/analyticsApi'
import { ChartCard } from '../../../components/analytics/ChartCard'
import { DataTable } from '../../../components/analytics/DataTable'
import { GenderSplit } from '../../../components/analytics/GenderSplit'
import { StackedBars } from '../../../components/analytics/StackedBars'
import { TrendChart } from '../../../components/analytics/TrendChart'
import { dayLabel, formatNumber, monthLabel, shortMonthLabel } from '../../../utils/periods'
import { QueryView, TrackingNote, type TabProps } from './shared'

export function CustomersTab({ range }: TabProps) {
  const customers = useQuery({
    queryKey: ['analytics', 'customers', range.from, range.to],
    queryFn: () => fetchAnalyticsCustomers(range),
    staleTime: 5 * 60_000,
  })
  return (
    <QueryView query={customers}>
      {(data) => (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card variant="borderless" title="الزبائن حسب الجنس (نهاية الفترة)">
            <GenderSplit male={data.genderDistribution.male} female={data.genderDistribution.female} />
          </Card>
          <ChartCard
            title="نموّ الزبائن"
            empty={data.monthly.length === 0}
            chart={
              <TrendChart
                data={data.monthly.map((m) => ({ month: m.month, customersEnd: m.customersEnd, newCustomers: m.newCustomers }))}
                xKey="month"
                series={[
                  { key: 'customersEnd', label: 'إجمالي الزبائن', slot: 0 },
                  { key: 'newCustomers', label: 'زبائن جدد', slot: 1 },
                ]}
                formatX={shortMonthLabel}
                formatValue={(v) => formatNumber(v)}
                partialLast={data.partial}
              />
            }
            table={
              <DataTable
                rows={data.monthly}
                rowKey={(row) => row.month}
                columns={[
                  { title: 'الشهر', width: 130, dataIndex: 'month', render: (v) => monthLabel(String(v)) },
                  { title: 'إجمالي الزبائن', width: 120, dataIndex: 'customersEnd', render: (v) => formatNumber(Number(v)) },
                  { title: 'ذكور', width: 90, dataIndex: 'customersMale', render: (v) => formatNumber(Number(v)) },
                  { title: 'إناث', width: 90, dataIndex: 'customersFemale', render: (v) => formatNumber(Number(v)) },
                  { title: 'جدد', width: 90, dataIndex: 'newCustomers', render: (v) => formatNumber(Number(v)) },
                  { title: 'اشتروا', width: 90, dataIndex: 'buyers', render: (v) => formatNumber(Number(v)) },
                  { title: 'مكرِّرو الشراء', width: 120, dataIndex: 'repeatBuyers', render: (v) => formatNumber(Number(v)) },
                  { title: 'نشطون', width: 100, dataIndex: 'activeCustomers', render: (v) => (v === null ? 'لم يُقَس' : formatNumber(Number(v))) },
                ]}
              />
            }
          />
          <ChartCard
            title="المشترون: جدد وعائدون"
            empty={data.monthly.length === 0}
            chart={
              <StackedBars
                data={data.monthly.map((m) => ({ month: m.month, newBuyers: m.newBuyers, returningBuyers: m.returningBuyers }))}
                xKey="month"
                series={[
                  { key: 'newBuyers', label: 'أول شراء', slot: 0 },
                  { key: 'returningBuyers', label: 'عائدون', slot: 1 },
                ]}
                formatX={shortMonthLabel}
                formatValue={(v) => formatNumber(v)}
              />
            }
            table={
              <DataTable
                rows={data.monthly}
                rowKey={(row) => row.month}
                columns={[
                  { title: 'الشهر', width: 130, dataIndex: 'month', render: (v) => monthLabel(String(v)) },
                  { title: 'أول شراء', width: 100, dataIndex: 'newBuyers', render: (v) => formatNumber(Number(v)) },
                  { title: 'عائدون', width: 100, dataIndex: 'returningBuyers', render: (v) => formatNumber(Number(v)) },
                  { title: 'مشترون ذكور', width: 110, dataIndex: 'buyersMale', render: (v) => formatNumber(Number(v)) },
                  { title: 'مشترون إناث', width: 110, dataIndex: 'buyersFemale', render: (v) => formatNumber(Number(v)) },
                ]}
              />
            }
          />
          <ChartCard
            title="النشاط اليومي"
            empty={data.dailyActivity.length === 0}
            emptyText="لا نشاط مُقاس في هذا المدى."
            note={<TrackingNote tracking={data.tracking} />}
            chart={
              <TrendChart
                data={data.dailyActivity.map((d) => ({ date: d.date, activeCustomers: d.activeCustomers, logins: d.logins }))}
                xKey="date"
                series={[
                  { key: 'activeCustomers', label: 'زبائن نشطون', slot: 0 },
                  { key: 'logins', label: 'تسجيلات الدخول', slot: 1 },
                ]}
                formatX={dayLabel}
                formatValue={(v) => formatNumber(v)}
              />
            }
            table={
              <DataTable
                rows={data.dailyActivity}
                rowKey={(row) => row.date}
                columns={[
                  { title: 'اليوم', width: 120, dataIndex: 'date' },
                  { title: 'زبائن نشطون', width: 120, dataIndex: 'activeCustomers', render: (v) => formatNumber(Number(v)) },
                  { title: 'تسجيلات الدخول', width: 120, dataIndex: 'logins', render: (v) => formatNumber(Number(v)) },
                ]}
              />
            }
          />
        </Space>
      )}
    </QueryView>
  )
}
