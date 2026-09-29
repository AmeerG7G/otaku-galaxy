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
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { getOrder, updateOrderStatus } from '../api/ordersApi'
import { ApiError } from '../api/client'
import type { OrderItem, OrderStatus } from '../types/orders'
import { formatCurrency, formatDateTime } from '../utils/format'
import StatusBadge from '../components/StatusBadge'
import StatusTransitionButtons from '../components/StatusTransitionButtons'
import { STATUS_LABELS } from '../constants/orders'
import { ProductLink } from '../components/ui/ProductLink'
import { WhatsAppButton } from '../components/ui/WhatsAppButton'
import { ReminderControls } from '../components/ui/ReminderControls'
import { LoadingState, ErrorState } from '../components/ui/States'

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
    return <LoadingState label="جارٍ تحميل الطلب…" />
  }

  if (orderQuery.isError) {
    return (
      <ErrorState
        message="تعذر تحميل الطلب"
        description={orderQuery.error.message}
        onRetry={() => orderQuery.refetch()}
      />
    )
  }

  const order = orderQuery.data
  const loyaltyDiscount = order.loyaltyDiscount ?? 0

  const itemColumns = [
    {
      // الصورة والاسم رابطٌ إلى صفحة المنتج (STEP 64 §3) — منتجٌ حُذف لاحقاً
      // (`productId` فارغ في اللقطة) يبقى نصاً.
      title: 'المنتج',
      key: 'product',
      render: (_: unknown, item: OrderItem) => (
        <ProductLink productId={item.productId} name={item.productName} image={item.imageUrl} />
      ),
    },
    {
      title: 'الخيار',
      dataIndex: 'optionValue',
      key: 'optionValue',
      render: (value: string | null) => value ?? '—',
    },
    { title: 'الكمية المطلوبة', dataIndex: 'quantity', key: 'quantity' },
    {
      // المخزون **الآن** كما قرأه الخادم عند فتح الطلب — لا لقطة الإنشاء. معلومةٌ
      // للمسؤول لا قرار: القبول يعيد الفحص تحت القفل على الخادم (§47.1).
      title: 'المخزون الحالي',
      dataIndex: 'currentStock',
      key: 'currentStock',
      render: (value: number | null | undefined, item: OrderItem) => {
        if (value === null || value === undefined) return '—'
        const short = order.status === 'PENDING_ADMIN_CONFIRMATION' && value < item.quantity
        return (
          <Space size={6}>
            <span>{value}</span>
            {short && <Tag color="red">غير كافٍ</Tag>}
          </Space>
        )
      },
    },
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
          {/* رقم الحساب أولاً، ورقم التواصل في الطلب لحسابٍ حُذف. */}
          <WhatsAppButton phone={order.customer?.phone ?? order.phone} style={{ marginTop: 8 }} />
        </Card>
        <Card title="التوصيل" style={{ flex: 1, minWidth: 280 }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="المحافظة">{order.province}</Descriptions.Item>
            {order.zoneName && (
              <Descriptions.Item label="منطقة التوصيل">{order.zoneName}</Descriptions.Item>
            )}
            <Descriptions.Item label="العنوان الكامل">
              {order.fullAddress}
            </Descriptions.Item>
            <Descriptions.Item label="رقم هاتف التواصل">
              {order.phone}
            </Descriptions.Item>
            <Descriptions.Item label="أجور التوصيل">
              {formatCurrency(order.deliveryFee)}
            </Descriptions.Item>
            {order.deliveryNote && (
              <Descriptions.Item label="وقت الوصول المتوقع">
                {order.deliveryNote}
              </Descriptions.Item>
            )}
            {order.rejectionReason && (
              <Descriptions.Item label="سبب الرفض">
                <Typography.Text type="danger">{order.rejectionReason}</Typography.Text>
              </Descriptions.Item>
            )}
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
          {/*
            تفصيل الخصم من الصفّ المحفوظ نفسه (`loyalty_discount`) — لا اشتقاق
            ولا حقل عرضٍ مصطنع: المسؤول يرى أن الزبون استعمل مزيّة مستواه
            وبكم، والباقي خصم الميلاد.
          */}
          {loyaltyDiscount > 0 && (
            <Descriptions.Item label="منه خصم مزيّة المستوى">
              <Typography.Text type="success">
                −{formatCurrency(loyaltyDiscount)}
              </Typography.Text>
            </Descriptions.Item>
          )}
          {loyaltyDiscount > 0 && order.discount - loyaltyDiscount > 0 && (
            <Descriptions.Item label="منه خصم عيد الميلاد">
              <Typography.Text type="success">
                −{formatCurrency(order.discount - loyaltyDiscount)}
              </Typography.Text>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="التوصيل">
            {formatCurrency(order.deliveryFee)}
          </Descriptions.Item>
          {order.deliveryDiscount > 0 && (
            <Descriptions.Item label="خصم التوصيل">
              <Typography.Text type="success">
                −{formatCurrency(order.deliveryDiscount)}
              </Typography.Text>
            </Descriptions.Item>
          )}
          {order.deliveryDiscount > 0 && (
            <Descriptions.Item label="التوصيل بعد الخصم">
              {formatCurrency(order.deliveryFee - order.deliveryDiscount)}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="الإجمالي النهائي">
            <Typography.Text strong>
              {formatCurrency(order.total)}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>

        {/*
          مبلغ محاسبي للمتجر لا سطرٌ في فاتورة الزبون — لذلك هو خارج جدول
          الإجماليات أعلاه ومعنون صراحةً. ضمُّه إلى الجدول كان سيقرأ كخصمٍ
          آخر، وهو عكس معناه: الزبون لم ينله.
        */}
        {(order.deliveryDiscountExcess ?? 0) > 0 && (
          <Alert
            style={{ marginTop: 12, maxWidth: 420 }}
            type="info"
            showIcon
            message={`فائض خصم التوصيل: ${formatCurrency(order.deliveryDiscountExcess ?? 0)}`}
            description="ما تجاوز رسوم التوصيل من ترويج منتجات هذا الطلب. مبلغ محتفَظ به للمتجر — لم يُخصم من الزبون ولا يدخل إجمالي الطلب."
          />
        )}
      </Card>

      {order.dispatchedAt && (
        <Card title="تذكير تأكيد الاستلام">
          <ReminderControls order={order} />
        </Card>
      )}

      <Card title="مسار الطلب">
        {order.statusHistory.length === 0 ? (
          <Typography.Text type="secondary">
            لا يوجد سجل انتقالات لهذا الطلب.
          </Typography.Text>
        ) : (
          <Timeline
            items={order.statusHistory.map((event) => ({
              color: event.status === 'REJECTED' ? 'red' : 'blue',
              children: (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>
                    {STATUS_LABELS[event.status]}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {formatDateTime(event.createdAt)}
                  </Typography.Text>
                  {event.note && (
                    <Typography.Text style={{ fontSize: 12 }}>
                      {event.note}
                    </Typography.Text>
                  )}
                </Space>
              ),
            }))}
          />
        )}
        {(order.dispatchedAt || order.deliveredAt) && (
          <Descriptions column={1} size="small" style={{ marginTop: 12 }}>
            <Descriptions.Item label="خروج للتوصيل">
              {order.dispatchedAt ? formatDateTime(order.dispatchedAt) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="وقت الاستلام">
              {order.deliveredAt ? formatDateTime(order.deliveredAt) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="التقييم للعميل">
              {/* يقرّره الخادم من الاستلام — لا موعد يُنتظر بعده. */}
              {order.canReview ? 'مفتوح منذ تأكيد الاستلام' : 'يُفتح بتأكيد الاستلام'}
            </Descriptions.Item>
            <Descriptions.Item label="موعد تذكير التقييم">
              {order.ratingReminderAt ? formatDateTime(order.ratingReminderAt) : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>
    </Space>
  )
}
