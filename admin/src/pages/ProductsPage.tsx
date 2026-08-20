import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  Image,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  StarFilled,
} from '@ant-design/icons'
import { deleteProduct, listProducts } from '../api/productsApi'
import { listAdminCategories } from '../api/categoriesApi'
import { ApiError } from '../api/client'
import type { Product } from '../types/products'
import { formatCurrency } from '../utils/format'
import EmptyState from '../components/EmptyState'

const PAGE_LIMIT = 12

const NO_IMAGE_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#f5f5f5"/><text x="32" y="36" font-size="12" text-anchor="middle" fill="#aaa">لا صورة</text></svg>',
  )

function readPage(value: string | null): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

export default function ProductsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()

  const page = readPage(searchParams.get('page'))

  const productsQuery = useQuery({
    queryKey: ['products', { page }],
    queryFn: () => listProducts({ page, limit: PAGE_LIMIT }),
  })

  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: listAdminCategories,
  })

  const categoryNames = new Map(
    (categoriesQuery.data?.items ?? []).map((category) => [category.id, category.name]),
  )
  const subcategoryNames = new Map(
    (categoriesQuery.data?.items ?? []).flatMap((category) =>
      category.subcategories.map((subcategory) => [subcategory.id, subcategory.name] as const),
    ),
  )

  const deactivateMutation = useMutation({
    mutationFn: (product: Product) => deleteProduct(product.id),
    onSuccess: (messageText) => {
      message.success(messageText)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  function confirmDeactivate(product: Product) {
    modal.confirm({
      title: 'هل أنت متأكد من تعطيل المنتج؟',
      content: `«${product.name}» — لن يظهر المنتج للزبائن، ولن يتم حذفه من قاعدة البيانات.`,
      okText: 'تعطيل المنتج',
      okButtonProps: { danger: true },
      cancelText: 'إلغاء',
      onOk: () => deactivateMutation.mutateAsync(product),
    })
  }

  const columns = [
    {
      title: 'الصورة',
      key: 'image',
      width: 80,
      render: (_: unknown, product: Product) =>
        product.images[0] ? (
          <Image
            src={product.images[0]}
            width={56}
            height={56}
            style={{ objectFit: 'cover', borderRadius: 4 }}
            preview={false}
            fallback={NO_IMAGE_PLACEHOLDER}
          />
        ) : (
          <Image
            src={NO_IMAGE_PLACEHOLDER}
            width={56}
            height={56}
            style={{ borderRadius: 4 }}
            preview={false}
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
      title: 'القسم',
      key: 'category',
      render: (_: unknown, product: Product) =>
        categoryNames.get(product.categoryId) ?? '—',
    },
    {
      title: 'القسم الفرعي',
      key: 'subcategory',
      render: (_: unknown, product: Product) =>
        product.subcategoryId ? subcategoryNames.get(product.subcategoryId) ?? '—' : '—',
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
        value === 0 ? (
          <Tag color="red">نفدت الكمية</Tag>
        ) : (
          <Tag color="green">متوفر ({value})</Tag>
        ),
    },
    {
      title: 'التقييم',
      key: 'rating',
      render: (_: unknown, product: Product) => (
        <Space size={4}>
          <StarFilled style={{ color: '#faad14' }} />
          <span>{product.rating !== null ? product.rating.toFixed(1) : '—'}</span>
          <Typography.Text type="secondary">
            ({product.reviewCount})
          </Typography.Text>
        </Space>
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
      dataIndex: 'isOffer',
      key: 'isOffer',
      render: (value: boolean) => (value ? <Tag color="magenta">نعم</Tag> : 'لا'),
    },
    {
      title: 'المختار',
      dataIndex: 'isSelected',
      key: 'isSelected',
      render: (value: boolean) => (value ? <Tag color="geekblue">نعم</Tag> : 'لا'),
    },
    {
      title: 'الإجراءات',
      key: 'actions',
      width: 170,
      render: (_: unknown, product: Product) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/products/${product.id}/edit`)}
          >
            تعديل
          </Button>
          {product.isActive ? (
            <Button
              size="small"
              danger
              loading={deactivateMutation.isPending && deactivateMutation.variables?.id === product.id}
              onClick={() => confirmDeactivate(product)}
            >
              تعطيل
            </Button>
          ) : (
            <Link to={`/products/${product.id}/edit`}>
              <Button size="small">تفعيل</Button>
            </Link>
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
            المنتجات
          </Typography.Title>
          <Typography.Text type="secondary">
            إدارة منتجات المتجر: إضافة، تعديل، تعطيل، والعروض والمختارات.
          </Typography.Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            loading={productsQuery.isFetching}
            onClick={() => productsQuery.refetch()}
          >
            تحديث
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/products/new')}
          >
            إضافة منتج
          </Button>
        </Space>
      </Flex>

      <Card>
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
            dataSource={productsQuery.data?.items ?? []}
            loading={productsQuery.isPending || productsQuery.isFetching}
            scroll={{ x: 1300 }}
            locale={{
              emptyText: (
                <EmptyState
                  description="لا توجد منتجات حالياً"
                  actionLabel="إضافة أول منتج"
                  onAction={() => navigate('/products/new')}
                />
              ),
            }}
            pagination={{
              current: page,
              pageSize: PAGE_LIMIT,
              total: productsQuery.data?.total ?? 0,
              showSizeChanger: false,
              showTotal: (total) => `إجمالي المنتجات: ${total}`,
              onChange: (nextPage) =>
                setSearchParams(nextPage === 1 ? {} : { page: String(nextPage) }),
            }}
          />
        )}
      </Card>
    </Space>
  )
}