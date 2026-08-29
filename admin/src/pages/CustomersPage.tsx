import { resolveMediaUrl } from '../utils/media'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Avatar,
  Button,
  Card,
  Flex,
  Modal,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import { ReloadOutlined, StarOutlined } from '@ant-design/icons'
import type { TablePaginationConfig } from 'antd'
import { useState } from 'react'
import { listCustomers, toggleUserActive } from '../api/customersApi'
import { getCustomerPoints } from '../api/pointsApi'
import type { PointsLedgerEntry, PointsReason } from '../types/points'
import { ApiError } from '../api/client'
import type { AdminCustomer } from '../types/customers'
import { formatDateTime } from '../utils/format'
import EmptyState from '../components/EmptyState'

const PAGE_SIZE = 12

export default function CustomersPage() {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pointsFor, setPointsFor] = useState<AdminCustomer | null>(null)

  /**
   * نقاط العميل المحدَّد — تُجلب عند الفتح فقط.
   *
   * تقرأ نفس دفتر النقاط الذي تقرأه صفحة النقاط؛ لا حساب ولا تخزين ثانٍ.
   */
  const pointsQuery = useQuery({
    queryKey: ['admin-customer-points', pointsFor?.id],
    queryFn: () => getCustomerPoints(pointsFor!.id),
    enabled: Boolean(pointsFor),
  })

  const customersQuery = useQuery({
    queryKey: ['customers', page],
    queryFn: () => listCustomers({ page, limit: PAGE_SIZE }),
  })

  const invalidateCustomers = () => {
    queryClient.invalidateQueries({ queryKey: ['customers'] })
  }

  const toggleMutation = useMutation({
    mutationFn: toggleUserActive,
    onSuccess: (result) => {
      message.success(result.message)
      invalidateCustomers()
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  function confirmToggle(customer: AdminCustomer) {
    const blocking = customer.isActive
    modal.confirm({
      title: blocking ? 'حظر العميل؟' : 'تفعيل العميل؟',
      content: blocking
        ? `لن يتمكن «${customer.username}» من تسجيل الدخول أو الطلب حتى يُعاد تفعيله.`
        : `سيتمكن «${customer.username}» من تسجيل الدخول والطلب مجدداً.`,
      okText: blocking ? 'حظر' : 'تفعيل',
      okButtonProps: { danger: blocking },
      cancelText: 'إلغاء',
      onOk: () => toggleMutation.mutateAsync(customer.id),
    })
  }

  const columns = [
    {
      title: 'المستخدم',
      key: 'user',
      render: (_: unknown, customer: AdminCustomer) => (
        <Flex align="center" gap={10}>
          <Avatar src={resolveMediaUrl(customer.avatarUrl)} size={36}>
            {customer.username.charAt(0)}
          </Avatar>
          <div>
            <Typography.Text strong>{customer.username}</Typography.Text>
          </div>
        </Flex>
      ),
    },
    {
      title: 'الهاتف',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: 'الحالة',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (value: boolean) =>
        value ? <Tag color="green">نشط</Tag> : <Tag color="red">محظور</Tag>,
    },
    {
      title: 'تاريخ الإنشاء',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'النقاط',
      key: 'points',
      width: 110,
      render: (_: unknown, customer: AdminCustomer) => (
        <Button size="small" icon={<StarOutlined />} onClick={() => setPointsFor(customer)}>
          عرض
        </Button>
      ),
    },
    {
      title: 'الإجراءات',
      key: 'actions',
      width: 150,
      render: (_: unknown, customer: AdminCustomer) => (
        <Button
          size="small"
          danger={customer.isActive}
          loading={toggleMutation.isPending && toggleMutation.variables === customer.id}
          onClick={() => confirmToggle(customer)}
        >
          {customer.isActive ? 'حظر' : 'تفعيل'}
        </Button>
      ),
    },
  ]

  const items = customersQuery.data?.items ?? []

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current ?? 1)
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            العملاء
          </Typography.Title>
          <Typography.Text type="secondary">
            حسابات زبائن المتجر.
          </Typography.Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={customersQuery.isFetching}
          onClick={() => customersQuery.refetch()}
        >
          تحديث
        </Button>
      </Flex>

      <Card>
        {customersQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message="تعذر تحميل العملاء"
            description={customersQuery.error.message}
            action={
              <Button size="small" onClick={() => customersQuery.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={items}
            loading={customersQuery.isPending || customersQuery.isFetching}
            scroll={{ x: 800 }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: customersQuery.data?.total ?? 0,
              showSizeChanger: false,
              showTotal: (total) => `${total} عميل`,
            }}
            onChange={handleTableChange}
            locale={{
              emptyText: <EmptyState description="لا يوجد عملاء بعد" />,
            }}
          />
        )}
      </Card>
      <Modal
        open={Boolean(pointsFor)}
        onCancel={() => setPointsFor(null)}
        footer={null}
        width={680}
        title={pointsFor ? `نقاط ${pointsFor.username}` : 'النقاط'}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Statistic title="الرصيد الحالي" value={pointsQuery.data?.balance ?? 0} />
          <Table
            rowKey="id"
            size="small"
            loading={pointsQuery.isPending}
            dataSource={(pointsQuery.data?.ledger ?? []) as PointsLedgerEntry[]}
            scroll={{ x: 480 }}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            columns={[
              { title: 'الحركة', dataIndex: 'label', key: 'label' },
              {
                title: 'السبب',
                dataIndex: 'reason',
                key: 'reason',
                render: (reason: PointsReason) => <Tag>{POINTS_REASON_LABELS[reason] ?? reason}</Tag>,
              },
              {
                title: 'النقاط',
                dataIndex: 'amount',
                key: 'amount',
                render: (amount: number) => (
                  <Typography.Text type={amount < 0 ? 'danger' : 'success'} strong>
                    {amount > 0 ? `+${amount}` : amount}
                  </Typography.Text>
                ),
              },
              {
                title: 'التاريخ',
                dataIndex: 'createdAt',
                key: 'createdAt',
                render: (value: string) => formatDateTime(value),
              },
            ]}
          />
        </Space>
      </Modal>
    </Space>
  )
}

/** تسميات أسباب المنح — عرض فقط. */
const POINTS_REASON_LABELS: Record<PointsReason, string> = {
  order_received: 'استلام طلب',
  review_approved: 'تقييم معتمد',
  review_with_photo: 'تقييم مصوّر',
  manual: 'يدوي',
}