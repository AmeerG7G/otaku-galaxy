import { useQuery } from '@tanstack/react-query'
import { Flex, Space, Statistic, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { getCustomerPoints } from '../api/pointsApi'
import { POINTS_REASON_COLORS, POINTS_REASON_LABELS } from '../constants/points'
import { useCan } from '../hooks/useAdminProfile'
import type { PointsLedgerEntry } from '../types/points'
import { formatDateTime } from '../utils/format'
import EmptyState from './EmptyState'
import { ErrorState } from './ui/States'
import { ResponsiveTable } from './ui/ResponsiveTable'

const CUSTOMER_POINTS_QUERY_KEY = 'admin-customer-points'

/**
 * سجلّ نقاط زبون واحد — «كيف صار رصيده هكذا؟» سطراً سطراً.
 *
 * مكوّنٌ واحد لكل مكانٍ يُفتح منه الدفتر (صفحة الزبون، ونافذتا «الزبائن»
 * و«نقاط المجرّة») حتى لا يختلف ما يعرضه كلٌّ منها.
 *
 * [CRITICAL] (STEP 66) كان فشلُ الطلب يُرسم دفتراً فارغاً برصيد صفر — فبدا
 * «رصيده ٣٥ والسجلّ فارغ» خللاً في البيانات وهو خطأٌ مبتلع. الخطأ هنا
 * يُعرض خطأً مع «إعادة المحاولة»، ولا رصيد يُعرض إلا ما أرسله الخادم.
 */
export function PointsLedger({ customerId }: { customerId: string }) {
  const canOpenOrders = useCan('orders')
  const query = useQuery({
    queryKey: [CUSTOMER_POINTS_QUERY_KEY, customerId],
    queryFn: () => getCustomerPoints(customerId),
  })

  if (query.isError) {
    return (
      <ErrorState
        message="تعذّر تحميل سجلّ النقاط"
        description={query.error.message}
        onRetry={() => query.refetch()}
      />
    )
  }

  const ledger = query.data?.ledger ?? []

  const renderAmount = (amount: number) => (
    <Typography.Text type={amount < 0 ? 'danger' : 'success'} strong>
      {amount > 0 ? `+${amount}` : amount}
    </Typography.Text>
  )
  const renderReason = (entry: PointsLedgerEntry) => (
    <Tag color={POINTS_REASON_COLORS[entry.reason]} style={{ marginInlineEnd: 0 }}>
      {POINTS_REASON_LABELS[entry.reason] ?? entry.reason}
    </Tag>
  )
  // رابط الطلب لمن يملك «الطلبات» فقط — غيره يرى الرقم نصّاً لا صفحة رفض.
  const renderReference = (entry: PointsLedgerEntry) => {
    if (!entry.orderId) return entry.reviewId ? 'تقييم' : '—'
    const label = entry.orderNumber ? `#${entry.orderNumber}` : 'طلب'
    return canOpenOrders ? <Link to={`/orders/${entry.orderId}`}>{label}</Link> : label
  }

  const columns = [
    {
      title: 'التاريخ',
      key: 'createdAt',
      width: 180,
      render: (_: unknown, entry: PointsLedgerEntry) => (
        <span style={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.createdAt)}</span>
      ),
    },
    { title: 'الحركة', dataIndex: 'label', key: 'label', width: 180 },
    { title: 'السبب', key: 'reason', width: 130, render: (_: unknown, entry: PointsLedgerEntry) => renderReason(entry) },
    { title: 'النقاط', key: 'amount', width: 90, render: (_: unknown, entry: PointsLedgerEntry) => renderAmount(entry.amount) },
    {
      title: 'الرصيد بعدها',
      key: 'balanceAfter',
      width: 110,
      render: (_: unknown, entry: PointsLedgerEntry) => <Typography.Text strong>{entry.balanceAfter}</Typography.Text>,
    },
    { title: 'المرجع', key: 'reference', width: 100, render: (_: unknown, entry: PointsLedgerEntry) => renderReference(entry) },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Statistic title="الرصيد الحالي" value={query.data?.balance ?? '—'} loading={query.isPending} />
      <ResponsiveTable<PointsLedgerEntry>
        rowKey="id"
        size="small"
        // داخل نافذةٍ أو بطاقة: الرأس اللاصق تحت شريط اللوحة لا معنى له هنا.
        sticky={false}
        loading={query.isPending}
        dataSource={ledger}
        columns={columns}
        pagination={ledger.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
        locale={{ emptyText: <EmptyState description="لا حركات نقاط لهذا الزبون بعد." /> }}
        renderCard={(entry) => (
          <Flex vertical gap={6}>
            <Flex justify="space-between" align="center" gap={8} wrap>
              <Typography.Text strong>{entry.label}</Typography.Text>
              {renderAmount(entry.amount)}
            </Flex>
            <Flex gap={8} align="center" wrap>
              {renderReason(entry)}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {formatDateTime(entry.createdAt)} · الرصيد بعدها {entry.balanceAfter}
              </Typography.Text>
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              المرجع: {renderReference(entry)}
            </Typography.Text>
          </Flex>
        )}
      />
    </Space>
  )
}
