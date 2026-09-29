import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Breadcrumb, Button, Flex, Typography } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import ProductForm, { type ProductFormValues } from '../components/ProductForm'
import { createProduct } from '../api/productsApi'
import { listAdminCategories } from '../api/categoriesApi'
import { ApiError } from '../api/client'

/**
 * إضافة منتج.
 *
 * يقبل `?categoryId=&subcategoryId=` فيبدأ النموذج بالقسم مختاراً. هذا هو
 * ما يجعل المسار «الأقسام ← قسم فرعي ← إضافة منتج» ينتهي بمنتج مرتبط
 * بالقسم الصحيح بدل أن يُعيد المسؤول اختياره ويخطئ. النموذج واحد لا اثنان:
 * لا مسار إنشاء ثانٍ يتباعد عن الأول.
 */
export default function ProductNewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const presetCategoryId = searchParams.get('categoryId') ?? undefined
  const presetSubcategoryId = searchParams.get('subcategoryId') ?? undefined

  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: listAdminCategories,
  })

  const presetCategory = (categoriesQuery.data?.items ?? []).find(
    (category) => category.id === presetCategoryId,
  )

  /** الرجوع إلى حيث بدأ المسؤول، بالترشيح نفسه. */
  const backSearch = searchParams.toString()
  const backTo = backSearch ? `/products?${backSearch}` : '/products'

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: (result) => {
      message.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      navigate(backTo)
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  function handleSubmit(values: ProductFormValues) {
    createMutation.mutate({
      // المحتوى باللغتين — الأربعة إلزامية ومقصوصة في النموذج.
      nameAr: values.nameAr,
      descriptionAr: values.descriptionAr,
      nameCkb: values.nameCkb,
      descriptionCkb: values.descriptionCkb,
      price: values.price,
      categoryId: values.categoryId,
      subcategoryId: values.subcategoryId ?? null,
      stock: values.stock,
      // `null` صريحة تمسح الموعد؛ الحقل الغائب يعني «لا تغيّر».
      restockAt: values.restockAt ?? null,
      images: values.images,
      options: values.options,
      isOffer: values.isOffer,
      isSelected: values.isSelected,
      previousPrice: values.previousPrice ?? null,
      hasDeliveryPromo: values.hasDeliveryPromo ?? false,
      deliveryPromoAmount: values.hasDeliveryPromo
        ? (values.deliveryPromoAmount ?? 0)
        : 0,
      franchiseIds: values.franchiseIds ?? [],
    })
  }

  return (
    <div style={{ maxWidth: 860, width: '100%' }}>
      <Breadcrumb
        items={[
          ...(presetCategory
            ? [{ title: <Link to="/categories">الأقسام</Link> }]
            : []),
          { title: <Link to={backTo}>المنتجات</Link> },
          { title: 'إضافة منتج' },
        ]}
      />
      <div style={{ height: 12 }} />
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          إضافة منتج
        </Typography.Title>
        <Button icon={<ArrowRightOutlined />} onClick={() => navigate(backTo)}>
          العودة إلى المنتجات
        </Button>
      </Flex>
      <div style={{ height: 16 }} />
      <ProductForm
        // النموذج يُبنى بعد وصول الأقسام حتى تصل القيم المبدئية معه —
        // ضبطها بعد التركيب يتركها فارغة في الحقل الذي يراه المسؤول.
        key={presetCategoryId ?? 'blank'}
        mode="create"
        optionsAvailable
        initialValues={{
          nameAr: '',
          descriptionAr: '',
          nameCkb: '',
          descriptionCkb: '',
          categoryId: presetCategoryId,
          subcategoryId: presetSubcategoryId ?? null,
          images: [],
          options: [],
          isOffer: false,
          isSelected: false,
          hasDeliveryPromo: false,
          deliveryPromoAmount: 0,
          previousPrice: null,
          franchiseIds: [],
        }}
        submitting={createMutation.isPending}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/products')}
      />
    </div>
  )
}