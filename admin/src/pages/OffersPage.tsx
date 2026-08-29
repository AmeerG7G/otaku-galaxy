import { resolveMediaUrl } from '../utils/media'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  Image,
  Segmented,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { TablePaginationConfig } from 'antd'
import { listProducts, patchProductFlags } from '../api/productsApi'
import { ApiError, get } from '../api/client'
import type { Product } from '../types/products'
import { formatCurrency } from '../utils/format'
import EmptyState from '../components/EmptyState'

const PAGE_LIMIT = 12

type OffersTab = 'offer' | 'selected' | 'all'

const TAB_LABELS: Record<OffersTab, string> = {
  offer: 'العروض',
  selected: 'المختارة',
  all: 'كل المنتجات',
}

const NO_IMAGE_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#f5f5f5"/><text x="32" y="36" font-size="12" text-anchor="middle" fill="#aaa">لا صورة</text></svg>',
  )

interface PublicListResponse {
  items: Product[]
  page: number
  limit: number
  total: number
}

function fetchPublicFiltered(
  filter: 'offer' | 'selected',
  page: number,
): Promise<PublicListResponse> {
  return get<PublicListResponse>('/catalog/products', {
    params: { offer: filter === 'offer' ? 'true' : undefined, selected: filter === 'selected' ? 'true' : undefined, page, limit: PAGE_LIMIT },
  })
}

export default function OffersPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<OffersTab>('offer')
  const [page, setPage] = useState(1)

  const publicQuery = useQuery({
    queryKey: ['offers-public', tab, page],
    queryFn: () =>
      tab === 'all'
        ? listProducts({ page, limit: PAGE_LIMIT })
        : fetchPublicFiltered(tab, page),
    enabled: tab !== 'all',
  })

  const allQuery = useQuery({
    queryKey: ['products', { page }],
    queryFn: () => listProducts({ page, limit: PAGE_LIMIT }),
    enabled: tab === 'all',
  })

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; flags: { isOffer?: boolean; isSelected?: boolean } }) =>
      patchProductFlags(input.id, input.flags),
    onSuccess: (result) => {
      message.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['offers-public'] })
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  const isLoading =
    (tab === 'all' ? allQuery : publicQuery).isPending ||
    (tab === 'all' ? allQuery : publicQuery).isFetching

  const data = tab === 'all' ? allQuery : publicQuery
  const items = data.data?.items ?? []
  const total = data.data?.total ?? 0

  function handleTableChange(pagination: TablePaginationConfig) {
    setPage(pagination.current ?? 1)
  }

  function changeTab(next: OffersTab) {
    setTab(next)
    setPage(1)
  }

  const columns = [
    {
      title: 'الصورة',
      key: 'image',
      width: 80,
      render: (_: unknown, product: Product) => (
        <Image
          src={resolveMediaUrl(product.images[0]) ?? NO_IMAGE_PLACEHOLDER}
          width={56}
          height={56}
          style={{ objectFit: 'cover', borderRadius: 4 }}
          preview={false}
          fallback={NO_IMAGE_PLACEHOLDER}
        />
      ),
    },
    {
      title: 'المنتج',
      dataIndex: 'name',
      key: 'name',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      title: 'السعر',
      dataIndex: 'price',
      key: 'price',
      render: (value: number) => formatCurrency(value),
    },
    {
      title: 'المخزون',
      dataIndex: 'stock',
      key: 'stock',
      render: (value: number) =>
        value > 0 ? (
          <Tag color="green">متوفر {value}</Tag>
        ) : (
          <Tag color="default">نفدت الكمية</Tag>
        ),
    },
    {
      title: 'الحالة',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (value: boolean) =>
        value ? <Tag color="green">نشط</Tag> : <Tag color="default">غير نشط</Tag>,
    },
    {
      title: 'العرض',
      key: 'isOffer',
      width: 90,
      render: (_: unknown, product: Product) =>
        tab === 'all' ? (
          <Tooltip
            title={
              product.isActive
                ? undefined
                : 'المنتج غير نشط — لا يمكن تغيير حالاته (الخادم لا يكشف خيارات المنتجات المعطّلة)'
            }
          >
            <Switch
              checked={product.isOffer}
              disabled={!product.isActive}
              loading={
                toggleMutation.isPending &&
                toggleMutation.variables?.id === product.id
              }
              onChange={(checked) =>
                toggleMutation.mutate({ id: product.id, flags: { isOffer: checked } })
              }
            />
          </Tooltip>
        ) : product.isOffer ? (
          <Tag color="gold">عرض</Tag>
        ) : (
          <Tag color="default">—</Tag>
        ),
    },
    {
      title: 'مختارة',
      key: 'isSelected',
      width: 90,
      render: (_: unknown, product: Product) =>
        tab === 'all' ? (
          <Tooltip
            title={
              product.isActive
                ? undefined
                : 'المنتج غير نشط — لا يمكن تغيير حالاته (الخادم لا يكشف خيارات المنتجات المعطّلة)'
            }
          >
            <Switch
              checked={product.isSelected}
              disabled={!product.isActive}
              loading={
                toggleMutation.isPending &&
                toggleMutation.variables?.id === product.id
              }
              onChange={(checked) =>
                toggleMutation.mutate({ id: product.id, flags: { isSelected: checked } })
              }
            />
          </Tooltip>
        ) : product.isSelected ? (
          <Tag color="blue">مختارة</Tag>
        ) : (
          <Tag color="default">—</Tag>
        ),
    },
    {
      title: 'الإجراءات',
      key: 'actions',
      width: 150,
      render: (_: unknown, product: Product) => {
        if (tab === 'all') return null
        const removeFlag =
          tab === 'offer' ? { isOffer: false } : { isSelected: false }
        return (
          <Button
            size="small"
            loading={
              toggleMutation.isPending &&
              toggleMutation.variables?.id === product.id
            }
            onClick={() => toggleMutation.mutate({ id: product.id, flags: removeFlag })}
          >
            إزالة من {tab === 'offer' ? 'العروض' : 'المختارة'}
          </Button>
        )
      },
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            العروض والمختارة
          </Typography.Title>
          <Typography.Text type="secondary">
            إدارة منتجات العروض والمنتجات المختارة في الصفحة الرئيسية.
          </Typography.Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={isLoading}
          onClick={() => (tab === 'all' ? allQuery : publicQuery).refetch()}
        >
          تحديث
        </Button>
      </Flex>

      <Alert
        type="info"
        showIcon
        message="المنتجات غير النشطة تظهر في «كل المنتجات» فقط."
        description="قوائم العروض والمختارة تستخدم فلاتر المتجر العامة التي تعرض المنتجات النشطة فقط، والمنتجات المعطّلة لا يمكن تغيير عروضها/اختيارها لأن الخادم لا يكشف خياراتها."
      />

      <Card>
        <Segmented
          options={(Object.keys(TAB_LABELS) as OffersTab[]).map((key) => ({
            value: key,
            label: TAB_LABELS[key],
          }))}
          value={tab}
          onChange={(value) => changeTab(value as OffersTab)}
          block
          style={{ marginBottom: 16 }}
        />
        {data.isError ? (
          <Alert
            type="error"
            showIcon
            message="تعذر تحميل المنتجات"
            description={data.error.message}
            action={
              <Button size="small" onClick={() => data.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={items}
            loading={isLoading}
            scroll={{ x: 980 }}
            pagination={{
              current: page,
              pageSize: PAGE_LIMIT,
              total,
              showSizeChanger: false,
              showTotal: (count) => `${count} منتج`,
            }}
            onChange={handleTableChange}
            locale={{
              emptyText: (
                <EmptyState
                  description={
                    tab === 'all'
                      ? 'لا توجد منتجات'
                      : 'لا توجد منتجات في هذا القسم — فعّل منتجات من قسم «كل المنتجات» أولاً'
                  }
                />
              ),
            }}
          />
        )}
      </Card>
    </Space>
  )
}