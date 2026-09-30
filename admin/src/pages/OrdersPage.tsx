import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  Flex,
  Space,
  Tabs,
  Typography,
} from 'antd'
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import { listOrders } from '../api/ordersApi'
import type { AdminOrder, OrderStatus } from '../types/orders'
import {
  ORDER_STAGES,
  STATUS_LABELS,
  isOrderStatus,
} from '../constants/orders'
import { formatCurrency, formatDateTime, productCountLabel } from '../utils/format'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { PhoneText } from '../components/ui/PhoneText'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
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

  /** الإجراءات نفسها في صفّ الجدول وبطاقة الهاتف. */
  function renderActions(order: AdminOrder, block = false) {
    return (
      <Flex gap={8} align="center" wrap>
        <Link to={`/orders/${order.id}`}>
          <Button size="small" type={block ? 'primary' : 'link'} icon={<EyeOutlined />}>
            عرض
          </Button>
        </Link>
        {/* زبون الطلب: رقم حسابه، أو رقم التواصل في الطلب لحسابٍ حُذف. */}
        <WhatsAppButton phone={order.customer?.phone ?? order.phone} />
      </Flex>
    )
  }

  const renderPhone = (order: AdminOrder) => (
    <PhoneText phone={order.customer?.phone ?? order.phone ?? 'غير متوفر'} />
  )

  // [CRITICAL] كل عمودٍ بعرضٍ صريح: مجموعها عرضُ الجدول الطبيعي، ودونه يتمرّر
  // الجدول أفقياً بشريطٍ لاصق (`ResponsiveTable`). رقم الطلب يبقى ظاهراً في
  // البداية والإجراءات في النهاية مهما مُرِّر — كانت «الحالة» و«التاريخ»
  // و«الإجراءات» خارج الشاشة على يسار الجدول بلا شريطٍ يصلها.
  const columns = [
    {
      title: 'رقم الطلب',
      dataIndex: 'number',
      key: 'number',
      width: 110,
      fixed: 'start' as const,
      render: (value: string) => <Typography.Text strong>#{value}</Typography.Text>,
    },
    {
      title: 'الزبون',
      key: 'customer',
      width: 220,
      render: (_: unknown, order: AdminOrder) => order.customer?.name ?? 'غير متوفر',
    },
    {
      title: 'الهاتف',
      key: 'customerPhone',
      width: 160,
      render: (_: unknown, order: AdminOrder) => renderPhone(order),
    },
    {
      title: 'المحافظة',
      dataIndex: 'province',
      key: 'province',
      width: 140,
    },
    {
      title: 'المنتجات',
      key: 'itemsCount',
      width: 110,
      render: (_: unknown, order: AdminOrder) => productCountLabel(order.items.length),
    },
    {
      title: 'الإجمالي',
      dataIndex: 'total',
      key: 'total',
      width: 140,
      render: (value: number) => (
        <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>
          {formatCurrency(value)}
        </Typography.Text>
      ),
    },
    {
      title: 'الحالة',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value: OrderStatus) => <StatusBadge status={value} />,
    },
    {
      title: 'التاريخ',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 190,
      render: (value: string) => <span style={{ whiteSpace: 'nowrap' }}>{formatDateTime(value)}</span>,
    },
    {
      title: 'الإجراءات',
      key: 'actions',
      width: 200,
      fixed: 'end' as const,
      render: (_: unknown, order: AdminOrder) => renderActions(order),
    },
  ]

  /** بطاقة الهاتف — أعمدة الجدول كلها وإجراءاته، بلا تمريرٍ جانبي. */
  function renderCard(order: AdminOrder) {
    return (
      <Flex vertical gap={8}>
        <Flex justify="space-between" align="center" gap={8} wrap>
          <Typography.Text strong>#{order.number}</Typography.Text>
          <StatusBadge status={order.status} />
        </Flex>
        <Flex justify="space-between" align="center" gap={8} wrap>
          <Typography.Text>{order.customer?.name ?? 'غير متوفر'}</Typography.Text>
          {renderPhone(order)}
        </Flex>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {order.province} · {productCountLabel(order.items.length)} · {formatDateTime(order.createdAt)}
        </Typography.Text>
        <Typography.Text strong>{formatCurrency(order.total)}</Typography.Text>
        {renderActions(order, true)}
      </Flex>
    )
  }

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
          <ResponsiveTable<AdminOrder>
            rowKey="id"
            columns={columns}
            renderCard={renderCard}
            dataSource={ordersQuery.data?.items ?? []}
            loading={ordersQuery.isPending || ordersQuery.isFetching}
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