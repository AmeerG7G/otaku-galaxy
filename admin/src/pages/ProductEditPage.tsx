import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Flex,
  Form,
  Spin,
  Typography,
} from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import ProductForm, { type ProductFormStore, type ProductFormValues } from '../components/ProductForm'
import { getProductForEdit, updateProduct } from '../api/productsApi'
import { ApiError } from '../api/client'

export default function ProductEditPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<ProductFormStore>()

  // [CRITICAL] النموذج يقرأ قيمه مرةً واحدة عند التركيب، و`expectedStock` يُؤخذ
  // من بيانات هذا الاستعلام: يجب أن تبقيا الشيء نفسه. كان تحديثٌ في الخلفية
  // (عودة الاتصال، أو فتح المنتج من جديد على نسخةٍ مخبّأة ثم جلبها) يقدّم
  // `expectedStock` إلى قيمة الخادم بينما الحقل يعرض القديمة، فيقبل الخادم
  // المقارنة ويكتب القيمة القديمة — يُرجع قطعاً مستهلكة إلى البيع أو يمحو
  // تخزيناً حفظه المسؤول نفسه قبل دقيقة. الآن: لا تحديث في الخلفية ما دامت
  // الصفحة مفتوحة، ولا نسخة مخبّأة بعد إغلاقها — كل فتحٍ يقرأ من الخادم.
  const editQuery = useQuery({
    queryKey: ['product-edit', id],
    queryFn: () => getProductForEdit(id),
    enabled: Boolean(id),
    staleTime: Infinity,
    refetchOnReconnect: false,
  })
  // الحذف عند الإغلاق نفسه، لا بعد مهلة (`gcTime`): العودة السريعة إلى المنتج
  // كانت تسبق المهلة فتركّب النموذج من النسخة القديمة.
  useEffect(() => () => queryClient.removeQueries({ queryKey: ['product-edit', id] }), [queryClient, id])

  const updateMutation = useMutation({
    mutationFn: (input: { payload: Parameters<typeof updateProduct>[1] }) =>
      updateProduct(id, input.payload),
    onSuccess: (result) => {
      message.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.removeQueries({ queryKey: ['product-edit', id] })
      navigate('/products')
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
      // المخزون تغيّر منذ فتح الصفحة: نعيد قراءة المنتج ونضع المخزون الحالي في
      // الحقل، فيرى المسؤول القيمة ويقرّر من جديد، والحفظ التالي يقارن بها.
      // بقية حقوله كما كتبها.
      if (error instanceof ApiError && error.code === 'STOCK_CHANGED') {
        void queryClient
          .fetchQuery({ queryKey: ['product-edit', id], queryFn: () => getProductForEdit(id), staleTime: 0 })
          .then((fresh) => form.setFieldValue('stock', fresh.draft.stock))
          .catch(() => {
            // تعذّرت القراءة: المقارنة تبقى على القيمة القديمة، فيرفض الخادم مجدداً.
          })
      }
    },
  })

  function handleSubmit(values: ProductFormValues) {
    const optionsLoaded = editQuery.data?.optionsLoaded ?? true
    // [CRITICAL] المخزون يُرسَل فقط إن غيّره المسؤول، ومعه القيمة التي فُتحت
    // عليها الصفحة. كانت الصفحة تعيد إرسال المخزون في كل حفظ، فتعديلُ وصفٍ
    // بعد قبول طلبٍ في تبويبٍ آخر كان يُرجع القطع المستهلكة إلى البيع (بيعٌ
    // فوق المخزون). الخادم يرفض بـ`STOCK_CHANGED` إن تغيّر المخزون منذ الفتح.
    // `loadedStock` هو ما بُني عليه الحقل (انظر خيارات الاستعلام أعلاه).
    const loadedStock = editQuery.data?.draft.stock
    const stockChanged = loadedStock === undefined || values.stock !== loadedStock
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
      ...(stockChanged
        ? {
            stock: values.stock,
            ...(loadedStock !== undefined ? { expectedStock: loadedStock } : {}),
          }
        : {}),
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
          form={form}
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