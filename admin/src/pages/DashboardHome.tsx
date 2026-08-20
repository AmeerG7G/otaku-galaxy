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
  EnvironmentOutlined,
  FireOutlined,
  PictureOutlined,
  ReloadOutlined,
  ShoppingCartOutlined,
  TagsOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { listOrders } from '../api/ordersApi'
import { fetchAllProducts, listProducts } from '../api/productsApi'
import { listAdminCategories } from '../api/categoriesApi'
import { listAdminBanners } from '../api/bannersApi'
import { listAdminGovernorates } from '../api/governoratesApi'
import { listCustomers } from '../api/customersApi'
import { get } from '../api/client'
import { ORDER_STATUSES } from '../constants/orders'
import type { OrderStatus } from '../types/orders'
import type { Product } from '../types/products'
import StatusBadge from '../components/StatusBadge'
import { formatCurrency, formatDateTime } from '../utils/format'

const NO_IMAGE_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#f5f5f5"/><text x="32" y="36" font-size="12" text-anchor="middle" fill="#aaa">لا صورة</text></svg>',
  )

const LOW_STOCK_THRESHOLD = 5

interface PublicFilterTotals {
  total: number
}

function fetchPublicTotal(
  filter: 'offer' | 'selected',
): Promise<PublicFilterTotals> {
  return get<PublicFilterTotals>('/catalog/products', {
    params: {
      offer: filter === 'offer' ? 'true' : undefined,
      selected: filter === 'selected' ? 'true' : undefined,
      page: 1,
      limit: 50,
    },
  })
}

function KpiCard({
  title,
  value,
  prefix,
  loading,
  tooltip,
}: {
  title: string
  value: number
  prefix: ReactNode
  loading?: boolean
  tooltip?: string
}) {
  const card = (
    <Card variant="outlined" size="small" loading={loading}>
      <Statistic title={title} value={value} prefix={prefix} />
    </Card>
  )
  return tooltip ? <Tooltip title={tooltip}>{card}</Tooltip> : card
}

export default function DashboardHome() {
  const { message } = App.useApp()

  const ordersQuery = useQuery({
    queryKey: ['dashboard-orders'],
    queryFn: () => listOrders({ page: 1, limit: 5 }),
  })

  const productsQuery = useQuery({
    queryKey: ['dashboard-products'],
    queryFn: () => listProducts({ page: 1, limit: 50 }),
  })

  const allProductsQuery = useQuery({
    queryKey: ['dashboard-all-products'],
    queryFn: () => fetchAllProducts(),
  })

  const customersQuery = useQuery({
    queryKey: ['dashboard-customers'],
    queryFn: () => listCustomers({ page: 1, limit: 1 }),
  })

  const categoriesQuery = useQuery({
    queryKey: ['dashboard-categories'],
    queryFn: listAdminCategories,
  })

  const bannersQuery = useQuery({
    queryKey: ['dashboard-banners'],
    queryFn: listAdminBanners,
  })

  const governoratesQuery = useQuery({
    queryKey: ['dashboard-governorates'],
    queryFn: listAdminGovernorates,
  })

  const offersQuery = useQuery({
    queryKey: ['dashboard-offers'],
    queryFn: () => fetchPublicTotal('offer'),
  })

  const selectedQuery = useQuery({
    queryKey: ['dashboard-selected'],
    queryFn: () => fetchPublicTotal('selected'),
  })

  const overviewQueries = [
    ordersQuery,
    productsQuery,
    allProductsQuery,
    customersQuery,
    categoriesQuery,
    bannersQuery,
    governoratesQuery,
    offersQuery,
    selectedQuery,
  ]

  const anyLoading = overviewQueries.some((query) => query.isFetching)
  const anyError = overviewQueries.some((query) => query.isError)

  async function reloadAll() {
    message.info('جارٍ تحديث بيانات لوحة التحكم…')
    await Promise.all(overviewQueries.map((query) => query.refetch()))
    message.success('تم تحديث البيانات')
  }

  const ordersTotal = ordersQuery.data?.total ?? 0
  const statusCounts = ordersQuery.data?.statusCounts

  const productsTotal = productsQuery.data?.total ?? 0
  const allProducts = allProductsQuery.data ?? []
  const lowStock = allProducts
    .filter((product) => product.stock <= LOW_STOCK_THRESHOLD && product.isActive)
    .sort((a, b) => a.stock - b.stock)
  const lowStockCount = lowStock.length
  const outOfStockCount = lowStock.filter((product) => product.stock === 0).length

  const recentOrders = ordersQuery.data?.items ?? []

  const offersTotal = offersQuery.data?.total ?? 0
  const selectedTotal = selectedQuery.data?.total ?? 0
  const offersTooltip = `المنتجات النشطة المرتبة كعرض أو مختارة في المتجر (عروض: ${offersTotal}، مختارة: ${selectedTotal}).`

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
      render: (_: unknown, product: Product) => (
        <Image
          src={product.images[0] ?? NO_IMAGE_PLACEHOLDER}
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
      render: (value: string, product: Product) => (
        <Tooltip title={product.isActive ? undefined : 'غير نشط'}>
          <Typography.Text strong>{value}</Typography.Text>
          {!product.isActive && <Tag color="default" style={{ marginInlineEnd: 0 }}>غير نشط</Tag>}
        </Tooltip>
      ),
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
        value === 0 ? (
          <Tag color="red">نفدت الكمية</Tag>
        ) : (
          <Tag color="orange">{value}</Tag>
        ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            نظرة عامة على المتجر
          </Typography.Title>
          <Typography.Text type="secondary">
            إحصاءات حقيقية مباشرة من بيانات الخادم.
          </Typography.Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={anyLoading}
          onClick={reloadAll}
        >
          تحديث الكل
        </Button>
      </Flex>

      {anyError && (
        <Alert
          type="warning"
          showIcon
          message="تعذر تحميل جزء من البيانات."
          description="تظهر بعض الأرقام «—» لأن طلبها فشل. أعد المحاولة من زر «تحديث الكل»."
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={8} lg={6}>
          <KpiCard
            title="الطلبات"
            value={ordersTotal}
            prefix={<ShoppingCartOutlined />}
            loading={ordersQuery.isFetching}
            tooltip="إجمالي الطلبات المسجلة في المتجر."
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <KpiCard
            title="المنتجات"
            value={productsTotal}
            prefix={<AppstoreOutlined />}
            loading={productsQuery.isFetching}
            tooltip="إجمالي المنتجات (بما فيها المعطّلة)."
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <KpiCard
            title="نفد/منخفض المخزون"
            value={outOfStockCount}
            prefix={<WarningOutlined />}
            loading={allProductsQuery.isFetching}
            tooltip={`منتجات مخزونها ≤ ${LOW_STOCK_THRESHOLD} (نفدت: ${outOfStockCount}) من إجمالي ${allProducts.length} منتجا تم مسحها.`}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <KpiCard
            title="الزبائن"
            value={customersQuery.data?.total ?? 0}
            prefix={<TeamOutlined />}
            loading={customersQuery.isFetching}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <KpiCard
            title="الأقسام"
            value={categoriesQuery.data?.items.length ?? 0}
            prefix={<TagsOutlined />}
            loading={categoriesQuery.isFetching}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <KpiCard
            title="البنرات"
            value={bannersQuery.data?.items.length ?? 0}
            prefix={<PictureOutlined />}
            loading={bannersQuery.isFetching}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <KpiCard
            title="المحافظات النشطة"
            value={governoratesQuery.data?.items.length ?? 0}
            prefix={<EnvironmentOutlined />}
            loading={governoratesQuery.isFetching}
            tooltip="المحافظات النشطة فقط — لا يوفر الخادم عرض المحافظات الموقوفة."
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <KpiCard
            title="عروض/مختارة نشطة"
            value={offersTotal + selectedTotal}
            prefix={<FireOutlined />}
            loading={offersQuery.isFetching || selectedQuery.isFetching}
            tooltip={offersTooltip}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card
            title="أحدث الطلبات"
            variant="outlined"
            extra={
              <Link to="/orders">عرض الكل</Link>
            }
            loading={ordersQuery.isPending}
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
            title={`منخفض / منعدم المخزون (${lowStockCount})`}
            variant="outlined"
            extra={
              <Link to="/products">المنتجات</Link>
            }
            loading={allProductsQuery.isPending}
          >
            {lowStock.length === 0 ? (
              <Empty description="لا توجد منتجات قاربت النفاد" />
            ) : (
              <Table
                rowKey="id"
                columns={lowStockColumns}
                dataSource={lowStock.slice(0, 6)}
                pagination={false}
                size="small"
                scroll={{ x: 460 }}
              />
            )}
          </Card>
        </Col>
      </Row>

      {statusCounts && (
        <Card title="توزيع الطلبات حسب الحالة" variant="outlined" size="small">
          <Flex wrap gap={8}>
            {ORDER_STATUSES.map((status) => (
              <Space key={status} size={4}>
                <StatusBadge status={status} />
                <Typography.Text strong>{statusCounts[status]}</Typography.Text>
              </Space>
            ))}
          </Flex>
        </Card>
      )}
    </Space>
  )
}