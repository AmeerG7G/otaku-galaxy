import { resolveMediaUrl } from '../utils/media'
import { useState } from 'react'
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
  DatePicker,
  Popconfirm,
  Spin,
  Table,
  Timeline,
  Typography,
} from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import {
  getOrder,
  rescheduleReminder,
  sendReminderNow,
  updateOrderStatus,
} from '../api/ordersApi'
import { ApiError } from '../api/client'
import type { AdminOrder, OrderItem, OrderStatus } from '../types/orders'
import { formatCurrency, formatDateTime } from '../utils/format'
import StatusBadge from '../components/StatusBadge'
import StatusTransitionButtons from '../components/StatusTransitionButtons'
import { STATUS_LABELS } from '../constants/orders'

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
            src={resolveMediaUrl(item.imageUrl)}
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
          <Descriptions.Item label="الإجمالي النهائي">
            <Typography.Text strong>
              {formatCurrency(order.total)}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>
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
            <Descriptions.Item label="يُفتح التقييم للعميل">
              {order.ratingAvailableAt
                ? `${formatDateTime(order.ratingAvailableAt)} ${
                    order.ratingAvailable ? '(مفتوح الآن)' : '(لم يحن بعد)'
                  }`
                : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>
    </Space>
  )
}

/**
 * ضبط تذكير «هل استلمت طلبك؟» لطلب واحد.
 *
 * الجدولة على الخادم تقرأ عموداً في القاعدة، فتغيير الموعد هنا يكفي — لا
 * مؤقّت قديم يبقى معلّقاً. وبعد الإرسال تُقفل الأدوات لأن الخادم يرفض
 * إعادة الجدولة أو الإرسال مرة ثانية (REMINDER_ALREADY_SENT).
 */
const PRESETS = [1, 6, 12, 24, 48] as const

function ReminderControls({ order }: { order: AdminOrder }) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [customAt, setCustomAt] = useState<Dayjs | null>(null)

  const sent = order.ratingReminderSentAt !== null
  const invalidate = () => {
    // نفس مفاتيح الصفحة نفسها — مفتاح مختلف يعني إبطالاً لا يصيب شيئاً
    // وواجهةً تبقى على حالة قديمة بعد نجاح العملية.
    void queryClient.invalidateQueries({ queryKey: ['order', order.id] })
    void queryClient.invalidateQueries({ queryKey: ['orders'] })
  }

  const reschedule = useMutation({
    mutationFn: (payload: { delayHours: number } | { remindAt: string }) =>
      rescheduleReminder(order.id, payload),
    onSuccess: () => {
      message.success('حُدّث موعد التذكير')
      invalidate()
    },
    onError: (error) =>
      message.error(error instanceof ApiError ? error.message : 'تعذر التحديث'),
  })

  const sendNow = useMutation({
    mutationFn: () => sendReminderNow(order.id),
    onSuccess: () => {
      message.success('أُرسل الإشعار للعميل')
      invalidate()
    },
    onError: (error) =>
      message.error(error instanceof ApiError ? error.message : 'تعذر الإرسال'),
  })

  const busy = reschedule.isPending || sendNow.isPending

  if (sent) {
    return (
      <Alert
        type="success"
        showIcon
        message="أُرسل التذكير للعميل"
        description={`وقت الإرسال: ${formatDateTime(order.ratingReminderSentAt!)}. لا يمكن إعادة إرساله أو إعادة جدولته.`}
      />
    )
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Descriptions column={1} size="small">
        <Descriptions.Item label="خروج الطلب للتوصيل">
          {formatDateTime(order.dispatchedAt!)}
        </Descriptions.Item>
        <Descriptions.Item label="تأكيد الاستلام">
          {order.deliveredAt ? formatDateTime(order.deliveredAt) : 'لم يؤكّد بعد'}
        </Descriptions.Item>
        <Descriptions.Item label="موعد التذكير الحالي">
          {order.ratingAvailableAt ? formatDateTime(order.ratingAvailableAt) : '—'}
          {order.ratingAvailable ? ' (مستحق الآن)' : ''}
        </Descriptions.Item>
      </Descriptions>

      <Space wrap>
        <Typography.Text type="secondary">بعد الخروج للتوصيل بـ:</Typography.Text>
        {PRESETS.map((hours) => (
          <Button
            key={hours}
            size="small"
            disabled={busy}
            onClick={() => reschedule.mutate({ delayHours: hours })}
          >
            {hours} ساعة
          </Button>
        ))}
      </Space>

      <Space wrap>
        <Typography.Text type="secondary">أو وقت محدّد:</Typography.Text>
        <DatePicker
          showTime
          value={customAt}
          disabled={busy}
          onChange={(value) => setCustomAt(value)}
          placeholder="اختر التاريخ والوقت"
        />
        <Button
          size="small"
          disabled={busy || !customAt}
          onClick={() =>
            customAt && reschedule.mutate({ remindAt: customAt.toISOString() })
          }
        >
          حفظ الموعد
        </Button>
      </Space>

      <Popconfirm
        title="إرسال الإشعار الآن؟"
        description="سيصل العميل فوراً، ولن يُرسل التذكير المجدول بعدها."
        okText="إرسال"
        cancelText="إلغاء"
        onConfirm={() => sendNow.mutateAsync().catch(() => undefined)}
      >
        <Button type="primary" loading={sendNow.isPending} disabled={busy}>
          إرسال الإشعار الآن
        </Button>
      </Popconfirm>
    </Space>
  )
}
