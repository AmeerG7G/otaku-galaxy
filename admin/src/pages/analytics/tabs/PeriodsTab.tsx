import { Card, Space, Tag, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { fetchAnalyticsPeriods } from '../../../api/analyticsApi'
import { DataTable } from '../../../components/analytics/DataTable'
import type { PeriodsResponse } from '../../../types/analytics'
import { formatIqd, formatNumber, monthLabel } from '../../../utils/periods'
import { QueryView, TrackingNote } from './shared'

type Month = PeriodsResponse['months'][number]

const num = (r: Record<string, unknown>, key: string) => (typeof r[key] === 'number' ? (r[key] as number) : null)

/**
 * الفترات — حالة كل شهر (مفتوح/مُغلق) ومطابقته مع المصدر: ما حُسب وكيف، وما
 * استُبعد (طلبات المسؤولين والحسابات الداخلية)، وتغطية لقطات القسم والتكلفة.
 */
export function PeriodsTab() {
  const periods = useQuery({ queryKey: ['analytics', 'periods'], queryFn: fetchAnalyticsPeriods, staleTime: 5 * 60_000 })
  return (
    <QueryView query={periods}>
      {(data) => (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card variant="borderless" title="مصادر القياس">
            <Space direction="vertical" size={4}>
              <Typography.Text>إصدار التعريفات: {data.definitionsVersion}</Typography.Text>
              <TrackingNote tracking={data.tracking} />
              <Typography.Text type="secondary">
                {data.inventoryMeasuredSince
                  ? `لقطات المخزون اليومية منذ ${data.inventoryMeasuredSince}.`
                  : 'لا لقطات مخزون بعد.'}
              </Typography.Text>
            </Space>
          </Card>
          <Card variant="borderless" title="الأشهر">
            <DataTable<Month>
              rows={data.months}
              rowKey={(row) => row.month}
              columns={[
                { title: 'الشهر', width: 140, dataIndex: 'month', render: (v) => monthLabel(String(v)) },
                {
                  title: 'الحالة',
                  width: 110,
                  render: (_, row) =>
                    row.status === 'closed' ? <Tag>مُغلق</Tag> : <Tag color="processing">{row.partial ? 'جارٍ' : 'مفتوح'}</Tag>,
                },
                { title: 'أُغلق في', width: 120, dataIndex: 'closedAt', render: (v) => (v ? String(v).slice(0, 10) : '—') },
                { title: 'طلبات مكتملة', width: 110, render: (_, row) => formatNumber(num(row.reconciliation, 'completedOrders')) },
                { title: 'إيراد المبيعات', width: 150, render: (_, row) => formatIqd(num(row.reconciliation, 'salesRevenue')) },
                {
                  title: 'مستبعَدة (إدارية/داخلية)',
                  width: 170,
                  render: (_, row) => formatNumber(num(row.reconciliation, 'excludedOrdersCompleted')),
                },
                {
                  title: 'تغطية التكلفة',
                  width: 130,
                  render: (_, row) => {
                    const lines = num(row.reconciliation, 'itemLines')
                    const withCost = num(row.reconciliation, 'itemLinesWithCost')
                    return lines ? `${formatNumber(withCost)} / ${formatNumber(lines)}` : '—'
                  },
                },
                {
                  title: 'مطابقة المصدر',
                  width: 120,
                  render: (_, row) => {
                    const check = row.reconciliation.sourceCheck as { matches?: boolean } | undefined
                    return check === undefined ? '—' : check.matches ? 'مطابقة' : 'غير مطابقة'
                  },
                },
              ]}
            />
          </Card>
        </Space>
      )}
    </QueryView>
  )
}
