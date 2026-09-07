import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import { fulfilGiftClaim, listGiftClaims } from '../api/pointsApi'
import EmptyState from './EmptyState'
import { formatCurrency, formatDateTime } from '../utils/format'
import type { GiftClaim } from '../types/points'

/**
 * طابور هدايا المستويات.
 *
 * مطالبةُ الزبون بهدية تُنشئ التزاماً على المتجر يُنفَّذ يدوياً: لا خصم يُطبَّق
 * ولا منتج يُضاف تلقائياً. هذه الشاشة هي المكان الذي يراه فيه المسؤول ويعلّمه
 * مُنفَّذاً.
 *
 * [CRITICAL] «سُلّمت» فعلٌ صريح لا يقع إلا بضغطة هنا، ولا يقع مرتين: الشرط
 * `fulfilled_at IS NULL` في القاعدة يجعل الضغطة الثانية بلا أثر. ولا انتهاء
 * صلاحية تلقائياً — مطالبةٌ لم تُسلَّم تبقى ديناً لا يسقط بالتقادم.
 */
export default function GiftClaimsCard() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [pendingOnly, setPendingOnly] = useState(true)
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['admin-gift-claims', pendingOnly, page],
    queryFn: () => listGiftClaims({ pending: pendingOnly, page, limit: 20 }),
  })

  const fulfil = useMutation({
    mutationFn: fulfilGiftClaim,
    onSuccess: () => {
      message.success('سُجّل تسليم الهدية')
      void queryClient.invalidateQueries({ queryKey: ['admin-gift-claims'] })
    },
    onError: (error: Error) => message.error(error.message),
  })

  const columns = [
    {
      title: 'العميل',
      key: 'customer',
      render: (_: unknown, row: GiftClaim) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{row.username}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.phone}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'المستوى',
      dataIndex: 'levelName',
      key: 'levelName',
      render: (value: string) => <Tag color="gold">{value}</Tag>,
    },
    {
      title: 'قيمة الهدية',
      dataIndex: 'giftAmount',
      key: 'giftAmount',
      render: (value: number | null) =>
        value == null ? '—' : <Typography.Text strong>{formatCurrency(value)}</Typography.Text>,
    },
    {
      title: 'تاريخ المطالبة',
      dataIndex: 'claimedAt',
      key: 'claimedAt',
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'الحالة',
      key: 'status',
      render: (_: unknown, row: GiftClaim) =>
        row.fulfilledAt ? (
          <Space direction="vertical" size={0}>
            <Tag color="green">سُلّمت</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {formatDateTime(row.fulfilledAt)}
              {row.fulfilledByName ? ` — ${row.fulfilledByName}` : ''}
            </Typography.Text>
          </Space>
        ) : (
          <Tag color="orange">بانتظار التسليم</Tag>
        ),
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, row: GiftClaim) =>
        row.fulfilledAt ? null : (
          <Popconfirm
            title="تأكيد تسليم الهدية"
            description={`سيُسجَّل أن ${row.username} استلم هديته. لا يمكن التراجع.`}
            okText="سُلّمت"
            cancelText="إلغاء"
            onConfirm={() => fulfil.mutate(row.id)}
          >
            <Button type="link" loading={fulfil.isPending}>
              تعليم كمسلَّمة
            </Button>
          </Popconfirm>
        ),
    },
  ]

  const data = query.data

  return (
    <Card
      title="هدايا المستويات"
      variant="outlined"
      loading={query.isPending}
      extra={
        <Space>
          <Typography.Text style={{ fontSize: 12 }}>غير المسلَّمة فقط</Typography.Text>
          <Switch
            checked={pendingOnly}
            onChange={(checked) => {
              setPendingOnly(checked)
              setPage(1)
            }}
          />
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="التسليم يدوي — والمطالبة ليست تسليماً"
          description="الزبون الذي بلغ العتبة وطالب بهديته ينتظر تسليمها فعلياً. المطالبة مسجَّلة عنده في التطبيق، ولا شيء يُغلقها إلا ضغطة «تعليم كمسلَّمة» هنا. لا تسقط بالتقادم ولا تُلغى تلقائياً."
        />

        {data && data.items.length === 0 ? (
          <EmptyState
            description={
              pendingOnly ? 'لا توجد هدايا بانتظار التسليم.' : 'لم يطالب أحد بهدية بعد.'
            }
          />
        ) : (
          <Table
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={data?.items ?? []}
            scroll={{ x: 780 }}
            pagination={{
              current: data?.page ?? 1,
              pageSize: data?.limit ?? 20,
              total: data?.total ?? 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
          />
        )}
      </Space>
    </Card>
  )
}
