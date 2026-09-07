import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, App, Button, Card, Col, Empty, Row, Space, Table, Tag, Typography } from 'antd'
import {
  AppstoreOutlined,
  BellOutlined,
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
  GiftOutlined,
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
import { PageHeader } from '../components/ui/PageHeader'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatCard } from '../components/ui/StatCard'
import { MediaThumb } from '../components/ui/MediaThumb'

function KpiCard({
  title,
  value,
  loading,
  tooltip,
  tone,
  to,
  icon,
}: {
  title: string
  value: number | string
  loading?: boolean
  tooltip?: string
  tone?: 'brand' | 'secondary' | 'cyan' | 'amber' | 'success' | 'error' | 'info'
  to?: string
  icon: ReactNode
}) {
  const card = (
    <StatCard title={title} value={loading ? '…' : value} icon={icon} tone={tone} hint={tooltip} />
  )
  return to ? <Link to={to}>{card}</Link> : card
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
  const pending = byStatus?.PENDING_ADMIN_CONFIRMATION ?? 0

  const recentColumns = [
    {
      title: 'رقم الطلب',
      dataIndex: 'number',
      key: 'number',
      render: (value: string, order: { id: string }) => (
        <Link to={`/orders/${order.id}`}>
          <Typography.Text strong>#{value}</Typography.Text>
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
      width: 60,
      render: (_: unknown, product: { imageUrl: string | null }) => (
        <MediaThumb reference={product.imageUrl} size={40} radius={6} />
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
      width: 80,
      render: (value: number) =>
        value === 0 ? <Tag color="error">نفدت</Tag> : <Tag color="warning">{value}</Tag>,
    },
  ]

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <PageHeader
        title="نظرة عامة على المتجر"
        description="أرقام حقيقية مباشرة من قاعدة البيانات — لا تقديرات."
        extra={
          <Button icon={<ReloadOutlined />} loading={anyLoading} onClick={reloadAll}>
            تحديث الكل
          </Button>
        }
      />

      {anyError && (
        <Alert
          type="warning"
          showIcon
          message="تعذر تحميل جزء من البيانات."
          description="أعد المحاولة من زر «تحديث الكل»."
        />
      )}

      <div>
        <SectionHeader title="ما يحتاج تدخّلاً الآن" description="طلبات وتقييمات ومخزون بانتظار قرارك." />
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8} xl={4}>
            <KpiCard
              title="طلبات بانتظار الموافقة"
              value={pending}
              icon={<ClockCircleOutlined />}
              tone={pending > 0 ? 'amber' : 'brand'}
              tooltip="تحتاج قبولاً أو رفضاً."
              to="/orders"
            />
          </Col>
          <Col xs={24} sm={12} md={8} xl={4}>
            <KpiCard
              title="قيد التوصيل"
              value={byStatus?.OUT_FOR_DELIVERY ?? 0}
              icon={<CarOutlined />}
              tone="info"
              to="/orders?status=OUT_FOR_DELIVERY"
            />
          </Col>
          <Col xs={24} sm={12} md={8} xl={4}>
            <KpiCard
              title="تقييمات بانتظار المراجعة"
              value={stats?.reviews.pending ?? 0}
              icon={<StarOutlined />}
              tone={(stats?.reviews.pending ?? 0) > 0 ? 'amber' : 'brand'}
              tooltip="لا تظهر في التطبيق قبل نشرها."
              to="/reviews"
            />
          </Col>
          <Col xs={24} sm={12} md={8} xl={4}>
            <KpiCard
              title="نفد المخزون"
              value={stats?.products.outOfStock ?? 0}
              icon={<WarningOutlined />}
              tone={(stats?.products.outOfStock ?? 0) > 0 ? 'error' : 'brand'}
              tooltip={`منتجات نشطة مخزونها صفر. قاربت النفاد: ${stats?.products.lowStock ?? 0}.`}
              to="/products"
            />
          </Col>
          <Col xs={24} sm={12} md={8} xl={4}>
            <KpiCard
              title="أعياد ميلاد اليوم"
              value={stats?.birthdays.today ?? 0}
              icon={<GiftOutlined />}
              tone={(stats?.birthdays.today ?? 0) > 0 ? 'secondary' : 'brand'}
              tooltip="محسوبة بتوقيت المتجر. التهنئة تُرسَل يدوياً — لا جدولة تلقائية."
              to="/birthdays"
            />
          </Col>
        </Row>
      </div>

      <div>
        <SectionHeader
          title="الإيرادات"
          description="من الطلبات الفعلية — الإيراد يحسب عند التسليم."
        />
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8}>
            <KpiCard
              title="إيراد الطلبات المكتملة"
              value={formatCurrency(stats?.revenue.completed ?? 0)}
              icon={<DollarOutlined />}
              tone="success"
              tooltip="مجموع الطلبات التي استلمها العملاء فعلاً."
            />
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <KpiCard
              title="إيراد هذا الشهر"
              value={formatCurrency(stats?.revenue.completedThisMonth ?? 0)}
              icon={<DollarOutlined />}
              tone="brand"
              tooltip="الطلبات المكتملة منذ بداية الشهر الحالي."
            />
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <KpiCard
              title="قيمة الطلبات الجارية"
              value={formatCurrency(stats?.revenue.inProgress ?? 0)}
              icon={<ShoppingCartOutlined />}
              tone="info"
              tooltip="طلبات لم تكتمل ولم تُرفض بعد."
            />
          </Col>
        </Row>
      </div>

      <div>
        <SectionHeader
          title="نشاط الزبائن والتواصل"
          description="جمهور اليوم وقنوات التواصل الداخلية."
        />
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <KpiCard
              title="أعياد خلال ٧ أيام"
              value={stats?.birthdays.upcoming7 ?? 0}
              icon={<GiftOutlined />}
              tone="info"
              to="/birthdays"
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <KpiCard
              title="لم يسجّلوا ميلادهم"
              value={stats?.birthdays.missing ?? 0}
              icon={<TeamOutlined />}
              tone="brand"
              tooltip="جمهور رسالة «أكمل تاريخ ميلادك»."
              to="/birthdays"
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <KpiCard
              title="إشعارات آخر ٧ أيام"
              value={stats?.notifications.last7Days ?? 0}
              icon={<BellOutlined />}
              tone="cyan"
              tooltip="سجلات داخل التطبيق — لا إشعارات دفع."
              to="/notifications"
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <KpiCard
              title="المنتجات النشطة"
              value={stats?.products.active ?? 0}
              icon={<AppstoreOutlined />}
              tone="cyan"
              tooltip={`الإجمالي بما فيها المعطّلة: ${stats?.products.total ?? 0}.`}
              to="/products"
            />
          </Col>
        </Row>
      </div>

      <div>
        <SectionHeader title="أرقام عامة" description="حصيلة الطلبات والزبائن." />
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <KpiCard
              title="إجمالي الطلبات"
              value={stats?.orders.total ?? 0}
              icon={<ShoppingCartOutlined />}
              tone="brand"
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <KpiCard
              title="طلبات مكتملة"
              value={byStatus?.COMPLETED ?? 0}
              icon={<CheckCircleOutlined />}
              tone="success"
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <KpiCard
              title="طلبات مرفوضة"
              value={byStatus?.REJECTED ?? 0}
              icon={<CloseCircleOutlined />}
              tone="error"
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <KpiCard
              title="الزبائن"
              value={stats?.customers.total ?? 0}
              icon={<TeamOutlined />}
              tone="cyan"
            />
          </Col>
        </Row>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card
            title="أحدث الطلبات"
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