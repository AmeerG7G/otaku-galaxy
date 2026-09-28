import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Flex,
  Spin,
  Typography,
} from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import ProductForm, { type ProductFormValues } from '../components/ProductForm'
import { getProductForEdit, updateProduct } from '../api/productsApi'
import { ApiError } from '../api/client'

export default function ProductEditPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const editQuery = useQuery({
    queryKey: ['product-edit', id],
    queryFn: () => getProductForEdit(id),
    enabled: Boolean(id),
  })

  const updateMutation = useMutation({
    mutationFn: (input: { payload: Parameters<typeof updateProduct>[1] }) =>
      updateProduct(id, input.payload),
    onSuccess: (result) => {
      message.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      navigate('/products')
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  function handleSubmit(values: ProductFormValues) {
    const optionsLoaded = editQuery.data?.optionsLoaded ?? true
    // [CRITICAL] المنتج المعطّل لا يوفّر الخادم خياراته للوحة، والحقلُ
    // الغائب عن `PATCH` لا يُمسّ على الخادم (`adminProductUpdateSchema`).
    // كانت الصفحة ترسل `options: []` صراحةً فتمسح الخيارات المحفوظة خلف
    // نافذة تأكيد تبرّر المسح بخللٍ في الخادم زال منذ زمن. الآن لا يُرسَل
    // الحقل أصلاً، فتبقى الخيارات كما هي في القاعدة.
    const payload = {
      // [CRITICAL] كل لغة في حقليها وحدهما — لا نسخ بين اللغتين. حقلٌ فارغ
      // (نصٌّ ناقص في منتجٍ قديم لم يُكمَل) لا يُرسَل: الحقل الغائب لا يُمسّ
      // على الخادم، فيبقى «ناقصاً» صراحةً بدل أن يُكتب فراغاً (والخادم يرفض
      // الفراغ أصلاً). ما كان مكتوباً إلزاميٌّ في النموذج فيُرسَل دائماً.
      ...(values.nameAr ? { nameAr: values.nameAr } : {}),
      ...(values.descriptionAr ? { descriptionAr: values.descriptionAr } : {}),
      ...(values.nameCkb ? { nameCkb: values.nameCkb } : {}),
      ...(values.descriptionCkb ? { descriptionCkb: values.descriptionCkb } : {}),
      price: values.price,
      categoryId: values.categoryId,
      subcategoryId: values.subcategoryId ?? null,
      stock: values.stock,
      // `null` صريحة تمسح الموعد؛ الحقل الغائب يعني «لا تغيّر».
      restockAt: values.restockAt ?? null,
      images: values.images,
      ...(optionsLoaded ? { options: values.options } : {}),
      isOffer: values.isOffer,
      isSelected: values.isSelected,
      isActive: values.isActive,
      // التقييم وعدده مشتقان من تقييمات العملاء المنشورة — لا نرسلهما.
      previousPrice: values.previousPrice ?? null,
      hasDeliveryPromo: values.hasDeliveryPromo ?? false,
      deliveryPromoAmount: values.hasDeliveryPromo
        ? (values.deliveryPromoAmount ?? 0)
        : 0,
      franchiseIds: values.franchiseIds ?? [],
    }
    updateMutation.mutate({ payload })
  }

  return (
    <div style={{ maxWidth: 860, width: '100%' }}>
      <Breadcrumb
        items={[
          { title: <Link to="/products">المنتجات</Link> },
          { title: 'تعديل منتج' },
        ]}
      />
      <div style={{ height: 12 }} />
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          تعديل منتج
        </Typography.Title>
        <Button icon={<ArrowRightOutlined />} onClick={() => navigate('/products')}>
          العودة إلى المنتجات
        </Button>
      </Flex>
      <div style={{ height: 16 }} />

      {editQuery.isPending && (
        <Flex justify="center" style={{ paddingTop: 80 }}>
          <Spin size="large" description="جارٍ تحميل المنتج…">
            <div style={{ width: 120, height: 60 }} />
          </Spin>
        </Flex>
      )}

      {editQuery.isError && (
        <Alert
          type="error"
          showIcon
          message="تعذر تحميل المنتج"
          description={editQuery.error.message}
          action={
            <Button onClick={() => editQuery.refetch()}>إعادة المحاولة</Button>
          }
        />
      )}

      {editQuery.data && (
        <ProductForm
          key={id}
          mode="edit"
          initialValues={editQuery.data.draft}
          optionsAvailable={editQuery.data.optionsLoaded}
          submitting={updateMutation.isPending}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/products')}
        />
      )}
    </div>
  )
}