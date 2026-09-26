import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Input,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StarFilled,
} from '@ant-design/icons'
import { deleteProduct, listProducts } from '../api/productsApi'
import { listAdminCategories } from '../api/categoriesApi'
import { ApiError } from '../api/client'
import type { Product } from '../types/products'
import { formatCurrency } from '../utils/format'
import EmptyState from '../components/EmptyState'
import { MediaThumb } from '../components/ui/MediaThumb'
import { PageHeader } from '../components/ui/PageHeader'
import { useTableState } from '../hooks/useTableState'

const PAGE_LIMIT = 12

/** مهلة سكون الكتابة قبل إرسال البحث — نفس إيقاع صفحة العملاء. */
const SEARCH_DEBOUNCE_MS = 350

export default function ProductsPage() {
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const { page, setPage, value, setSearchParams } = useTableState()

  // الترشيح يأتي من الرابط، فيبقى المسار «قسم ← قسم فرعي ← منتجاته» قابلاً
  // للمشاركة والرجوع إليه بزرّ المتصفح.
  const categoryId = value('categoryId')
  const subcategoryId = value('subcategoryId')

  // البحث بالاسم: يُكتب محلياً، ويُدفع إلى الرابط (`q`) بعد سكون الكتابة،
  // ويعود بالقائمة إلى صفحتها الأولى — البقاء على الصفحة الخامسة بعد تضييق
  // النتائج يعرض جدولاً فارغاً بلا سبب ظاهر. البحث نفسه على الخادم.
  //
  // [CRITICAL] الرابط مصدرُ الحقيقة للبحث المُثبَت. `q` قد يتغيّر من خارج
  // الحقل — رجوع/تقدّم المتصفّح، رابط قسم، «عرض كل المنتجات» — وكان الحقل
  // يحتفظ بقيمته ثم تدفعها مهلةُ السكون إلى الرابط من جديد، فيعود بحثٌ قديم
  // يطمس ما اختاره المسؤول للتوّ. `lastPushed` يميّز صدى دفعتنا (يُتجاهَل،
  // فلا تُقاطَع الكتابة) عن تغيّرٍ خارجي (يُنسخ إلى الحقل).
  const search = value('q') ?? ''
  const [searchInput, setSearchInput] = useState(search)
  const lastPushed = useRef(search)

  useEffect(() => {
    if (search === lastPushed.current) return
    lastPushed.current = search
    setSearchInput(search)
  }, [search])

  useEffect(() => {
    const next = searchInput.trim()
    if (next === search) return
    const timer = setTimeout(() => {
      lastPushed.current = next
      // الصيغة الوظيفية تقرأ أحدث معاملات الرابط لحظةَ الدفع لا لحظةَ
      // الجدولة — فلا تُلتقط نسخةٌ قديمة ولا حاجة لإدراجها في الاعتماديات.
      setSearchParams((current) => {
        const nextParams = new URLSearchParams(current)
        if (next === '') nextParams.delete('q')
        else nextParams.set('q', next)
        nextParams.set('page', '1')
        return nextParams
      })
    }, SEARCH_DEBOUNCE_MS)
    // تغيّرُ `search` من الخارج أثناء السكون يُلغي المؤقّت هنا، ويُعيد
    // الأثرُ الأول ضبطَ الحقل — فلا تصل الدفعة العالقة إلى الرابط أبداً.
    return () => clearTimeout(timer)
  }, [searchInput, search, setSearchParams])

  const productsQuery = useQuery({
    queryKey: ['products', { page, categoryId, subcategoryId, q: search }],
    queryFn: () =>
      listProducts({
        page,
        limit: PAGE_LIMIT,
        ...(search ? { q: search } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(subcategoryId ? { subcategoryId } : {}),
      }),
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

  /** وصف الترشيح الجاري — يظهر في العنوان بدل جدول يبدو ناقصاً بلا سبب. */
  const activeScope = subcategoryId
    ? subcategoryNames.get(subcategoryId)
    : categoryId
      ? categoryNames.get(categoryId)
      : undefined

  const scopeSearch = new URLSearchParams({
    ...(categoryId ? { categoryId } : {}),
    ...(subcategoryId ? { subcategoryId } : {}),
  }).toString()

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
      render: (_: unknown, product: Product) => (
        <MediaThumb reference={product.images[0]} size={52} />
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
      <PageHeader
        title="المنتجات"
        description={
          activeScope
            ? `منتجات «${activeScope}»`
            : 'إدارة منتجات المتجر: إضافة، تعديل، تعطيل، والعروض والمختارات.'
        }
        extra={
          <Space wrap>
            {activeScope && (
              <Button onClick={() => setSearchParams({})}>عرض كل المنتجات</Button>
            )}
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
              // الترشيح الحالي يُمرَّر إلى نموذج الإضافة، فيبدأ المنتج الجديد
              // في القسم الذي كان المسؤول يتصفّحه بدل أن يعيد اختياره.
              onClick={() =>
                navigate({
                  pathname: '/products/new',
                  search: scopeSearch,
                })
              }
            >
              إضافة منتج
            </Button>
          </Space>
        }
      />

      <Card>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="ابحث باسم المنتج"
          aria-label="بحث المنتجات بالاسم"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          style={{ maxWidth: 360, marginBottom: 16 }}
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
            dataSource={productsQuery.data?.items ?? []}
            loading={productsQuery.isPending || productsQuery.isFetching}
            scroll={{ x: 1300 }}
            locale={{
              emptyText: (
                search ? (
                  <EmptyState description={`لا منتج يطابق «${search}»`} />
                ) : (
                  <EmptyState
                    description="لا توجد منتجات حالياً"
                    actionLabel="إضافة أول منتج"
                    onAction={() => navigate('/products/new')}
                  />
                )
              ),
            }}
            pagination={{
              current: page,
              pageSize: PAGE_LIMIT,
              total: productsQuery.data?.total ?? 0,
              showSizeChanger: false,
              showTotal: (total) => `إجمالي المنتجات: ${total}`,
              onChange: (nextPage) => setPage(nextPage),
            }}
          />
        )}
      </Card>
    </Space>
  )
}