import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Card,
  Flex,
  Space,
  Table,
  Tabs,
  Typography,
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { listOrders } from '../api/ordersApi'
import type { OrderStatus } from '../types/orders'
import {
  ORDER_STATUSES,
  STATUS_LABELS,
  isOrderStatus,
} from '../constants/orders'
import { formatCurrency, formatDateTime } from '../utils/format'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'

const PAGE_LIMIT = 12

function readPage(value: string | null): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

export default function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const statusParam = searchParams.get('status')
  const status = isOrderStatus(statusParam) ? statusParam : undefined
  const page = readPage(searchParams.get('page'))

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
    const next = new URLSearchParams(searchParams)
    next.set('page', String(nextPage))
    setSearchParams(next)
  }

  const tabs = [
    { key: 'all', label: `الكل (${totalCount})` },
    ...ORDER_STATUSES.map((orderStatus) => ({
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
      width: 100,
      render: (_: unknown, order: { id: string }) => (
        <Link to={`/orders/${order.id}`}>عرض</Link>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            الطلبات
          </Typography.Title>
          <Typography.Text type="secondary">
            إدارة طلبات المتجر: مراجعتها، تغيير حالتها، وتتبع مراحل التوصيل.
          </Typography.Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={ordersQuery.isFetching}
          onClick={() => ordersQuery.refetch()}
        >
          تحديث
        </Button>
      </Flex>

      <Card>
        <Tabs
          activeKey={status ?? 'all'}
          items={tabs}
          onChange={(key) => selectStatus(key === 'all' ? undefined : (key as OrderStatus))}
          tabBarStyle={{ marginBottom: 16 }}
        />

        {ordersQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message="تعذر تحميل الطلبات"
            description={ordersQuery.error.message}
            action={
              <Button size="small" onClick={() => ordersQuery.refetch()}>
                إعادة المحاولة
              </Button>
            }
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