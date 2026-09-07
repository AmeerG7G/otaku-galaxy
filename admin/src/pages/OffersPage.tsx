import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Segmented,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { TablePaginationConfig } from 'antd'
import { listProducts, patchProductFlags } from '../api/productsApi'
import { ApiError } from '../api/client'
import type { Product } from '../types/products'
import { formatCurrency } from '../utils/format'
import EmptyState from '../components/EmptyState'
import { MediaThumb } from '../components/ui/MediaThumb'
import { PageHeader } from '../components/ui/PageHeader'

const PAGE_LIMIT = 12

type OffersTab = 'offer' | 'selected' | 'all'

const TAB_LABELS: Record<OffersTab, string> = {
  offer: 'العروض',
  selected: 'المختارة',
  all: 'كل المنتجات',
}

/**
 * معايير القسم المعروض.
 *
 * [CRITICAL] الأقسام الثلاثة تقرأ من `/admin/products` وحده. كانت «العروض»
 * و«المختارة» تُقرآن من `/catalog/products` العام، وهو يستبعد المنتجات
 * المعطّلة بحكم كونه واجهة المتجر — فمنتجٌ معطّل مرفوع كعرض كان يغيب عن
 * الشاشة التي تديره، ولا سبيل لإزالته منها. مصدرٌ واحد يعني أيضاً شكل استجابة
 * واحداً بدل نوعٍ محلّي يوازي `ProductListResponse` ويتباعد عنه.
 */
function paramsFor(tab: OffersTab, page: number) {
  return {
    page,
    limit: PAGE_LIMIT,
    ...(tab === 'offer' ? { offer: 'true' as const } : {}),
    ...(tab === 'selected' ? { selected: 'true' as const } : {}),
  }
}

export default function OffersPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<OffersTab>('offer')
  const [page, setPage] = useState(1)

  // استعلامٌ واحد لكل الأقسام. استعلامان متوازيان بشرطَي `enabled` كانا
  // يتركان القسم غير المعروض عالقاً في `isPending` إلى الأبد، وهي حالةٌ
  // تُقرأ في الواجهة «جارٍ التحميل» بلا طلبٍ جارٍ.
  const productsQuery = useQuery({
    queryKey: ['products', 'offers', tab, page],
    queryFn: () => listProducts(paramsFor(tab, page)),
  })

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; flags: { isOffer?: boolean; isSelected?: boolean } }) =>
      patchProductFlags(input.id, input.flags),
    onSuccess: (result) => {
      message.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  const isLoading = productsQuery.isPending || productsQuery.isFetching
  const items = productsQuery.data?.items ?? []
  const total = productsQuery.data?.total ?? 0

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
        <MediaThumb reference={product.images[0]} />
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
      // التبديل متاح على المنتج المعطّل أيضاً: مسار الإدارة يقبله، والمنتج
      // المعطّل المرفوع كعرض هو بالضبط ما يحتاج المسؤول إزالته.
      render: (_: unknown, product: Product) =>
        tab === 'all' ? (
          <Switch
            checked={product.isOffer}
            loading={
              toggleMutation.isPending &&
              toggleMutation.variables?.id === product.id
            }
            onChange={(checked) =>
              toggleMutation.mutate({ id: product.id, flags: { isOffer: checked } })
            }
          />
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
          <Switch
            checked={product.isSelected}
            loading={
              toggleMutation.isPending &&
              toggleMutation.variables?.id === product.id
            }
            onChange={(checked) =>
              toggleMutation.mutate({ id: product.id, flags: { isSelected: checked } })
            }
          />
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
      <PageHeader
        title="العروض والمختارة"
        description="إدارة منتجات العروض والمنتجات المختارة في الصفحة الرئيسية."
        extra={
          <Button
            icon={<ReloadOutlined />}
            loading={isLoading}
            onClick={() => productsQuery.refetch()}
          >
            تحديث
          </Button>
        }
      />

      <Alert
        type="info"
        showIcon
        message="المنتجات غير النشطة تظهر هنا أيضاً."
        description="الأقسام الثلاثة تقرأ من قائمة الإدارة، فيظهر المنتج المعطّل المرفوع كعرض ويمكن إزالته منه. الزبائن لا يرون المنتجات غير النشطة في المتجر."
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
        {productsQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message="تعذر تحميل المنتجات"
            description={productsQuery.error.message}
            action={
              <Button size="small" onClick={() => productsQuery.refetch()}>
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