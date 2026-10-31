import {
  Alert,
  Button,
  Card,
  Divider,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Typography,
  type FormInstance,
} from 'antd'
import { useQuery } from '@tanstack/react-query'
import { listAdminCategories } from '../api/categoriesApi'
import { listFranchises } from '../api/communityApi'
import GalleryPreview from './GalleryPreview'
import ImagesEditor from './ImagesEditor'
import type { ReactNode } from 'react'
import OptionsEditor from './OptionsEditor'
import VariantsEditor from './VariantsEditor'
import { optionsFromFields, optionsToFields, type OptionFields } from './optionFields'
import { derivedStock, variantsFromFields, variantsToFields, type VariantFields } from './variantFields'
import type { ProductOptionInput, ProductVariantDraft } from '../types/products'
import { formatCurrency } from '../utils/format'
import { StoreDateInput } from './ui/StoreDateInput'
import { DATE_FORMAT_HINT, isIsoInstant, parseDateText, storeDateFieldToIso } from '../utils/storeDate'

export interface ProductFormValues {
  /**
   * محتوى المنتج بلغتين — أربعة حقول مستقلة يكتبها المسؤول بيده (هجرة ٠٦٦).
   * لا ترجمة آلية ولا نسخ بين اللغتين.
   */
  nameAr: string
  descriptionAr: string
  nameCkb: string
  descriptionCkb: string
  /**
   * `null` = «السعر يُعلن لاحقاً» (084) — يُرسَل `null` صريحةً، لا صفراً. مصدره
   * مفتاح `priceLater` في النموذج (انظر [normalizePricing]).
   */
  price: number | null
  /**
   * مفتاح النموذج وحده — لا يُرسَل. مُفعَّلاً: المنتج يُعرض في المتجر «قريباً —
   * السعر يُعلن لاحقاً» ولا يُشترى، ولا يراه التطبيق المثبَّت.
   */
  priceLater?: boolean
  /**
   * سعر قطعتين من المنتج نفسه وإن اختلف الخيار (085)؛ `null` = لا عرض. يتكرّر:
   * ٣ قطع = قطعتان + قطعة. بين سعر القطعة وضعفه، والخادم يفرضه أيضاً.
   */
  pairPrice?: number | null
  stock: number
  categoryId: string
  subcategoryId?: string | null
  images: string[]
  /** بلغتيه — `onSubmit` يتلقّى الحقلين الكرديين صريحين دائماً (`optionsFromFields`). */
  options: ProductOptionInput[]
  /**
   * الألوان مقصوصةً بالترتيب الظاهر (STEP 74). غير فارغة ⇒ `stock` لا يُرسَل:
   * مخزون المنتج مشتقٌّ من ألوانه (`STOCK_PER_VARIANT`).
   */
  variants: ProductVariantDraft[]
  isActive: boolean
  isOffer: boolean
  isSelected: boolean
  rating?: number | null
  reviewCount?: number
  /** السعر قبل الخصم — منه تُشتق نسبة الخصم والسعر المشطوب في التطبيق. */
  previousPrice?: number | null
  hasDeliveryPromo?: boolean
  deliveryPromoAmount?: number
  franchiseIds?: string[]
  /**
   * موعد التوفر المتوقَّع — ISO-8601 أو `null` («بلا موعد»).
   *
   * [CRITICAL] نفس حقل `products.restock_at` القائم منذ الهجرة ٠٣٤ ونفس
   * مسار التعديل — لا حقل «قريباً» جديد. الحالة مشتقّة لا مخزَّنة:
   * مخزون ٠ + موعد ⇒ «قريباً يتوفر»، ومخزون ٠ بلا موعد ⇒ «غير متوفر»،
   * وأي مخزون موجب ⇒ «متوفر» مهما بقي من مواعيد.
   */
  restockAt?: string | null
}

/**
 * ما يحمله النموذج فعلاً: كل قيمة خيارٍ صفٌّ بلغتيه (`OptionFields`) — حذفُ
 * قيمةٍ يحذف ترجمتها معها، فلا تنزاح الكردية إلى قيمةٍ أخرى.
 */
export type ProductFormStore = Omit<ProductFormValues, 'options' | 'variants'> & {
  options: OptionFields[]
  variants: VariantFields[]
}

/** حقول المحتوى الأربعة — تُقصّ قبل الإرسال كما يقصّها الخادم. */
const CONTENT_FIELDS = ['nameAr', 'descriptionAr', 'nameCkb', 'descriptionCkb'] as const

function trimContent(values: ProductFormStore): ProductFormValues {
  const trimmed: ProductFormValues = {
    ...values,
    options: optionsFromFields(values.options ?? []),
    variants: variantsFromFields(values.variants ?? []),
  }
  for (const field of CONTENT_FIELDS) {
    trimmed[field] = (values[field] ?? '').trim()
  }
  return normalizePricing(trimmed)
}

/**
 * «يُعلن لاحقاً» (084) يُفرغ الأسعار الثلاثة صراحةً: لا سعر قطعة، ولا «سعر قبل
 * الخصم»، ولا عرض قطعتين — القاعدة ترفض الأخيرين بلا سعر. الحقل الفارغ `null`
 * لا «غائب»، فالتعديل يمسح العرض المحفوظ بدل أن يُبقيه.
 */
function normalizePricing({ priceLater, ...values }: ProductFormValues): ProductFormValues {
  if (priceLater) return { ...values, price: null, previousPrice: null, pairPrice: null }
  return { ...values, price: values.price ?? null, pairPrice: values.pairPrice ?? null }
}

/**
 * قواعد حقل محتوى: `whitespace` تجعل المسافات وحدها «فارغاً»، والحدود حدود
 * الخادم نفسها (الاسم ٢..١٢٠، الوصف حتى ٣٠٠٠). لا قيد على الحروف.
 */
function contentRules(kind: 'name' | 'description', language: string, required: boolean) {
  const label = kind === 'name' ? 'اسم المنتج' : 'وصف المنتج'
  return [
    ...(required
      ? [{ required: true, whitespace: true, message: `${label} ب${language} مطلوب` }]
      : []),
    ...(kind === 'name'
      ? [
          { min: 2, message: `${label} ب${language} قصير جداً (حرفان كحد أدنى)` },
          { max: 120, message: `${label} ب${language} طويل جداً (١٢٠ حرفاً كحد أقصى)` },
        ]
      : [{ max: 3000, message: `${label} ب${language} طويل جداً (٣٠٠٠ حرف كحد أقصى)` }]),
  ]
}

interface ProductFormProps {
  mode: 'create' | 'edit'
  /** نسخة النموذج من الصفحة حين تحتاج أن تكتب في حقلٍ بعد التركيب. */
  form?: FormInstance<ProductFormStore>
  initialValues?: Partial<ProductFormValues>
  optionsAvailable: boolean
  submitting: boolean
  onSubmit: (values: ProductFormValues) => void
  onCancel: () => void
  /** مخزون كل لونٍ قائم كما فُتحت عليه الصفحة — للعرض («المخزون الحالي»). */
  variantStockBase?: Readonly<Record<string, number>>
  /** خطأٌ من آخر حفظ يبقى ظاهراً فوق الزرّ (شرح رموز الألوان). */
  submitError?: ReactNode
}

export default function ProductForm({
  mode,
  form: formFromPage,
  initialValues,
  optionsAvailable,
  submitting,
  onSubmit,
  onCancel,
  variantStockBase,
  submitError,
}: ProductFormProps) {
  const [form] = Form.useForm<ProductFormStore>(formFromPage)

  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: listAdminCategories,
  })

  const franchisesQuery = useQuery({
    queryKey: ['admin-franchises'],
    queryFn: listFranchises,
  })

  const selectedCategoryId = Form.useWatch('categoryId', form)
  const price = Form.useWatch('price', form)
  const previousPrice = Form.useWatch('previousPrice', form)
  const priceLater = Form.useWatch('priceLater', form) === true
  const pairPrice = Form.useWatch('pairPrice', form)
  const variantRows = (Form.useWatch('variants', form) ?? []) as VariantFields[]
  const hasVariants = variantRows.length > 0
  // فُتح ملوَّناً وأُزيلت ألوانه كلها: الخادم يعيده بلا ألوان بمخزون ٠ (أو يُبقيه
  // ملوَّناً إن عُطّل لونٌ سبق طلبه) — فلا يُرسَل مخزونٌ في هذا الحفظ.
  const loadedWithVariants = mode === 'edit' && (initialValues?.variants?.length ?? 0) > 0
  const productStockEditable = !hasVariants && !loadedWithVariants
  // ما يدفعه الزبون عن قطعتين — للعرض فقط، والحساب على الخادم (`pairPricedLineTotals`).
  const pairSaving =
    !priceLater && typeof price === 'number' && typeof pairPrice === 'number' && pairPrice < 2 * price
      ? 2 * price - pairPrice
      : null

  // النسبة معروضة فقط — مصدرها الحقيقي هو السعران على الخادم.
  const discountPercent =
    typeof price === 'number' &&
    typeof previousPrice === 'number' &&
    previousPrice > price &&
    previousPrice > 0
      ? Math.round(((previousPrice - price) / previousPrice) * 100)
      : null

  const selectedCategory = categoriesQuery.data?.items.find(
    (category) => category.id === selectedCategoryId,
  )

  // ═══ الإلزام ═══
  // العربية: إلزامية عند الإنشاء، وما كان مكتوباً لا يُفرَّغ بالتعديل (والناقص
  // في منتجٍ قديم اختياريٌّ مع تنبيه). الكردية اختيارية دائماً (المالك،
  // 2026-10-26): لا تحجب حفظاً ولا نشراً، والزبون الكردي يرى العربية بدلها —
  // ولا يُدفع المسؤول إلى نصٍّ مختلَق.
  const wasFilled = (field: (typeof CONTENT_FIELDS)[number]) =>
    Boolean((initialValues?.[field] ?? '').trim())
  const isRequired = (field: (typeof CONTENT_FIELDS)[number]) =>
    field.endsWith('Ar') && (mode === 'create' || wasFilled(field))
  const kurdishIncomplete =
    mode === 'edit' && (!wasFilled('nameCkb') || !wasFilled('descriptionCkb'))
  const arabicDescriptionEmpty = mode === 'edit' && !wasFilled('descriptionAr')

  function changeCategory(categoryId: string) {
    form.setFieldValue('categoryId', categoryId)
    form.setFieldValue('subcategoryId', undefined)
  }

  return (
    <Form<ProductFormStore>
      form={form}
      layout="vertical"
      requiredMark={false}
      initialValues={{
        ...initialValues,
        // منتجٌ محفوظ بلا سعر (084) يُفتح والمفتاح مُفعَّل. الإنشاء يبدأ مسعَّراً.
        priceLater: mode === 'edit' && initialValues?.price === null,
        options: optionsToFields(initialValues?.options ?? []),
        variants: variantsToFields(initialValues?.variants ?? []),
      }}
      onFinish={(values) =>
        onSubmit({
          ...trimContent(values),
          restockAt: storeDateFieldToIso(values.restockAt, initialValues?.restockAt),
        })
      }
      style={{ maxWidth: 760 }}
    >
      {!optionsAvailable && (
        <Alert
          type="warning"
          showIcon
          message="خيارات هذا المنتج غير متاحة للمنتجات غير النشطة في الخادم."
          description="الخيارات المحفوظة تبقى كما هي عند الحفظ ولا تُرسَل مع هذا النموذج. لتعديلها فعّل المنتج أولاً ثم افتحه من جديد."
          style={{ marginBottom: 16 }}
        />
      )}

      <Card
        title="العربية"
        variant="outlined"
        data-testid="content-ar"
        extra={<Typography.Text type="secondary">يظهر للزبون الذي يستعمل التطبيق بالعربية</Typography.Text>}
      >
        {arabicDescriptionEmpty && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="الوصف العربي فارغ لهذا المنتج"
          />
        )}
        <Form.Item
          name="nameAr"
          label="اسم المنتج بالعربي"
          rules={contentRules('name', 'العربية', isRequired('nameAr'))}
        >
          <Input lang="ar" dir="rtl" />
        </Form.Item>
        <Form.Item
          name="descriptionAr"
          label="وصف المنتج بالعربي"
          rules={contentRules('description', 'العربية', isRequired('descriptionAr'))}
          style={{ marginBottom: 0 }}
        >
          <Input.TextArea lang="ar" dir="rtl" rows={4} />
        </Form.Item>
      </Card>

      <Card
        title="الكردية"
        variant="outlined"
        data-testid="content-ckb"
        style={{ marginTop: 16 }}
        extra={
          <Typography.Text type="secondary">
            اختياري — سوراني يكتبه المسؤول، لا ترجمة آلية. الفارغ يُعرض بالعربية
          </Typography.Text>
        }
      >
        {kurdishIncomplete && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="الكردية ناقصة لهذا المنتج"
            description="الترجمة اختيارية — الزبون الكردي يراه بالعربية حتى تُكتب. اكتب الاسم والوصف بالكردية متى شئت ليظهر بلغته."
          />
        )}
        <Form.Item
          name="nameCkb"
          label="ناوی بەرهەم بە کوردی"
          tooltip="اسم المنتج بالكردية"
          rules={contentRules('name', 'الكردية', isRequired('nameCkb'))}
        >
          <Input lang="ckb" dir="rtl" />
        </Form.Item>
        <Form.Item
          name="descriptionCkb"
          label="وەسفی بەرهەم بە کوردی"
          tooltip="وصف المنتج بالكردية"
          rules={contentRules('description', 'الكردية', isRequired('descriptionCkb'))}
          style={{ marginBottom: 0 }}
        >
          <Input.TextArea lang="ckb" dir="rtl" rows={4} />
        </Form.Item>
      </Card>

      <Card title="السعر والمخزون" variant="outlined" style={{ marginTop: 16 }}>
        <Space size="large" wrap>
          <Form.Item
            name="priceLater"
            label="السعر يُعلن لاحقاً"
            valuePropName="checked"
            tooltip="يظهر المنتج في المتجر «قريباً — السعر يُعلن لاحقاً» ولا يُضاف إلى العربة. لا يظهر في التطبيق المثبَّت حتى يُسعَّر."
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="price"
            label="السعر"
            hidden={priceLater}
            rules={priceLater ? [] : [{ required: true, message: 'السعر مطلوب' }]}
          >
            <InputNumber
              min={0.01}
              style={{ width: 200 }}
              addonAfter="د.ع"
              precision={0}
            />
          </Form.Item>
          <Form.Item
            name="stock"
            label="المخزون"
            hidden={hasVariants}
            rules={productStockEditable ? [{ required: true, message: 'المخزون مطلوب' }] : []}
            extra={
              !hasVariants && loadedWithVariants
                ? 'أُزيلت الألوان كلها: يصبح المخزون ٠ بعد الحفظ — عدّله بعد ذلك.'
                : undefined
            }
          >
            <InputNumber
              min={0}
              max={100000}
              style={{ width: 200 }}
              precision={0}
              disabled={!productStockEditable}
            />
          </Form.Item>
          {hasVariants && (
            <Form.Item
              label="المخزون الكلّي"
              tooltip="مجموع مخزون الألوان النشطة — يُعدَّل من بطاقة «الألوان» لكل لونٍ على حدة."
            >
              <InputNumber
                aria-label="المخزون الكلّي"
                value={derivedStock(variantRows)}
                disabled
                style={{ width: 200 }}
              />
            </Form.Item>
          )}
          <Form.Item
            name="restockAt"
            label="متوقع التوفر"
            tooltip="اختياري. يظهر للزبون «قريباً يتوفر» مع هذا التاريخ ما دام المخزون صفراً."
            // يُكتب باليد `YYYY-MM-DD` (والتقويم بديل) — يومٌ في بغداد. الحقل يحمل
            // اللحظة المحمَّلة أو النصّ المكتوب؛ التحويل عند الحفظ
            // (`storeDateFieldToIso`): الفارغ `null` صريحة تمسح الموعد، واليوم
            // المكتوب منتصف ليله في بغداد، واليوم المحمَّل نفسه لا يُمسّ وقته.
            extra={`اختياري — ${DATE_FORMAT_HINT}`}
            rules={[
              {
                validator: (_, value?: string | null) => {
                  if (!value || isIsoInstant(value)) return Promise.resolve()
                  const parsed = parseDateText(value)
                  return parsed.kind === 'error'
                    ? Promise.reject(new Error(parsed.message))
                    : Promise.resolve()
                },
              },
            ]}
          >
            <StoreDateInput placeholder="بلا موعد (YYYY-MM-DD)" />
          </Form.Item>
        </Space>
        {priceLater && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message="قريباً — السعر يُعلن لاحقاً"
            description="يراه الزبون في المتجر بلا سعر ولا زرّ إضافة. أطفئ المفتاح واكتب السعر حين يُعلن."
          />
        )}
        <Form.Item
          noStyle
          shouldUpdate={(prev, next) =>
            prev.stock !== next.stock ||
            prev.restockAt !== next.restockAt ||
            prev.variants !== next.variants
          }
        >
          {({ getFieldValue }) => {
            // ما سيراه الزبون فعلاً — مشتقٌّ بنفس قاعدة التطبيق، فلا يخمّن
            // المسؤول أثر ما أدخله. المنتج الملوَّن: مجموع ألوانه النشطة.
            const rows = (getFieldValue('variants') ?? []) as VariantFields[]
            const stock = rows.length > 0 ? derivedStock(rows) : Number(getFieldValue('stock') ?? 0)
            const at = getFieldValue('restockAt') as string | null | undefined
            const [text, type] =
              stock > 0
                ? ['متوفر — يمكن للزبون الشراء الآن', 'success' as const]
                : at
                  ? ['قريباً يتوفر — مع عرض التاريخ للزبون', 'warning' as const]
                  : ['غير متوفر — مع زر «أخبرني عند توفره»', 'info' as const]
            return (
              <Alert
                type={type}
                showIcon
                style={{ marginTop: 12 }}
                message={`حالة الزبون: ${text}`}
                description={
                  stock > 0 && at
                    ? 'المخزون يتقدّم على الموعد: لن يُعرض التاريخ ما دام المنتج متوفراً.'
                    : undefined
                }
              />
            )
          }}
        </Form.Item>
      </Card>

      <Card title="التصنيف" variant="outlined" style={{ marginTop: 16 }}>
        <Space size="large" wrap>
          <Form.Item
            name="categoryId"
            label="القسم"
            rules={[{ required: true, message: 'اختر القسم' }]}
          >
            <Select
              style={{ width: 260 }}
              placeholder="اختر القسم"
              loading={categoriesQuery.isPending}
              options={(categoriesQuery.data?.items ?? []).map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              onChange={changeCategory}
            />
          </Form.Item>
          <Form.Item name="subcategoryId" label="القسم الفرعي">
            <Select
              style={{ width: 260 }}
              placeholder={selectedCategory ? 'اختر القسم الفرعي (اختياري)' : 'اختر القسم أولاً'}
              disabled={!selectedCategory}
              allowClear
              options={(selectedCategory?.subcategories ?? []).map((subcategory) => ({
                value: subcategory.id,
                label: subcategory.name,
              }))}
            />
          </Form.Item>
        </Space>
      </Card>

      <Card
        title="الصور العامة"
        variant="outlined"
        style={{ marginTop: 16 }}
        extra={<Typography.Text type="secondary">صورٌ إضافية للمنتج — صورة كل لونٍ تُرفع في قسم الألوان</Typography.Text>}
      >
        <ImagesEditor purpose="product" />
      </Card>

      <Card
        title="الألوان"
        variant="outlined"
        style={{ marginTop: 16 }}
        data-testid="variants-card"
        extra={<Typography.Text type="secondary">اختياري — حتى ٢٠ لوناً</Typography.Text>}
      >
        <VariantsEditor stockBase={variantStockBase} />
      </Card>

      <Card title="معرض المنتج كما يراه الزبون" variant="outlined" style={{ marginTop: 16 }}>
        <GalleryPreview />
      </Card>

      <Card title="الأنمي المرتبط" variant="outlined" style={{ marginTop: 16 }}>
        <Form.Item name="franchiseIds" style={{ marginBottom: 0 }}>
          <Select
            mode="multiple"
            allowClear
            placeholder="اختر أنمي واحداً أو أكثر"
            loading={franchisesQuery.isPending}
            options={(franchisesQuery.data?.items ?? []).map((franchise) => ({
              value: franchise.id,
              label: franchise.name,
            }))}
          />
        </Form.Item>
      </Card>

      <Card title="العرض والخصم" variant="outlined" style={{ marginTop: 16 }}>
        <Space size="large" wrap align="start">
          <Form.Item
            name="previousPrice"
            label="السعر قبل الخصم"
            tooltip="يجب أن يكون أعلى من السعر الحالي."
            dependencies={['priceLater']}
            rules={[
              {
                validator: (_rule, value: number | null) => {
                  if (value === null || value === undefined || form.getFieldValue('priceLater') === true) {
                    return Promise.resolve()
                  }
                  const current = form.getFieldValue('price') as number
                  return value > current
                    ? Promise.resolve()
                    : Promise.reject(new Error('يجب أن يكون أعلى من السعر الحالي'))
                },
              },
            ]}
          >
            <InputNumber
              min={0}
              style={{ width: 200 }}
              addonAfter="د.ع"
              precision={0}
              disabled={priceLater}
            />
          </Form.Item>
          <Form.Item label="نسبة الخصم المحسوبة">
            <Typography.Text strong style={{ fontSize: 18 }}>
              {discountPercent === null ? '—' : `${discountPercent}%`}
            </Typography.Text>
          </Form.Item>
          <Form.Item
            name="pairPrice"
            label="سعر قطعتين"
            tooltip="اختياري. سعر قطعتين من هذا المنتج وإن اختلف الخيار، ويتكرّر: ٣ قطع = قطعتان + قطعة. أقل من ضعف سعر القطعة ولا يقلّ عنه."
            dependencies={['price', 'priceLater']}
            rules={[
              {
                validator: (_rule, value: number | null | undefined) => {
                  // «يُعلن لاحقاً» يُفرغ الحقل عند الإرسال (`normalizePricing`) — لا يُحجب الحفظ.
                  if (value === null || value === undefined || form.getFieldValue('priceLater') === true) {
                    return Promise.resolve()
                  }
                  const current = form.getFieldValue('price') as number | null | undefined
                  if (typeof current !== 'number') return Promise.resolve()
                  if (value < current) return Promise.reject(new Error('لا يقلّ عن سعر القطعة الواحدة'))
                  if (value >= 2 * current) {
                    return Promise.reject(new Error('يجب أن يكون أقل من ضعف سعر القطعة — وإلا فلا توفير'))
                  }
                  return Promise.resolve()
                },
              },
            ]}
            extra={
              pairSaving !== null && typeof pairPrice === 'number' && typeof price === 'number'
                ? `قطعة ${formatCurrency(price)} · قطعتان ${formatCurrency(pairPrice)} (توفير ${formatCurrency(pairSaving)}) · ٣ قطع ${formatCurrency(pairPrice + price)}`
                : undefined
            }
          >
            <InputNumber
              min={0}
              style={{ width: 200 }}
              addonAfter="د.ع"
              precision={0}
              placeholder="بلا عرض"
              disabled={priceLater}
            />
          </Form.Item>
          {/* [CRITICAL] قرار STEP 70: التطبيقات المثبَّتة قبل إصدار سعر القطعتين تحسب
              السطر «السعر × الكمية» محلياً، فلا يُضبط عرضٌ في الإنتاج قبل نشر الإصدار
              الجديد ورفع «أدنى إصدار مدعوم» (deploy/README §14). */}
          {!priceLater && typeof pairPrice === 'number' ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16, maxWidth: 560 }}
              data-testid="pair-price-app-warning"
              message="تطبيقات أندرويد المثبَّتة قبل إصدار «سعر قطعتين» تعرض السعر × الكمية"
              description="تعرض ٨٠٠٠ لقطعتين بينما يُحسب الطلب بسعر القطعتين. في الإنتاج: لا تضبطه قبل نشر الإصدار الجديد على Google Play ثم رفع «أدنى إصدار مدعوم» من «تحديث التطبيق»."
            />
          ) : null}
          <Form.Item
            name="hasDeliveryPromo"
            label="ترويج توصيل"
            valuePropName="checked"
            tooltip="يخصم مبلغاً من رسوم التوصيل عن كل قطعة من هذا المنتج."
          >
            <Switch />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, next) =>
              prev.hasDeliveryPromo !== next.hasDeliveryPromo
            }
          >
            {({ getFieldValue }) =>
              getFieldValue('hasDeliveryPromo') ? (
                <Form.Item
                  name="deliveryPromoAmount"
                  label="قيمة خصم التوصيل / قطعة"
                  tooltip="يُخصم من رسوم التوصيل، وبحدّ أقصى قيمة الرسوم نفسها."
                  rules={[
                    {
                      required: true,
                      message: 'أدخل قيمة الخصم',
                    },
                    {
                      type: 'number',
                      min: 1,
                      message: 'القيمة يجب أن تكون أكبر من صفر',
                    },
                  ]}
                >
                  <InputNumber
                    min={0}
                    style={{ width: 200 }}
                    addonAfter="د.ع"
                    precision={0}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Space>
      </Card>

      <Card title="الخيارات" variant="outlined" style={{ marginTop: 16 }}>
        <OptionsEditor />
      </Card>

      <Card title="إعدادات العرض" variant="outlined" style={{ marginTop: 16 }}>
        <Space size="large" wrap>
          <Form.Item
            name="isOffer"
            label="هل المنتج عرض؟"
            valuePropName="checked"
            style={{ marginBottom: 0 }}
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="isSelected"
            label="هل المنتج مختار؟"
            valuePropName="checked"
            style={{ marginBottom: 0 }}
          >
            <Switch />
          </Form.Item>
          {mode === 'edit' && (
            <>
              <Form.Item
                name="isActive"
                label="نشط"
                valuePropName="checked"
                style={{ marginBottom: 0 }}
              >
                <Switch />
              </Form.Item>
              <Form.Item
                name="rating"
                label="التقييم"
                tooltip="يُحتسب تلقائياً من تقييمات العملاء المنشورة — التعديل اليدوي يُستبدل عند نشر أي تقييم."
                style={{ marginBottom: 0 }}
              >
                <InputNumber min={0} max={5} step={0.1} style={{ width: 120 }} disabled />
              </Form.Item>
              <Form.Item
                name="reviewCount"
                label="عدد التقييمات"
                tooltip="عدد التقييمات المنشورة لهذا المنتج."
                style={{ marginBottom: 0 }}
              >
                <InputNumber min={0} style={{ width: 120 }} precision={0} disabled />
              </Form.Item>
            </>
          )}
        </Space>
      </Card>

      <Divider style={{ margin: '16px 0' }} />
      {submitError}
      <Space>
        <Button type="primary" htmlType="submit" loading={submitting}>
          {mode === 'create' ? 'إضافة المنتج' : 'حفظ التعديلات'}
        </Button>
        <Button onClick={onCancel} disabled={submitting}>
          إلغاء
        </Button>
      </Space>
    </Form>
  )
}