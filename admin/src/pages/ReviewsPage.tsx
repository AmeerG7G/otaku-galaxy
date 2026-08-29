import { resolveMediaUrl } from '../utils/media'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Button,
  Card,
  Empty,
  Flex,
  Image,
  Input,
  Modal,
  Rate,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { CheckOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons'
import { listAdminReviews, moderateReview } from '../api/communityApi'
import type { AdminReview, ReviewStatus } from '../types/community'
import { formatDateTime } from '../utils/format'

const STATUS_TABS: { label: string; value: ReviewStatus }[] = [
  { label: 'بانتظار المراجعة', value: 'pending' },
  { label: 'منشورة', value: 'approved' },
  { label: 'مرفوضة', value: 'rejected' },
]

const STATUS_TAG: Record<ReviewStatus, { color: string; label: string }> = {
  pending: { color: 'gold', label: 'بانتظار المراجعة' },
  approved: { color: 'green', label: 'منشور' },
  rejected: { color: 'red', label: 'مرفوض' },
}

export default function ReviewsPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const [status, setStatus] = useState<ReviewStatus>('pending')
  const [page, setPage] = useState(1)
  const [rejecting, setRejecting] = useState<AdminReview | null>(null)
  const [reason, setReason] = useState('')

  const reviewsQuery = useQuery({
    queryKey: ['admin-reviews', status, page],
    queryFn: () => listAdminReviews({ status, page, limit: 20 }),
  })

  const moderation = useMutation({
    mutationFn: (input: {
      id: string
      status: 'approved' | 'rejected'
      rejectionReason?: string
    }) => moderateReview(input.id, { status: input.status, rejectionReason: input.rejectionReason }),
    onSuccess: async (_data, variables) => {
      message.success(variables.status === 'approved' ? 'نُشر التقييم' : 'رُفض التقييم')
      setRejecting(null)
      setReason('')
      // عدّاد «بانتظار المراجعة» في الشريط الجانبي يعتمد على أرقام اللوحة.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-reviews'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
      ])
    },
    onError: (error: Error) => message.error(error.message),
  })

  function confirmReject() {
    if (!rejecting) return
    if (!reason.trim()) {
      message.warning('اكتب سبب الرفض — يظهر للعميل ليعدّل تقييمه')
      return
    }
    moderation.mutate({ id: rejecting.id, status: 'rejected', rejectionReason: reason.trim() })
  }

  const columns = [
    {
      title: 'المنتج',
      dataIndex: 'productName',
      key: 'productName',
      render: (value: string, review: AdminReview) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {review.customerName}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'التقييم',
      dataIndex: 'rating',
      key: 'rating',
      width: 140,
      render: (value: number) => <Rate disabled value={value} style={{ fontSize: 14 }} />,
    },
    {
      title: 'التعليق',
      dataIndex: 'comment',
      key: 'comment',
      render: (value: string) => (
        <Typography.Paragraph style={{ margin: 0, maxWidth: 360 }} ellipsis={{ rows: 3 }}>
          {value || <Typography.Text type="secondary">بلا تعليق</Typography.Text>}
        </Typography.Paragraph>
      ),
    },
    {
      title: 'الصورة',
      key: 'photo',
      width: 90,
      render: (_: unknown, review: AdminReview) =>
        review.photoUrl ? (
          <Image
            src={resolveMediaUrl(review.photoUrl)}
            width={56}
            height={56}
            style={{ objectFit: 'cover', borderRadius: 6 }}
          />
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: 'الحالة',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value: ReviewStatus, review: AdminReview) => (
        <Space direction="vertical" size={2}>
          <Tag color={STATUS_TAG[value].color}>{STATUS_TAG[value].label}</Tag>
          {value === 'rejected' && review.rejectionReason && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {review.rejectionReason}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: 'التاريخ',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'إجراء',
      key: 'actions',
      width: 190,
      render: (_: unknown, review: AdminReview) => (
        <Space>
          {review.status !== 'approved' && (
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              loading={moderation.isPending && moderation.variables?.id === review.id}
              onClick={() => moderation.mutate({ id: review.id, status: 'approved' })}
            >
              نشر
            </Button>
          )}
          {review.status !== 'rejected' && (
            <Button
              danger
              size="small"
              icon={<CloseOutlined />}
              onClick={() => {
                setRejecting(review)
                setReason('')
              }}
            >
              رفض
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            مراجعة التقييمات
          </Typography.Title>
          <Typography.Text type="secondary">
            التقييم لا يظهر في التطبيق قبل نشره من هنا.
          </Typography.Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={reviewsQuery.isFetching}
          onClick={() => reviewsQuery.refetch()}
        >
          تحديث
        </Button>
      </Flex>

      <Segmented
        value={status}
        options={STATUS_TABS}
        onChange={(value) => {
          setStatus(value as ReviewStatus)
          setPage(1)
        }}
      />

      <Card variant="outlined">
        {reviewsQuery.data?.items.length === 0 && !reviewsQuery.isPending ? (
          <Empty
            description={
              status === 'pending' ? 'لا توجد تقييمات بانتظار المراجعة' : 'لا توجد تقييمات'
            }
          />
        ) : (
          <Table
            rowKey="id"
            loading={reviewsQuery.isPending}
            columns={columns}
            dataSource={reviewsQuery.data?.items ?? []}
            scroll={{ x: 1100 }}
            pagination={{
              current: page,
              pageSize: reviewsQuery.data?.limit ?? 20,
              total: reviewsQuery.data?.total ?? 0,
              onChange: setPage,
              showSizeChanger: false,
            }}
          />
        )}
      </Card>

      <Modal
        open={rejecting !== null}
        title="رفض التقييم"
        okText="رفض"
        cancelText="إلغاء"
        okButtonProps={{ danger: true, loading: moderation.isPending }}
        onOk={confirmReject}
        onCancel={() => setRejecting(null)}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            السبب يظهر للعميل حتى يتمكن من تعديل تقييمه وإعادة إرساله.
          </Typography.Text>
          <Input.TextArea
            rows={3}
            maxLength={300}
            showCount
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="مثال: التعليق لا يخص المنتج"
          />
        </Space>
      </Modal>
    </Space>
  )
}
