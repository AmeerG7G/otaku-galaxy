import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Breadcrumb, Button, Flex, Typography } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import ProductForm, { type ProductFormValues } from '../components/ProductForm'
import { createProduct } from '../api/productsApi'
import { listAdminCategories } from '../api/categoriesApi'
import { ApiError } from '../api/client'
import { variantErrorHint, variantsCreate } from '../components/variantFields'

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
  const [submitError, setSubmitError] = useState<{ message: string; hint: string } | null>(null)

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
      const hint = error instanceof ApiError ? variantErrorHint(error.code) : null
      setSubmitError(hint ? { message: (error as ApiError).message, hint } : null)
    },
  })

  function handleSubmit(values: ProductFormValues) {
    setSubmitError(null)
    const hasVariants = values.variants.length > 0
    createMutation.mutate({
      // المحتوى باللغتين — العربية إلزامية؛ الكردية الفارغة `null` (لا ترجمة،
      // الزبون الكردي يرى العربية). النموذج يقصّ الأربعة.
      nameAr: values.nameAr,
      descriptionAr: values.descriptionAr,
      nameCkb: values.nameCkb || null,
      descriptionCkb: values.descriptionCkb || null,
      // `null` = «السعر يُعلن لاحقاً» (084)؛ النموذج يُفرغ معه العرضين.
      price: values.price,
      pairPrice: values.pairPrice ?? null,
      variantKind: values.variantKind ?? 'color',
      categoryId: values.categoryId,
      subcategoryId: values.subcategoryId ?? null,
      // [CRITICAL] منتجٌ ملوَّن: مخزونه مجموع ألوانه — `stock` معه يُرفض
      // (`STOCK_PER_VARIANT`)، فلا يُرسَل أصلاً.
      ...(hasVariants ? { variants: variantsCreate(values.variants) } : { stock: values.stock }),
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
          variants: [],
          isOffer: false,
          isSelected: false,
          hasDeliveryPromo: false,
          deliveryPromoAmount: 0,
          previousPrice: null,
          pairPrice: null,
          variantKind: 'color',
          franchiseIds: [],
        }}
        submitting={createMutation.isPending}
        submitError={
          submitError && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              data-testid="product-submit-error"
              message={submitError.message}
              description={submitError.hint}
            />
          )
        }
        onSubmit={handleSubmit}
        onCancel={() => navigate('/products')}
      />
    </div>
  )
}