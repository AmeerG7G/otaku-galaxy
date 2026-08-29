import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import { BellOutlined, SendOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  getNotificationStats,
  listNotifications,
} from '../api/notificationsApi'
import { listOrders, rescheduleReminder, sendReminderNow } from '../api/ordersApi'
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
  type AdminNotification,
  type NotificationType,
  type NotificationTypeStat,
} from '../types/notifications'
import type { AdminOrder } from '../types/orders'
import { formatDateTime } from '../utils/format'
import EmptyState from '../components/EmptyState'

type ReadFilter = 'all' | 'unread' | 'read'

const READ_OPTIONS = [
  { label: 'الكل', value: 'all' as const },
  { label: 'غير مقروء', value: 'unread' as const },
  { label: 'مقروء', value: 'read' as const },
]

/**
 * الإشعارات وتذكيرات الاستلام في مكان واحد.
 *
 * تقرأ نفس جدول `notifications` الذي يقرأه التطبيق ونفس مسارات التذكير
 * الموجودة أصلاً — لا منظومة إشعارات ثانية ولا جدولة موازية.
 *
 * الإشعارات للقراءة فقط: «مقروء» حالةٌ يملكها صاحب الإشعار، وتعليمها من
 * اللوحة يفسد عدّاد غير المقروء لديه بلا أن يفتح الإشعار فعلاً.
 */
export default function NotificationsPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [type, setType] = useState<NotificationType | undefined>()
  const [read, setRead] = useState<ReadFilter>('all')
  const [reminderOrder, setReminderOrder] = useState<AdminOrder | null>(null)
  const limit = 20

  const stats = useQuery({
    queryKey: ['admin-notification-stats'],
    queryFn: getNotificationStats,
  })

  const list = useQuery({
    queryKey: ['admin-notifications', page, type, read],
    queryFn: () =>
      listNotifications({
        page,
        limit,
        type,
        read: read === 'all' ? undefined : read === 'read',
      }),
  })

  /** الطلبات المستلَمة — مصدر تذكيرات التقييم القابلة للضبط. */
  const completedOrders = useQuery({
    queryKey: ['admin-orders-completed'],
    queryFn: () => listOrders({ page: 1, limit: 50, status: 'COMPLETED' }),
  })

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-notifications'] })
    void queryClient.invalidateQueries({ queryKey: ['admin-notification-stats'] })
    void queryClient.invalidateQueries({ queryKey: ['admin-orders-completed'] })
  }

  const sendNow = useMutation({
    mutationFn: sendReminderNow,
    onSuccess: () => {
      message.success('أُرسل التذكير')
      setReminderOrder(null)
      refreshAll()
    },
    onError: (error: Error) => message.error(error.message),
  })

  const reschedule = useMutation({
    // الخادم يقبل أحد الشكلين لا كليهما: مهلة بالساعات أو لحظة صريحة.
    mutationFn: (input: { id: string; payload: { delayHours: number } | { remindAt: string } }) =>
      rescheduleReminder(input.id, input.payload),
    onSuccess: () => {
      message.success('حُدّث موعد التذكير')
      setReminderOrder(null)
      refreshAll()
    },
    onError: (error: Error) => message.error(error.message),
  })

  const notificationColumns = [
    {
      title: 'النوع',
      dataIndex: 'type',
      key: 'type',
      render: (value: NotificationType) => (
        <Tag>{NOTIFICATION_TYPE_LABELS[value] ?? value}</Tag>
      ),
    },
    {
      title: 'الإشعار',
      key: 'content',
      render: (_: unknown, row: AdminNotification) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{row.title}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.body}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'المستلِم',
      key: 'user',
      render: (_: unknown, row: AdminNotification) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{row.username}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.phone}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'الحالة',
      key: 'read',
      render: (_: unknown, row: AdminNotification) =>
        row.read ? (
          <Space direction="vertical" size={0}>
            <Tag color="green">مقروء</Tag>
            {row.readAt && (
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {formatDateTime(row.readAt)}
              </Typography.Text>
            )}
          </Space>
        ) : (
          <Tag color="orange">غير مقروء</Tag>
        ),
    },
    {
      title: 'أُرسل',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDateTime(value),
    },
  ]

  const reminderColumns = [
    {
      title: 'الطلب',
      key: 'order',
      render: (_: unknown, row: AdminOrder) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>#{row.id.slice(0, 8)}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.customer?.name ?? '—'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'موعد فتح التقييم',
      dataIndex: 'ratingAvailableAt',
      key: 'ratingAvailableAt',
      render: (value: string | null) => (value ? formatDateTime(value) : '—'),
    },
    {
      title: 'حالة التذكير',
      key: 'reminder',
      render: (_: unknown, row: AdminOrder) =>
        row.ratingReminderSentAt ? (
          <Space direction="vertical" size={0}>
            <Tag color="green">أُرسل</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {formatDateTime(row.ratingReminderSentAt)}
            </Typography.Text>
          </Space>
        ) : (
          <Tag color="blue">مجدول</Tag>
        ),
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, row: AdminOrder) =>
        row.ratingReminderSentAt ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            أُرسل — لا يُرسل مرتين
          </Typography.Text>
        ) : (
          <Button size="small" onClick={() => setReminderOrder(row)}>
            ضبط / إرسال
          </Button>
        ),
    },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        <BellOutlined /> الإشعارات والتذكيرات
      </Typography.Title>

      <Alert
        type="info"
        showIcon
        message="عرض الإشعارات للقراءة فقط"
        description="«مقروء» حالةٌ يملكها العميل نفسه، فلا تُعدَّل من هنا. تذكير الاستلام وحده قابل للضبط، وهو محميّ من التكرار: أول إرسال — يدوياً كان أو مجدولاً — يعلّم الطلب، فلا يُرسل ثانيةً."
      />

      <Row gutter={[12, 12]}>
        <Col xs={8}>
          <Card>
            <Statistic title="إجمالي الإشعارات" value={stats.data?.total ?? 0} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card>
            <Statistic title="غير مقروءة" value={stats.data?.unread ?? 0} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card>
            <Statistic title="عدد المستلِمين" value={stats.data?.recipients ?? 0} />
          </Card>
        </Col>
      </Row>

      <Card title="التوزيع على الأنواع" loading={stats.isPending} size="small">
        <Space wrap>
          {(stats.data?.byType ?? []).map((row: NotificationTypeStat) => (
            <Tag key={row.type}>
              {NOTIFICATION_TYPE_LABELS[row.type] ?? row.type}: {row.total}
              {row.unread > 0 ? ` (${row.unread} غير مقروء)` : ''}
            </Tag>
          ))}
          {stats.data && stats.data.byType.length === 0 && (
            <Typography.Text type="secondary">لا إشعارات بعد.</Typography.Text>
          )}
        </Space>
      </Card>

      <Card title="سجل الإشعارات">
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            allowClear
            placeholder="كل الأنواع"
            style={{ minWidth: 190 }}
            value={type}
            onChange={(value) => {
              setType(value)
              setPage(1)
            }}
            options={NOTIFICATION_TYPES.map((value) => ({
              value,
              label: NOTIFICATION_TYPE_LABELS[value],
            }))}
          />
          <Segmented
            options={READ_OPTIONS}
            value={read}
            onChange={(value) => {
              setRead(value as ReadFilter)
              setPage(1)
            }}
          />
        </Space>

        {list.data && list.data.items.length === 0 ? (
          <EmptyState description="لا إشعارات مطابقة لهذا الترشيح." />
        ) : (
          <Table
            rowKey="id"
            size="small"
            loading={list.isPending}
            columns={notificationColumns}
            dataSource={list.data?.items ?? []}
            scroll={{ x: 860 }}
            pagination={{
              current: page,
              pageSize: limit,
              total: list.data?.total ?? 0,
              onChange: setPage,
              showSizeChanger: false,
            }}
          />
        )}
      </Card>

      <Card title="تذكيرات التقييم (الطلبات المستلَمة)">
        {completedOrders.data && completedOrders.data.items.length === 0 ? (
          <EmptyState description="لا طلبات مستلَمة بعد." />
        ) : (
          <Table
            rowKey="id"
            size="small"
            loading={completedOrders.isPending}
            columns={reminderColumns}
            dataSource={completedOrders.data?.items ?? []}
            scroll={{ x: 700 }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
          />
        )}
      </Card>

      <ReminderModal
        order={reminderOrder}
        onCancel={() => setReminderOrder(null)}
        onSendNow={(id) => sendNow.mutate(id)}
        onReschedule={(input) => reschedule.mutate(input)}
        sending={sendNow.isPending}
        saving={reschedule.isPending}
      />
    </Space>
  )
}

interface ReminderFormValues {
  delayHours?: number
  availableAt?: Dayjs
}

function ReminderModal({
  order,
  onCancel,
  onSendNow,
  onReschedule,
  sending,
  saving,
}: {
  order: AdminOrder | null
  onCancel: () => void
  onSendNow: (id: string) => void
  onReschedule: (input: {
    id: string
    payload: { delayHours: number } | { remindAt: string }
  }) => void
  sending: boolean
  saving: boolean
}) {
  const [form] = Form.useForm<ReminderFormValues>()

  return (
    <Modal
      open={Boolean(order)}
      onCancel={onCancel}
      title={order ? `تذكير الطلب #${order.id.slice(0, 8)}` : 'تذكير'}
      footer={null}
      destroyOnHidden
    >
      {order && (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            موعد فتح التقييم الحالي:{' '}
            <strong>
              {order.ratingAvailableAt ? formatDateTime(order.ratingAvailableAt) : '—'}
            </strong>
          </Typography.Paragraph>

          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => {
              // اللحظة الصريحة تسبق المهلة إن مُلئ الحقلان — الخادم يقبل
              // أحدهما فقط، فنختار هنا بدل أن نرسل جسماً يرفضه.
              if (values.availableAt) {
                onReschedule({
                  id: order.id,
                  payload: { remindAt: values.availableAt.toISOString() },
                })
                return
              }
              if (typeof values.delayHours === 'number') {
                onReschedule({
                  id: order.id,
                  payload: { delayHours: values.delayHours },
                })
              }
            }}
          >
            <Form.Item
              name="delayHours"
              label="مهلة بالساعات من الآن"
              tooltip="تُستعمل عند ترك الحقل الزمني فارغاً."
            >
              <InputNumber min={0} max={720} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="availableAt" label="أو لحظة صريحة">
              <DatePicker
                showTime
                style={{ width: '100%' }}
                disabledDate={(current) => current && current < dayjs().startOf('day')}
              />
            </Form.Item>

            <Space>
              <Button type="primary" htmlType="submit" loading={saving}>
                حفظ الموعد
              </Button>
              <Button
                icon={<SendOutlined />}
                loading={sending}
                onClick={() => onSendNow(order.id)}
              >
                إرسال الآن
              </Button>
            </Space>
          </Form>
        </Space>
      )}
    </Modal>
  )
}
