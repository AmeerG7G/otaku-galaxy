import { Card, Space, Statistic, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { fetchAnalyticsMarketing } from '../../../api/analyticsApi'
import { DataTable } from '../../../components/analytics/DataTable'
import { ProductLink } from '../../../components/ui/ProductLink'
import { formatIqd, formatNumber } from '../../../utils/periods'
import { Cell, Grid, QueryView, TrackingNote, type TabProps } from './shared'

const UNAVAILABLE_LABELS: Record<'coupons' | 'attribution', string> = {
  coupons: 'استخدام الكوبونات — لا نظام كوبونات في المتجر',
  attribution: 'مصدر الزبون (تيك توك/إنستغرام) — لا آلية إسنادٍ موثوقة',
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <Card variant="borderless" style={{ height: '100%' }}>
      <Statistic title={title} value={value} />
    </Card>
  )
}

export function MarketingTab({ range }: TabProps) {
  const marketing = useQuery({
    queryKey: ['analytics', 'marketing', range.from, range.to],
    queryFn: () => fetchAnalyticsMarketing(range),
    staleTime: 5 * 60_000,
  })
  return (
    <QueryView query={marketing}>
      {(data) => (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Grid>
            <Cell>
              <Stat title="طلبات تسجيل مُرسلة" value={formatNumber(data.registrations.submitted)} />
            </Cell>
            <Cell>
              <Stat title="حسابات مُفعَّلة" value={formatNumber(data.registrations.approved)} />
            </Cell>
            <Cell>
              <Stat title="خصم الميلاد الممنوح" value={formatIqd(data.birthday.discountTotal)} />
            </Cell>
            <Cell>
              <Stat title="طلبات مكتملة بخصم الميلاد" value={formatNumber(data.birthday.completedOrders)} />
            </Cell>
            <Cell>
              <Stat title="خصم الميلاد على طلبات مرفوضة" value={formatNumber(data.birthday.usedOnRejectedOrders)} />
            </Cell>
            <Cell>
              <Stat title="خصم مزايا المستوى" value={formatIqd(data.loyalty.discountTotal)} />
            </Cell>
            <Cell>
              <Stat title="مزايا خصم مُطالَب بها" value={formatNumber(data.loyalty.discountClaims)} />
            </Cell>
            <Cell>
              <Stat title="هدايا مُطالَب بها / سُلّمت" value={`${formatNumber(data.loyalty.giftClaims)} / ${formatNumber(data.loyalty.giftsFulfilled)}`} />
            </Cell>
            <Cell>
              <Stat title="خصم التوصيل الترويجي (كلفة لا إيراد)" value={formatIqd(data.deliveryPromoGiven)} />
            </Cell>
            <Cell>
              <Stat
                title="تخفيض الأسعار المشطوبة"
                value={
                  data.promoMarkdown.coverage.itemLinesWithListPrice === 0
                    ? 'غير متاح'
                    : formatIqd(data.promoMarkdown.total)
                }
              />
            </Cell>
          </Grid>
          <Card variant="borderless" title="غير متاح (لا مصدر بيانات)">
            <Space direction="vertical" size={4}>
              {data.unavailable.map((key) => (
                <Typography.Text key={key} type="secondary">
                  {UNAVAILABLE_LABELS[key]}
                </Typography.Text>
              ))}
            </Space>
          </Card>
          <Card variant="borderless" title="الأكثر مشاركة">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <TrackingNote tracking={data.tracking} />
              {data.shares.length > 0 && (
                <DataTable
                  rows={data.shares}
                  rowKey={(row) => row.productId}
                  columns={[
                    { title: 'المنتج', width: 240, render: (_, row) => <ProductLink productId={row.productId} name={row.name ?? 'منتج محذوف'} /> },
                    { title: 'فتح المشاركة', width: 120, dataIndex: 'shareOpens', render: (v) => formatNumber(Number(v)) },
                    { title: 'مؤكَّدة', width: 100, dataIndex: 'shareConfirmed', render: (v) => formatNumber(Number(v)) },
                  ]}
                />
              )}
            </Space>
          </Card>
          <Card variant="borderless" title="الأكثر بحثاً">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <TrackingNote tracking={data.tracking} />
              {data.topSearches.length > 0 && (
                <DataTable
                  rows={data.topSearches}
                  rowKey={(row) => row.term}
                  columns={[
                    { title: 'عبارة البحث', width: 220, dataIndex: 'term' },
                    { title: 'مرات البحث', width: 110, dataIndex: 'searches', render: (v) => formatNumber(Number(v)) },
                    { title: 'بلا نتائج', width: 100, dataIndex: 'zeroResult', render: (v) => formatNumber(Number(v)) },
                  ]}
                />
              )}
            </Space>
          </Card>
        </Space>
      )}
    </QueryView>
  )
}
