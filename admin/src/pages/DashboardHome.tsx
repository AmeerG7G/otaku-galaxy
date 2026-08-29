import { resolveMediaUrl } from '../utils/media'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Image,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  AppstoreOutlined,
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
  ReloadOutlined,
  ShoppingCartOutlined,
  StarOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { listOrders } from '../api/ordersApi'
import { fetchDashboardStats } from '../api/communityApi'
import type { OrderStatus } from '../types/orders'
import StatusBadge from '../components/StatusBadge'
import { formatCurrency, formatDateTime } from '../utils/format'

const NO_IMAGE_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#f5f5f5"/><text x="32" y="36" font-size="12" text-anchor="middle" fill="#aaa">لا صورة</text></svg>',
  )

function KpiCard({
  title,
  value,
  prefix,
  loading,
  tooltip,
  suffix,
  valueStyle,
  to,
}: {
  title: string
  value: number | string
  prefix: ReactNode
  loading?: boolean
  tooltip?: string
  suffix?: string
  valueStyle?: React.CSSProperties
  to?: string
}) {
  const card = (
    <Card variant="outlined" size="small" loading={loading} hoverable={Boolean(to)}>
      <Statistic
        title={title}
        value={value}
        prefix={prefix}
        suffix={suffix}
        valueStyle={valueStyle}
      />
    </Card>
  )
  const linked = to ? <Link to={to}>{card}</Link> : card
  return tooltip ? <Tooltip title={tooltip}>{linked}</Tooltip> : linked
}

/**
 * أرقام العمليات اليومية للمتجر. كل الأرقام تأتي مجمَّعة من الخادم في
 * استعلام واحد (/admin/stats) بدل جلب كل الطلبات والمنتجات وعدّها هنا.
 */
export default function DashboardHome() {
  const { message } = App.useApp()

  const statsQuery = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  })

  const recentOrdersQuery = useQuery({
    queryKey: ['dashboard-recent-orders'],
    queryFn: () => listOrders({ page: 1, limit: 6 }),
  })

  const anyLoading = statsQuery.isFetching || recentOrdersQuery.isFetching
  const anyError = statsQuery.isError || recentOrdersQuery.isError

  async function reloadAll() {
    await Promise.all([statsQuery.refetch(), recentOrdersQuery.refetch()])
    message.success('تم تحديث البيانات')
  }

  const stats = statsQuery.data
  const byStatus = stats?.orders.byStatus
  const recentOrders = recentOrdersQuery.data?.items ?? []

  const recentColumns = [
    {
      title: 'رقم الطلب',
      dataIndex: 'number',
      key: 'number',
      render: (value: string, order: { id: string }) => (
        <Link to={`/orders/${order.id}`}>
          <Typography.Text strong>{value}</Typography.Text>
        </Link>
      ),
    },
    {
      title: 'الحالة',
      dataIndex: 'status',
      key: 'status',
      render: (value: OrderStatus) => <StatusBadge status={value} />,
    },
    {
      title: 'الزبون',
      key: 'customer',
      render: (_: unknown, order: { customer: { name: string } | null }) =>
        order.customer?.name ?? '—',
    },
    {
      title: 'الإجمالي',
      dataIndex: 'total',
      key: 'total',
      render: (value: number) => formatCurrency(value),
    },
    {
      title: 'التاريخ',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDateTime(value),
    },
  ]

  const lowStockColumns = [
    {
      title: '',
      key: 'image',
      width: 56,
      render: (_: unknown, product: { imageUrl: string | null }) => (
        <Image
          src={resolveMediaUrl(product.imageUrl) ?? NO_IMAGE_PLACEHOLDER}
          width={40}
          height={40}
          style={{ objectFit: 'cover', borderRadius: 4 }}
          preview={false}
          fallback={NO_IMAGE_PLACEHOLDER}
        />
      ),
    },
    {
      title: 'المنتج',
      dataIndex: 'name',
      key: 'name',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      title: 'السعر',
      dataIndex: 'price',
      key: 'price',
      render: (value: number) => formatCurrency(value),
    },
    {
      title: 'المخزون',
      dataIndex: 'stock',
      key: 'stock',
      render: (value: number) =>
        value === 0 ? <Tag color="red">نفدت</Tag> : <Tag color="orange">{value}</Tag>,
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            نظرة عامة على المتجر
          </Typography.Title>
          <Typography.Text type="secondary">أرقام حقيقية مباشرة من قاعدة البيانات.</Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} loading={anyLoading} onClick={reloadAll}>
          تحديث الكل
        </Button>
      </Flex>

      {anyError && (
        <Alert
          type="warning"
          showIcon
          message="تعذر تحميل جزء من البيانات."
          description="أعد المحاولة من زر «تحديث الكل»."
        />
      )}

      {/* ── ما يحتاج تدخّلاً الآن ── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={8} lg={6}>
          <KpiCard
            title="طلبات بانتظار الموافقة"
            value={byStatus?.PENDING_ADMIN_CONFIRMATION ?? 0}
            prefix={<ClockCircleOutlined />}
            loading={statsQuery.isPending}
            valueStyle={
              (byStatus?.PENDING_ADMIN_CONFIRMATION ?? 0) > 0 ? { color: '#d48806' } : undefined
            }
            tooltip="تحتاج قبولاً أو رفضاً."
            to="/orders"
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <KpiCard
            title="قيد التوصيل"
            value={byStatus?.OUT_FOR_DELIVERY ?? 0}
            prefix={<CarOutlined />}
            loading={statsQuery.isPending}
            to="/orders"
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <KpiCard
            title="تقييمات بانتظار المراجعة"
            value={stats?.reviews.pending ?? 0}
            prefix={<StarOutlined />}
            loading={statsQuery.isPending}
            valueStyle={(stats?.reviews.pending ?? 0) > 0 ? { color: '#d48806' } : undefined}
            tooltip="لا تظهر في التطبيق قبل نشرها."
            to="/reviews"
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <KpiCard
            title="نفد المخزون"
            value={stats?.products.outOfStock ?? 0}
            prefix={<WarningOutlined />}
            loading={statsQuery.isPending}
            valueStyle={(stats?.products.outOfStock ?? 0) > 0 ? { color: '#cf1322' } : undefined}
            tooltip={`منتجات نشطة مخزونها صفر. قاربت النفاد: ${stats?.products.lowStock ?? 0}.`}
            to="/products"
          />
        </Col>
      </Row>

      {/* ── الإيرادات ── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <KpiCard
            title="إيراد الطلبات المكتملة"
            value={formatCurrency(stats?.revenue.completed ?? 0)}
            prefix={<DollarOutlined />}
            loading={statsQuery.isPending}
            tooltip="مجموع الطلبات التي استلمها العملاء فعلاً."
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <KpiCard
            title="إيراد هذا الشهر"
            value={formatCurrency(stats?.revenue.completedThisMonth ?? 0)}
            prefix={<DollarOutlined />}
            loading={statsQuery.isPending}
            tooltip="الطلبات المكتملة منذ بداية الشهر الحالي."
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <KpiCard
            title="قيمة الطلبات الجارية"
            value={formatCurrency(stats?.revenue.inProgress ?? 0)}
            prefix={<ShoppingCartOutlined />}
            loading={statsQuery.isPending}
            tooltip="طلبات لم تكتمل ولم تُرفض بعد."
          />
        </Col>
      </Row>

      {/* ── أرقام عامة ── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <KpiCard
            title="إجمالي الطلبات"
            value={stats?.orders.total ?? 0}
            prefix={<ShoppingCartOutlined />}
            loading={statsQuery.isPending}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <KpiCard
            title="طلبات مكتملة"
            value={byStatus?.COMPLETED ?? 0}
            prefix={<CheckCircleOutlined />}
            loading={statsQuery.isPending}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <KpiCard
            title="طلبات مرفوضة"
            value={byStatus?.REJECTED ?? 0}
            prefix={<CloseCircleOutlined />}
            loading={statsQuery.isPending}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <KpiCard
            title="الزبائن"
            value={stats?.customers.total ?? 0}
            prefix={<TeamOutlined />}
            loading={statsQuery.isPending}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <KpiCard
            title="المنتجات النشطة"
            value={stats?.products.active ?? 0}
            prefix={<AppstoreOutlined />}
            loading={statsQuery.isPending}
            tooltip={`الإجمالي بما فيها المعطّلة: ${stats?.products.total ?? 0}.`}
            to="/products"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card
            title="أحدث الطلبات"
            variant="outlined"
            extra={<Link to="/orders">عرض الكل</Link>}
            loading={recentOrdersQuery.isPending}
          >
            {recentOrders.length === 0 ? (
              <Empty description="لا توجد طلبات بعد" />
            ) : (
              <Table
                rowKey="id"
                columns={recentColumns}
                dataSource={recentOrders}
                pagination={false}
                size="middle"
                scroll={{ x: 600 }}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card
            title={`قارب على النفاد (${stats?.products.lowStock ?? 0})`}
            variant="outlined"
            extra={<Link to="/products">المنتجات</Link>}
            loading={statsQuery.isPending}
          >
            {(stats?.lowStockProducts.length ?? 0) === 0 ? (
              <Empty description="لا توجد منتجات قاربت النفاد" />
            ) : (
              <Table
                rowKey="id"
                columns={lowStockColumns}
                dataSource={stats?.lowStockProducts ?? []}
                pagination={false}
                size="small"
                scroll={{ x: 460 }}
              />
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  )
}
