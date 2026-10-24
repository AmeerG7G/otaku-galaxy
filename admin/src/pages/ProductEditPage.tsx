import { useEffect, useRef, useState } from 'react'
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
import ProductCostCard from '../components/ProductCostCard'
import ProductForm, { type ProductFormValues } from '../components/ProductForm'
import { useAdminProfile } from '../hooks/useAdminProfile'
import { getProductForEdit, updateProduct, type ProductForEdit } from '../api/productsApi'
import { ApiError } from '../api/client'

/**
 * كل ما يخصّ منتجاً (النموذج، أساس المقارنة، الحفظ) يُبنى من جديد لكل منتج.
 *
 * [CRITICAL] React Router يبقي الصفحة نفسها حين يتغيّر `:id` وحده (التنقّل
 * بقائمة «رجوع» في المتصفح بين صفحتي تعديل). كانت نسخة النموذج تعيش في الصفحة
 * فتبقى قيم المنتج السابق، والحفظ يكتبها فوق المنتج الحالي.
 */
export default function ProductEditPage() {
  const { id = '' } = useParams()
  return <ProductEditor key={id} id={id} />
}

function ProductEditor({ id }: { id: string }) {
  const navigate = useNavigate()
  const profile = useAdminProfile()
  const queryClient = useQueryClient()

  // كل فتحٍ يقرأ من الخادم: لا تحديث في الخلفية، ولا نسخة مخبّأة بعد الإغلاق
  // (الحذف عند الإغلاق نفسه لا بعد مهلة `gcTime`، فالعودة السريعة لا تسبقه).
  const editQuery = useQuery({
    queryKey: ['product-edit', id],
    queryFn: () => getProductForEdit(id),
    enabled: Boolean(id),
    staleTime: Infinity,
    refetchOnReconnect: false,
  })
  useEffect(() => () => queryClient.removeQueries({ queryKey: ['product-edit', id] }), [queryClient, id])

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

      {editQuery.data && <LoadedProductEditor id={id} loaded={editQuery.data} />}

      {/* [D1] تكلفة الشراء تكشف الهامش — للمسؤول الأعلى وحده. */}
      {editQuery.data && profile.data?.isSuperAdmin && <ProductCostCard productId={id} />}
    </div>
  )
}

/**
 * [CRITICAL] أساس المقارنة هو ما بُني عليه النموذج، لا آخر ما جلبه الاستعلام.
 *
 * النموذج يقرأ قيمه مرةً عند التركيب. كان `expectedStock` يُؤخذ من الاستعلام
 * الحيّ، فأي جلبٍ له لاحقاً (عودة الاتصال، زرّ «إعادة المحاولة»، إبطالٌ من صفحة
 * أخرى) يقدّم المقارنة إلى قيمة الخادم والحقلُ على القديمة، فيقبل الخادم ويكتب
 * القديمة: قطعٌ مستهلكة تعود إلى البيع. ومثله `optionsLoaded`: انقلابه بعد
 * إعادة القراءة كان يرسل خيارات النموذج الفارغة فيمحو خيارات المنتج.
 *
 * الأساس هنا يُلتقط عند التركيب ولا يتغيّر إلا مع الحقل نفسه بعد `STOCK_CHANGED`.
 */
function LoadedProductEditor({ id, loaded }: { id: string; loaded: ProductForEdit }) {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<ProductFormValues>()
  const [draft] = useState(loaded.draft)
  const [base, setBase] = useState(() => ({ stock: loaded.draft.stock, optionsLoaded: loaded.optionsLoaded }))
  const open = useRef(true)
  useEffect(() => {
    open.current = true
    return () => {
      open.current = false
    }
  }, [])

  const updateMutation = useMutation({
    mutationFn: (input: { payload: Parameters<typeof updateProduct>[1] }) =>
      updateProduct(id, input.payload),
    onSuccess: (result) => {
      message.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.removeQueries({ queryKey: ['product-edit', id] })
      navigate('/products')
    },
    onError: (error, input) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
      // المخزون تغيّر منذ فتح الصفحة: نقرأ المنتج ونضع المخزون الحالي في الحقل
      // وفي الأساس معاً، فيرى المسؤول القيمة ويقرّر، والحفظ التالي يقارن بها.
      // القراءة مباشرةً من الخادم لا عبر الاستعلام (لا نسخة مخبّأة تبقى بعد
      // الإغلاق)، وفقط والصفحة مفتوحة. قيمةٌ كتبها المسؤول أثناء القراءة له:
      // لا يُستبدل إلا ما رُفض. تعذّرت القراءة؟ الأساس يبقى، فيرفض الخادم مجدداً.
      if (error instanceof ApiError && error.code === 'STOCK_CHANGED' && open.current) {
        const rejected = input.payload.stock
        void getProductForEdit(id)
          .then((fresh) => {
            if (!open.current) return
            setBase((current) => ({ ...current, stock: fresh.draft.stock }))
            if (form.getFieldValue('stock') === rejected) form.setFieldValue('stock', fresh.draft.stock)
          })
          .catch(() => {})
      }
    },
  })

  function handleSubmit(values: ProductFormValues) {
    const optionsLoaded = base.optionsLoaded
    // [CRITICAL] المخزون يُرسَل فقط إن غيّره المسؤول، ومعه القيمة التي فُتحت
    // عليها الصفحة. كانت الصفحة تعيد إرسال المخزون في كل حفظ، فتعديلُ وصفٍ
    // بعد قبول طلبٍ في تبويبٍ آخر كان يُرجع القطع المستهلكة إلى البيع (بيعٌ
    // فوق المخزون). الخادم يرفض بـ`STOCK_CHANGED` إن تغيّر المخزون منذ الفتح.
    // `loadedStock` هو ما بُني عليه الحقل (انظر `LoadedProductEditor`).
    const loadedStock = base.stock
    const stockChanged = values.stock !== loadedStock
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
      ...(stockChanged ? { stock: values.stock, expectedStock: loadedStock } : {}),
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
    <ProductForm
      form={form}
      mode="edit"
      initialValues={draft}
      optionsAvailable={base.optionsLoaded}
      submitting={updateMutation.isPending}
      onSubmit={handleSubmit}
      onCancel={() => navigate('/products')}
    />
  )
}
