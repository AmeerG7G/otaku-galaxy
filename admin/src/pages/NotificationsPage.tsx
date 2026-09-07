import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Card,
  Col,
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
import { SendOutlined } from '@ant-design/icons'
import { getNotificationStats, listNotifications } from '../api/notificationsApi'
import { listOrders } from '../api/ordersApi'
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
import BroadcastComposer from '../components/BroadcastComposer'
import { PageHeader } from '../components/ui/PageHeader'
import { ReminderControls } from '../components/ui/ReminderControls'

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
  const [composerOpen, setComposerOpen] = useState(false)

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
      <PageHeader
        title="الإشعارات والتذكيرات"
        description="سجل الرسائل داخل التطبيق وتذكيرات تأكيد الاستلام."
        extra={
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => setComposerOpen(true)}
          >
            إشعار جديد
          </Button>
        }
      />

      <Alert
        type="info"
        showIcon
        message="السجل للقراءة، والإرسال من «إشعار جديد»"
        description="«مقروء» حالةٌ يملكها العميل نفسه، فلا تُعدَّل من هنا. الإشعار المُرسَل يُكتب في صندوق الزبون داخل التطبيق — لا مزوّد إشعارات دفع مربوطاً بعد. تذكير الاستلام قابل للضبط لكل طلب، وهو محميّ من التكرار: أول إرسال — يدوياً كان أو مجدولاً — يعلّم الطلب فلا يُرسل ثانيةً."
      />

      <BroadcastComposer open={composerOpen} onClose={() => setComposerOpen(false)} />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="إجمالي الإشعارات" value={stats.data?.total ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="غير مقروءة" value={stats.data?.unread ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
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

      <Modal
        open={Boolean(reminderOrder)}
        onCancel={() => setReminderOrder(null)}
        title={
          reminderOrder
            ? `تذكير الطلب #${reminderOrder.id.slice(0, 8)}`
            : 'تذكير'
        }
        footer={null}
        destroyOnHidden
      >
        {reminderOrder && (
          <ReminderControls
            order={reminderOrder}
            variant="modal"
            onDone={() => setReminderOrder(null)}
          />
        )}
      </Modal>
    </Space>
  )
}
