import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Card,
  Descriptions,
  Flex,
  Image,
  Space,
  Spin,
  Table,
  Typography,
} from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { getOrder, updateOrderStatus } from '../api/ordersApi'
import { ApiError } from '../api/client'
import type { OrderItem, OrderStatus } from '../types/orders'
import { formatCurrency, formatDateTime } from '../utils/format'
import StatusBadge from '../components/StatusBadge'
import StatusTransitionButtons from '../components/StatusTransitionButtons'

export default function OrderDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { message } = App.useApp()

  const orderQuery = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id),
    enabled: Boolean(id),
  })

  const updateMutation = useMutation({
    mutationFn: (input: { status: OrderStatus; note?: string }) =>
      updateOrderStatus(id, input.status, input.note),
    onSuccess: (result) => {
      message.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (error) => {
      message.error(
        error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع',
      )
    },
  })

  if (orderQuery.isPending) {
    return (
      <Flex justify="center" style={{ paddingTop: 80 }}>
        <Spin size="large" tip="جارٍ تحميل الطلب…">
          <div style={{ width: 120, height: 60 }} />
        </Spin>
      </Flex>
    )
  }

  if (orderQuery.isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="تعذر تحميل الطلب"
        description={orderQuery.error.message}
        action={
          <Button onClick={() => orderQuery.refetch()}>إعادة المحاولة</Button>
        }
      />
    )
  }

  const order = orderQuery.data

  const itemColumns = [
    {
      title: '',
      key: 'image',
      width: 64,
      render: (_: unknown, item: OrderItem) =>
        item.imageUrl ? (
          <Image
            src={item.imageUrl}
            width={48}
            height={48}
            style={{ objectFit: 'cover', borderRadius: 4 }}
            preview={false}
          />
        ) : (
          '—'
        ),
    },
    { title: 'المنتج', dataIndex: 'productName', key: 'productName' },
    {
      title: 'الخيار',
      dataIndex: 'optionValue',
      key: 'optionValue',
      render: (value: string | null) => value ?? '—',
    },
    { title: 'الكمية', dataIndex: 'quantity', key: 'quantity' },
    {
      title: 'سعر الوحدة',
      dataIndex: 'price',
      key: 'price',
      render: (value: number) => formatCurrency(value),
    },
    {
      title: 'الإجمالي',
      dataIndex: 'lineTotal',
      key: 'lineTotal',
      render: (value: number) => <Typography.Text strong>{formatCurrency(value)}</Typography.Text>,
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Breadcrumb
        items={[
          { title: <Link to="/orders">الطلبات</Link> },
          { title: `الطلب #${order.number}` },
        ]}
      />
      <Flex align="center" justify="space-between" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            تفاصيل الطلب #{order.number}
          </Typography.Title>
          <Typography.Text type="secondary">
            {formatDateTime(order.createdAt)}
          </Typography.Text>
        </div>
        <Button icon={<ArrowRightOutlined />} onClick={() => navigate('/orders')}>
          العودة إلى الطلبات
        </Button>
      </Flex>

      <Card>
        <Flex justify="space-between" align="center" wrap gap={12}>
          <Space size="large" wrap>
            <div>
              <Typography.Text type="secondary">الحالة</Typography.Text>
              <div>
                <StatusBadge status={order.status} />
              </div>
            </div>
            <div>
              <Typography.Text type="secondary">تاريخ الطلب</Typography.Text>
              <div style={{ fontWeight: 600 }}>{formatDateTime(order.createdAt)}</div>
            </div>
          </Space>
          <StatusTransitionButtons
            orderNumber={order.number}
            currentStatus={order.status}
            submitting={updateMutation.isPending}
            onTransition={(status, note) =>
              updateMutation.mutateAsync({ status, note })
            }
          />
        </Flex>
      </Card>

      <Flex gap={16} wrap>
        <Card title="الزبون" style={{ flex: 1, minWidth: 280 }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="اسم الزبون">
              {order.customer?.name ?? 'غير متوفر'}
            </Descriptions.Item>
            <Descriptions.Item label="الهاتف">
              {order.customer?.phone ?? 'غير متوفر'}
            </Descriptions.Item>
          </Descriptions>
        </Card>
        <Card title="التوصيل" style={{ flex: 1, minWidth: 280 }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="المحافظة">{order.province}</Descriptions.Item>
            <Descriptions.Item label="العنوان الكامل">
              {order.fullAddress}
            </Descriptions.Item>
            <Descriptions.Item label="رقم هاتف التواصل">
              {order.phone}
            </Descriptions.Item>
            <Descriptions.Item label="أجور التوصيل">
              {formatCurrency(order.deliveryFee)}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </Flex>

      <Card title="المنتجات">
        <Table
          rowKey="productId"
          columns={itemColumns}
          dataSource={order.items}
          pagination={false}
          scroll={{ x: 640 }}
          size="small"
        />
      </Card>

      <Card title="الإجماليات">
        <Descriptions column={1} size="small" style={{ maxWidth: 420 }}>
          <Descriptions.Item label="مجموع المنتجات">
            {formatCurrency(order.productsTotal)}
          </Descriptions.Item>
          <Descriptions.Item label="الخصم">
            {formatCurrency(order.discount)}
          </Descriptions.Item>
          <Descriptions.Item label="التوصيل">
            {formatCurrency(order.deliveryFee)}
          </Descriptions.Item>
          <Descriptions.Item label="الإجمالي النهائي">
            <Typography.Text strong>
              {formatCurrency(order.total)}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </Space>
  )
}