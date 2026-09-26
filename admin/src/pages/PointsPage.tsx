import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Card,
  Col,
  Modal,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import { formatDateTime } from '../utils/format'
import { POINTS_REASON_COLORS, POINTS_REASON_LABELS } from '../constants/points'
import EmptyState from '../components/EmptyState'
import GalaxyRulesCard from '../components/GalaxyRulesCard'
import GiftClaimsCard from '../components/GiftClaimsCard'
import { PageHeader } from '../components/ui/PageHeader'
import { getCustomerPoints, getPointsSummary } from '../api/pointsApi'
import type {
  PointsByReason,
  PointsReason,
  PointsLedgerEntry,
  PointsTopBalance,
} from '../types/points'

/** تسميات أسباب المنح — للعرض فقط، لا يُبنى عليها منطق. */

/**
 * نقاط المجرّة — القواعد والسلّم والدفتر للقراءة، وتسليم الهدايا للتنفيذ.
 *
 * كل رقم هنا مشتقّ من `points_ledger` نفسه الذي يقرأه التطبيق؛ لا رصيد
 * مخزَّن ولا جدول تجميع يمكن أن يتباعد عن الحقيقة.
 *
 * لا يوجد تعديل يدوي عمداً: كل حركة في الدفتر تقابل حدثاً حقيقياً (استلام
 * طلب، اعتماد تقييم) ويحميها فهرس فريد من التكرار. منحٌ يدوي بلا حدث يكسر
 * ذلك الضمان ويجعل الرصيد غير قابل للتفسير.
 *
 * [NOTE] حُذفت من هنا بطاقتان: «سلّم المستويات» (إنشاء/تعديل/حذف) و«إعدادات
 * النقاط والتقييم». القواعد صارت ثابتة في الخادم، وما بقي من إعدادات قابلة
 * للضبط فعلاً انتقل إلى صفحة «الإعدادات».
 */
export default function PointsPage() {
  const [selected, setSelected] = useState<PointsTopBalance | null>(null)

  const summary = useQuery({
    queryKey: ['admin-points-summary'],
    queryFn: getPointsSummary,
  })

  const detail = useQuery({
    queryKey: ['admin-customer-points', selected?.userId],
    queryFn: () => getCustomerPoints(selected!.userId),
    enabled: Boolean(selected),
  })

  const topColumns = [
    {
      title: 'العميل',
      key: 'customer',
      render: (_: unknown, row: PointsTopBalance) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{row.username}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.phone}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'الرصيد',
      dataIndex: 'balance',
      key: 'balance',
      render: (value: number) => <Typography.Text strong>{value}</Typography.Text>,
    },
    { title: 'عدد الحركات', dataIndex: 'entries', key: 'entries' },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, row: PointsTopBalance) => (
        <Typography.Link onClick={() => setSelected(row)}>عرض الدفتر</Typography.Link>
      ),
    },
  ]

  const reasonColumns = [
    {
      title: 'السبب',
      dataIndex: 'reason',
      key: 'reason',
      render: (reason: PointsReason) => (
        <Tag color={POINTS_REASON_COLORS[reason]}>{POINTS_REASON_LABELS[reason] ?? reason}</Tag>
      ),
    },
    { title: 'عدد الحركات', dataIndex: 'entries', key: 'entries' },
    { title: 'مجموع النقاط', dataIndex: 'total', key: 'total' },
  ]

  const ledgerColumns = [
    {
      title: 'الحركة',
      dataIndex: 'label',
      key: 'label',
    },
    {
      title: 'السبب',
      dataIndex: 'reason',
      key: 'reason',
      render: (reason: PointsReason) => (
        <Tag color={POINTS_REASON_COLORS[reason]}>{POINTS_REASON_LABELS[reason] ?? reason}</Tag>
      ),
    },
    {
      title: 'النقاط',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => (
        <Typography.Text type={amount < 0 ? 'danger' : 'success'} strong>
          {amount > 0 ? `+${amount}` : amount}
        </Typography.Text>
      ),
    },
    {
      title: 'التاريخ',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDateTime(value),
    },
  ]

  const data = summary.data

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <PageHeader
        title="نقاط المجرّة"
        description="القواعد والسلّم والدفتر — كلها للقراءة. ما يُدار هنا هو تسليم الهدايا."
      />

      <GalaxyRulesCard />

      <GiftClaimsCard />

      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="النقاط المتداولة" value={data?.totalInCirculation ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="مجموع الممنوح" value={data?.totalAwarded ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="مجموع المسحوب" value={data?.totalRevoked ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="عملاء لديهم نقاط" value={data?.customersWithPoints ?? 0} />
          </Card>
        </Col>
      </Row>

      <Card title="توزيع النقاط على الأسباب" loading={summary.isPending}>
        {data && data.byReason.length === 0 ? (
          <EmptyState description="لم تُمنح أي نقاط بعد." />
        ) : (
          <Table
            rowKey="reason"
            size="small"
            pagination={false}
            columns={reasonColumns}
            dataSource={(data?.byReason ?? []) as PointsByReason[]}
          />
        )}
      </Card>

      <Card title="أعلى الأرصدة" loading={summary.isPending}>
        {data && data.topBalances.length === 0 ? (
          <EmptyState description="لا يوجد عميل برصيد نقاط بعد." />
        ) : (
          <Table
            rowKey="userId"
            size="small"
            scroll={{ x: 560 }}
            pagination={false}
            columns={topColumns}
            dataSource={data?.topBalances ?? []}
          />
        )}
      </Card>

      <Modal
        open={Boolean(selected)}
        onCancel={() => setSelected(null)}
        footer={null}
        width={720}
        title={
          selected ? `دفتر نقاط — ${selected.username} (${selected.phone})` : 'دفتر النقاط'
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Statistic title="الرصيد الحالي" value={detail.data?.balance ?? 0} />
          <Table
            rowKey="id"
            size="small"
            loading={detail.isPending}
            columns={ledgerColumns}
            dataSource={(detail.data?.ledger ?? []) as PointsLedgerEntry[]}
            scroll={{ x: 520 }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
          />
        </Space>
      </Modal>
    </Space>
  )
}
