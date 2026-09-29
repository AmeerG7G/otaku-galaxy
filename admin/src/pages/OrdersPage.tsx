import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  Space,
  Table,
  Tabs,
  Typography,
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { listOrders } from '../api/ordersApi'
import type { OrderStatus } from '../types/orders'
import {
  ORDER_STAGES,
  STATUS_LABELS,
  isOrderStatus,
} from '../constants/orders'
import { formatCurrency, formatDateTime } from '../utils/format'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { WhatsAppButton } from '../components/ui/WhatsAppButton'
import { ErrorState } from '../components/ui/States'
import { useTableState } from '../hooks/useTableState'

const PAGE_LIMIT = 12

export default function OrdersPage() {
  const { page, setPage, searchParams, setSearchParams } = useTableState()

  const statusParam = searchParams.get('status')
  const status = isOrderStatus(statusParam) ? statusParam : undefined

  const ordersQuery = useQuery({
    queryKey: ['orders', { status: status ?? 'all', page }],
    queryFn: () => listOrders({ status, page, limit: PAGE_LIMIT }),
  })

  const statusCounts = ordersQuery.data?.statusCounts
  const totalCount = useMemo(() => {
    if (!statusCounts) return 0
    return Object.values(statusCounts).reduce((sum, count) => sum + count, 0)
  }, [statusCounts])

  function selectStatus(nextStatus?: OrderStatus) {
    if (nextStatus) {
      setSearchParams({ status: nextStatus })
    } else {
      setSearchParams({})
    }
  }

  function changePage(nextPage: number) {
    setPage(nextPage)
  }

  // التبويبات تتبع مراحل الطلب الفعلية. «تم تأكيده» و«قيد التجهيز» لا
  // تظهران إلا إن بقي فيهما طلبٌ قديم فعلاً — تبويبٌ دائم بصفر يوحي بمرحلة
  // لم تعد موجودة.
  const legacyConfirmed = statusCounts?.CONFIRMED ?? 0
  const legacyPreparing = statusCounts?.PREPARING ?? 0
  const tabStatuses: OrderStatus[] = [
    ...ORDER_STAGES,
    ...(legacyConfirmed > 0 ? (['CONFIRMED'] as OrderStatus[]) : []),
    ...(legacyPreparing > 0 ? (['PREPARING'] as OrderStatus[]) : []),
    'REJECTED',
  ]
  const tabs = [
    { key: 'all', label: `الكل (${totalCount})` },
    ...tabStatuses.map((orderStatus) => ({
      key: orderStatus,
      label: `${STATUS_LABELS[orderStatus]} (${statusCounts?.[orderStatus] ?? 0})`,
    })),
  ]

  const columns = [
    {
      title: 'رقم الطلب',
      dataIndex: 'number',
      key: 'number',
      width: 120,
      render: (value: string) => <Typography.Text strong>#{value}</Typography.Text>,
    },
    {
      title: 'الزبون',
      key: 'customer',
      render: (_: unknown, order: { customer: { name: string } | null }) =>
        order.customer?.name ?? 'غير متوفر',
    },
    {
      title: 'الهاتف',
      key: 'customerPhone',
      render: (_: unknown, order: { customer: { phone: string } | null }) =>
        order.customer?.phone ?? 'غير متوفر',
    },
    {
      title: 'المحافظة',
      dataIndex: 'province',
      key: 'province',
    },
    {
      title: 'المنتجات',
      key: 'itemsCount',
      render: (_: unknown, order: { items: unknown[] }) =>
        `${order.items.length} منتجات`,
    },
    {
      title: 'الإجمالي',
      dataIndex: 'total',
      key: 'total',
      render: (value: number) => <Typography.Text strong>{formatCurrency(value)}</Typography.Text>,
    },
    {
      title: 'الحالة',
      dataIndex: 'status',
      key: 'status',
      render: (value: OrderStatus) => <StatusBadge status={value} />,
    },
    {
      title: 'التاريخ',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'الإجراءات',
      key: 'actions',
      width: 170,
      render: (_: unknown, order: { id: string; phone: string; customer: { phone: string } | null }) => (
        <Space size={8}>
          <Link to={`/orders/${order.id}`}>عرض</Link>
          {/* زبون الطلب: رقم حسابه، أو رقم التواصل في الطلب لحسابٍ حُذف. */}
          <WhatsAppButton phone={order.customer?.phone ?? order.phone} />
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="الطلبات"
        description="إدارة طلبات المتجر: مراجعتها، تغيير حالتها، وتتبع مراحل التوصيل."
        extra={
          <Button
            icon={<ReloadOutlined />}
            loading={ordersQuery.isFetching}
            onClick={() => ordersQuery.refetch()}
          >
            تحديث
          </Button>
        }
      />

      <Card>
        <Tabs
          activeKey={status ?? 'all'}
          items={tabs}
          onChange={(key) => selectStatus(key === 'all' ? undefined : (key as OrderStatus))}
          tabBarStyle={{ marginBottom: 16 }}
        />

        {ordersQuery.isError ? (
          <ErrorState
            message="تعذر تحميل الطلبات"
            description={ordersQuery.error.message}
            onRetry={() => ordersQuery.refetch()}
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={ordersQuery.data?.items ?? []}
            loading={ordersQuery.isPending || ordersQuery.isFetching}
            scroll={{ x: 1100 }}
            locale={{
              emptyText: (
                <EmptyState
                  description="لا توجد طلبات في هذه القائمة"
                  actionLabel="إعادة المحاولة"
                  onAction={() => ordersQuery.refetch()}
                />
              ),
            }}
            pagination={{
              current: page,
              pageSize: PAGE_LIMIT,
              total: ordersQuery.data?.total ?? 0,
              showSizeChanger: false,
              showTotal: (total) => `إجمالي الطلبات: ${total}`,
              onChange: changePage,
            }}
          />
        )}
      </Card>
    </Space>
  )
}