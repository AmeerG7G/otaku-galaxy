import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Flex,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import { KeyOutlined, ReloadOutlined, WhatsAppOutlined } from '@ant-design/icons'
import { getCustomerDetail } from '../api/customersApi'
import EmptyState from '../components/EmptyState'
import PageLoader from '../components/PageLoader'
import SetCustomerPasswordModal from '../components/SetCustomerPasswordModal'
import StatusBadge from '../components/StatusBadge'
import { PageHeader } from '../components/ui/PageHeader'
import {
  ACCOUNT_REQUEST_KIND_LABELS,
  ACCOUNT_REQUEST_STATUS_LABELS,
  type AccountRequest,
  type AccountRequestStatus,
} from '../types/accountRequests'
import { customerGenderLabel, type AdminCustomerOrderSummary } from '../types/customers'
import type { OrderStatus } from '../types/orders'
import { formatCurrency, formatDateTime } from '../utils/format'
import { resolveMediaUrl } from '../utils/media'
import { whatsappUrl } from '../utils/phone'

const REQUEST_STATUS_COLORS: Record<AccountRequestStatus, string> = {
  pending: 'gold',
  approved: 'green',
  rejected: 'red',
}

/**
 * ملفّ الزبون الكامل من مكانٍ واحد: هوية، نقاط ومستوى، طلبات شراء، وتاريخ
 * طلبات الحساب — وزرّ «تغيير كلمة مرور الزبون».
 *
 * [CRITICAL] لا كلمة مرور ولا تجزئة ولا توكن هنا ولا في ما يصل من الخادم.
 * المسؤول **يضع** كلمةً جديدة دائمة بعد تحقّق واتساب؛ لا يسترجع القديمة.
 */
export default function CustomerDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const [passwordOpen, setPasswordOpen] = useState(false)

  const detailQuery = useQuery({
    queryKey: ['customer-detail', id],
    queryFn: () => getCustomerDetail(id),
    enabled: id.length > 0,
  })

  if (detailQuery.isLoading) return <PageLoader />
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <EmptyState
        description="تعذّر تحميل ملفّ الزبون"
        actionLabel="إعادة المحاولة"
        onAction={() => detailQuery.refetch()}
      />
    )
  }

  const { profile, points, orders, requests } = detailQuery.data
  const chat = whatsappUrl(profile.phone)
  const pendingReset = requests.find((r) => r.kind === 'password_reset' && r.status === 'pending')

  const orderColumns = [
    {
      title: 'رقم الطلب',
      dataIndex: 'id',
      key: 'id',
      render: (value: string) => (
        <Link to={`/orders/${value}`}>
          <Typography.Text code>{value.slice(0, 8)}</Typography.Text>
        </Link>
      ),
    },
    {
      title: 'التاريخ',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'الحالة',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <StatusBadge status={value as OrderStatus} />,
    },
    {
      title: 'المجموع',
      dataIndex: 'total',
      key: 'total',
      render: (value: number) => formatCurrency(Number(value)),
    },
    {
      title: 'المنتجات',
      key: 'items',
      render: (_: unknown, order: AdminCustomerOrderSummary) =>
        order.items?.length
          ? order.items.map((i) => `${i.productName} ×${i.quantity}`).join('، ')
          : '—',
    },
  ]

  const requestColumns = [
    {
      title: 'النوع',
      dataIndex: 'kind',
      key: 'kind',
      render: (value: AccountRequest['kind']) => ACCOUNT_REQUEST_KIND_LABELS[value],
    },
    {
      title: 'ما أُرسل',
      key: 'submitted',
      render: (_: unknown, r: AccountRequest) =>
        `${r.submitted.username} · ${customerGenderLabel(r.submitted.gender)}${
          r.submitted.levelKey ? ` · ${r.submitted.levelKey}` : ''
        }`,
    },
    {
      title: 'الحالة',
      dataIndex: 'status',
      key: 'status',
      render: (value: AccountRequestStatus) => (
        <Tag color={REQUEST_STATUS_COLORS[value]}>{ACCOUNT_REQUEST_STATUS_LABELS[value]}</Tag>
      ),
    },
    {
      title: 'وقت الطلب',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'الحسم',
      key: 'resolved',
      render: (_: unknown, r: AccountRequest) =>
        r.resolvedAt ? (
          <Space direction="vertical" size={0}>
            <span>{formatDateTime(r.resolvedAt)}</span>
            {r.adminNote && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {r.adminNote}
              </Typography.Text>
            )}
          </Space>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title={profile.username}
        description="ملفّ الزبون — الهوية والنقاط والطلبات وطلبات الحساب من مكانٍ واحد."
        extra={
          <Space wrap>
            <Button
              icon={<WhatsAppOutlined />}
              disabled={!chat}
              href={chat ?? undefined}
              target="_blank"
              rel="noreferrer noopener"
            >
              واتساب
            </Button>
            <Button type="primary" icon={<KeyOutlined />} onClick={() => setPasswordOpen(true)}>
              تغيير كلمة مرور الزبون
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => detailQuery.refetch()} loading={detailQuery.isFetching}>
              تحديث
            </Button>
          </Space>
        }
      />

      {pendingReset && (
        <Alert
          type="warning"
          showIcon
          message="لهذا الزبون طلب إعادة تعيين كلمة مرور قيد المراجعة"
          description={`أرسل: ${pendingReset.submitted.username} · ${customerGenderLabel(
            pendingReset.submitted.gender,
          )} · المستوى ${pendingReset.submitted.levelKey ?? '—'} — قارن بالمخزَّن أدناه، تحقّق عبر واتساب، ثم ضع كلمة مرور جديدة.`}
          action={
            <Button size="small" type="primary" onClick={() => setPasswordOpen(true)}>
              وضع كلمة مرور جديدة
            </Button>
          }
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="الهوية" variant="outlined">
            <Flex gap={16} align="flex-start">
              <Avatar src={resolveMediaUrl(profile.avatarUrl)} size={64}>
                {profile.username.charAt(0)}
              </Avatar>
              <Descriptions column={{ xs: 1, md: 2 }} size="small" style={{ flex: 1 }}>
                <Descriptions.Item label="معرّف الحساب">
                  <Typography.Text code copyable>
                    {profile.id}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="الاسم">{profile.username}</Descriptions.Item>
                <Descriptions.Item label="الهاتف">
                  <Typography.Text dir="ltr" copyable>
                    {profile.phone}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="الجنس">{customerGenderLabel(profile.gender)}</Descriptions.Item>
                <Descriptions.Item label="حالة الحساب">
                  <Space size={4}>
                    <Tag color={profile.isActive ? 'green' : 'red'}>{profile.isActive ? 'نشط' : 'محظور'}</Tag>
                    <Tag color={profile.isVerified ? 'green' : 'gold'}>
                      {profile.isVerified ? 'مفعَّل' : 'بانتظار الموافقة'}
                    </Tag>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="لغة الواجهة">
                  {profile.preferredLanguage === 'ckb' ? 'الكردية (سوراني)' : 'العربية'}
                </Descriptions.Item>
                <Descriptions.Item label="تاريخ التسجيل">{formatDateTime(profile.createdAt)}</Descriptions.Item>
                <Descriptions.Item label="تاريخ التفعيل">
                  {profile.verifiedAt ? formatDateTime(profile.verifiedAt) : '—'}
                </Descriptions.Item>
              </Descriptions>
            </Flex>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="نقاط المجرّة والمستوى" variant="outlined">
            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="الرصيد" value={points.balance} />
              </Col>
              <Col span={8}>
                <Statistic title="المستوى" value={points.levelNumber} suffix={`/ 7`} />
              </Col>
              <Col span={8}>
                <Statistic title="الطلبات" value={orders.total} />
              </Col>
            </Row>
            <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
              <Typography.Text strong>{points.levelName}</Typography.Text>
              <Typography.Text type="secondary"> ({points.levelKey})</Typography.Text>
              {points.nextLevelKey && points.pointsToNextLevel !== null && (
                <Typography.Text type="secondary">
                  {' '}
                  — يحتاج {points.pointsToNextLevel} نقطة للمستوى التالي
                </Typography.Text>
              )}
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>

      <Card title="طلبات الحساب" variant="outlined">
        <Table<AccountRequest>
          rowKey="id"
          size="small"
          dataSource={requests}
          columns={requestColumns}
          pagination={false}
          locale={{ emptyText: <EmptyState description="لا طلبات حساب لهذا الزبون" /> }}
        />
      </Card>

      <Card title={`الطلبات (${orders.total})`} variant="outlined">
        <Table<AdminCustomerOrderSummary>
          rowKey="id"
          size="small"
          dataSource={orders.items}
          columns={orderColumns}
          pagination={false}
          locale={{ emptyText: <EmptyState description="لا طلبات بعد" /> }}
        />
      </Card>

      <SetCustomerPasswordModal
        open={passwordOpen}
        customerId={profile.id}
        customerName={profile.username}
        {...(pendingReset ? { requestId: pendingReset.id } : {})}
        onClose={() => setPasswordOpen(false)}
      />
    </Space>
  )
}
