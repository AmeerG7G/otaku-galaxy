import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Avatar, Card, Segmented, Space, Table, Tag, Typography } from 'antd'
import { GiftOutlined } from '@ant-design/icons'
import { listBirthdayCustomers } from '../api/customersApi'
import type { BirthdayCustomer } from '../types/birthdays'
import { formatDateTime } from '../utils/format'
import { resolveMediaUrl } from '../utils/media'
import EmptyState from '../components/EmptyState'

const MONTHS = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
]

/**
 * أعياد ميلاد العملاء.
 *
 * يقرأ نفس حقول `users` التي يكتبها التطبيق — لا حقل ميلاد ثانٍ ولا جدول
 * منفصل. الترتيب بالشهر ثم اليوم حتى يقرأها المسؤول كتقويم.
 */
type BirthdayFilter = 'registered' | 'pending' | 'all'

const FILTER_OPTIONS = [
  { label: 'المسجَّلون', value: 'registered' as const },
  { label: 'مؤهَّلون بلا تسجيل', value: 'pending' as const },
  { label: 'الكل', value: 'all' as const },
]

export default function BirthdaysPage() {
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<BirthdayFilter>('registered')
  const limit = 20

  const query = useQuery({
    queryKey: ['admin-birthdays', page, filter],
    queryFn: () => listBirthdayCustomers({ page, limit, filter }),
  })

  const columns = [
    {
      title: 'العميل',
      key: 'customer',
      render: (_: unknown, row: BirthdayCustomer) => (
        <Space>
          <Avatar src={resolveMediaUrl(row.avatarUrl)} size={34}>
            {row.username.slice(0, 1)}
          </Avatar>
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{row.username}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.phone}
            </Typography.Text>
          </Space>
        </Space>
      ),
    },
    {
      title: 'تاريخ الميلاد',
      key: 'birthday',
      render: (_: unknown, row: BirthdayCustomer) =>
        row.birthDay !== null && row.birthMonth !== null ? (
          <Typography.Text strong>
            {row.birthDay} {MONTHS[row.birthMonth - 1]}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary">لم يُسجَّل</Typography.Text>
        ),
    },
    {
      title: 'حالة التسجيل',
      key: 'registration',
      render: (_: unknown, row: BirthdayCustomer) =>
        row.isRegistered ? (
          <Tag color="green">مسجَّل</Tag>
        ) : (
          <Tag color="orange">مؤهَّل — بانتظار التسجيل</Tag>
        ),
    },
    {
      title: 'وقت التسجيل',
      dataIndex: 'birthdaySetAt',
      key: 'birthdaySetAt',
      render: (value: string | null) => (value ? formatDateTime(value) : '—'),
    },
    {
      title: 'طلبات مكتملة',
      dataIndex: 'completedOrders',
      key: 'completedOrders',
    },
    {
      title: 'خصم هذه السنة',
      dataIndex: 'discountUsedThisYear',
      key: 'discountUsedThisYear',
      render: (used: boolean) =>
        used ? <Tag color="green">استُخدم</Tag> : <Tag>متاح</Tag>,
    },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        <GiftOutlined /> أعياد ميلاد العملاء
      </Typography.Title>

      <Alert
        type="info"
        showIcon
        message="يُطلب تاريخ الميلاد مرة واحدة فقط"
        description="يُعرض الطلب على العميل بعد استلامه أول طلب، ولا يُعرض مرة أخرى بعد تسجيله. الحالة محفوظة في عمود واحد على الخادم (users.birth_day)، ويمنع تعديلَها شرطٌ في قاعدة البيانات — فلا تتأثر بتسجيل الخروج ولا بإعادة تثبيت التطبيق ولا بتغيير الجهاز."
      />

      <Card>
        <Segmented
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(value) => {
            setFilter(value as BirthdayFilter)
            setPage(1)
          }}
          style={{ marginBottom: 12 }}
        />
        {query.data && query.data.items.length === 0 ? (
          <EmptyState
            description={
              filter === 'pending'
                ? 'لا يوجد عميل مؤهَّل ينتظر التسجيل — كل من استلم طلباً سجّل تاريخه.'
                : 'لا يوجد عملاء سجّلوا تاريخ ميلادهم بعد — يظهر العميل هنا بعد تسجيله عقب استلام أول طلب.'
            }
          />
        ) : (
          <Table
            rowKey="id"
            loading={query.isPending}
            columns={columns}
            dataSource={query.data?.items ?? []}
            scroll={{ x: 720 }}
            size="small"
            pagination={{
              current: page,
              pageSize: limit,
              total: query.data?.total ?? 0,
              onChange: setPage,
              showSizeChanger: false,
            }}
          />
        )}
      </Card>
    </Space>
  )
}
