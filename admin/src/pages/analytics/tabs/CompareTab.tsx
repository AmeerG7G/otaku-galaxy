import { useState } from 'react'
import { Card, DatePicker, Space, Typography } from 'antd'
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import { fetchAnalyticsCompare } from '../../../api/analyticsApi'
import { DataTable } from '../../../components/analytics/DataTable'
import type { CompareMetricKey, Kpi, Profit } from '../../../types/analytics'
import { currentMonth, formatIqd, formatNumber, formatPercent, monthLabel, shiftMonth } from '../../../utils/periods'
import { QueryView } from './shared'

const METRICS: Array<{ key: CompareMetricKey; title: string; money?: boolean }> = [
  { key: 'salesRevenue', title: 'إيراد المبيعات (بدون التوصيل)', money: true },
  { key: 'grossSales', title: 'الإجمالي قبل الخصومات', money: true },
  { key: 'productDiscounts', title: 'خصومات المنتجات', money: true },
  { key: 'ordersCompleted', title: 'طلبات مكتملة' },
  { key: 'averageOrderValue', title: 'متوسط قيمة الطلب', money: true },
  { key: 'unitsSold', title: 'القطع المباعة' },
  { key: 'newCustomers', title: 'زبائن جدد' },
  { key: 'buyers', title: 'زبائن اشتروا' },
  { key: 'activeCustomers', title: 'زبائن نشطون' },
  { key: 'customersMale', title: 'الزبائن — ذكور' },
  { key: 'customersFemale', title: 'الزبائن — إناث' },
]

interface Row {
  key: string
  title: string
  money?: boolean
  kpi: Kpi
}

/** مقارنة شهرين بعينهما — مثلاً أيلول 2026 مقابل آب 2026. */
export function CompareTab() {
  const [a, setA] = useState(currentMonth())
  const [b, setB] = useState(shiftMonth(currentMonth(), -1))
  const compare = useQuery({
    queryKey: ['analytics', 'compare', a, b],
    queryFn: () => fetchAnalyticsCompare(a, b),
    staleTime: 5 * 60_000,
  })
  const format = (value: number | null, money?: boolean) => (value === null ? '—' : money ? formatIqd(value) : formatNumber(value))
  const profitText = (profit: Profit) => (profit.available ? formatIqd(profit.grossProfit) : 'غير متاح')

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space wrap align="center">
        <DatePicker picker="month" allowClear={false} value={dayjs(`${a}-01`)} onChange={(v) => v && setA(v.format('YYYY-MM'))} aria-label="الشهر الأول" />
        <Typography.Text type="secondary">مقابل</Typography.Text>
        <DatePicker picker="month" allowClear={false} value={dayjs(`${b}-01`)} onChange={(v) => v && setB(v.format('YYYY-MM'))} aria-label="الشهر الثاني" />
      </Space>
      <QueryView query={compare}>
        {(data) => (
          <Card
            variant="borderless"
            title={`${monthLabel(data.a.month)} مقابل ${monthLabel(data.b.month)}`}
            extra={data.a.partial || data.b.partial ? <Typography.Text type="secondary">شهرٌ جارٍ — حتى اليوم</Typography.Text> : null}
          >
            <DataTable<Row>
              rows={[
                ...METRICS.map((m) => ({ key: m.key, title: m.title, money: m.money, kpi: data.metrics[m.key] })),
              ]}
              rowKey={(row) => row.key}
              columns={[
                { title: 'المؤشّر', width: 220, dataIndex: 'title' },
                { title: monthLabel(data.a.month), width: 150, render: (_, row) => format(row.kpi.current, row.money) },
                { title: monthLabel(data.b.month), width: 150, render: (_, row) => format(row.kpi.previous, row.money) },
                { title: 'الفرق', width: 140, render: (_, row) => format(row.kpi.delta, row.money) },
                { title: 'النسبة', width: 100, render: (_, row) => formatPercent(row.kpi.percent) },
              ]}
            />
            {data.profit && (
              <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0 }} data-testid="compare-profit">
                الربح الإجمالي: {monthLabel(data.a.month)} {profitText(data.profit.a)} · {monthLabel(data.b.month)}{' '}
                {profitText(data.profit.b)}
              </Typography.Paragraph>
            )}
          </Card>
        )}
      </QueryView>
    </Space>
  )
}
