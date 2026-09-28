import {
  Alert,
  Button,
  DatePicker,
  Card,
  Divider,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import { listAdminCategories } from '../api/categoriesApi'
import { listFranchises } from '../api/communityApi'
import ImagesEditor from './ImagesEditor'
import OptionsEditor from './OptionsEditor'

export interface ProductFormValues {
  /**
   * محتوى المنتج بلغتين — أربعة حقول مستقلة يكتبها المسؤول بيده (هجرة ٠٦٦).
   * لا ترجمة آلية ولا نسخ بين اللغتين.
   */
  nameAr: string
  descriptionAr: string
  nameCkb: string
  descriptionCkb: string
  price: number
  stock: number
  categoryId: string
  subcategoryId?: string | null
  images: string[]
  options: { name: string; values: string[] }[]
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

/** حقول المحتوى الأربعة — تُقصّ قبل الإرسال كما يقصّها الخادم. */
const CONTENT_FIELDS = ['nameAr', 'descriptionAr', 'nameCkb', 'descriptionCkb'] as const

function trimContent(values: ProductFormValues): ProductFormValues {
  const trimmed = { ...values }
  for (const field of CONTENT_FIELDS) {
    trimmed[field] = (values[field] ?? '').trim()
  }
  return trimmed
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
  initialValues?: Partial<ProductFormValues>
  optionsAvailable: boolean
  submitting: boolean
  onSubmit: (values: ProductFormValues) => void
  onCancel: () => void
}

export default function ProductForm({
  mode,
  initialValues,
  optionsAvailable,
  submitting,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const [form] = Form.useForm<ProductFormValues>()

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
  // الإنشاء: الأربعة إلزامية. التعديل: ما كان مكتوباً يبقى إلزامياً (لا يُفرَّغ
  // محتوى)، وما كان ناقصاً في منتجٍ قديم اختياريٌّ مع تنبيه — حفظُ سعره أو
  // مخزونه لا يُحجَب حتى يُكتب له نصّ، ولا يُدفع المسؤول إلى نصٍّ مختلَق.
  const wasFilled = (field: (typeof CONTENT_FIELDS)[number]) =>
    Boolean((initialValues?.[field] ?? '').trim())
  const isRequired = (field: (typeof CONTENT_FIELDS)[number]) =>
    mode === 'create' || wasFilled(field)
  const kurdishIncomplete =
    mode === 'edit' && (!wasFilled('nameCkb') || !wasFilled('descriptionCkb'))
  const arabicDescriptionEmpty = mode === 'edit' && !wasFilled('descriptionAr')

  function changeCategory(categoryId: string) {
    form.setFieldValue('categoryId', categoryId)
    form.setFieldValue('subcategoryId', undefined)
  }

  return (
    <Form<ProductFormValues>
      form={form}
      layout="vertical"
      requiredMark={false}
      initialValues={initialValues}
      onFinish={(values) => onSubmit(trimContent(values))}
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
        extra={<Typography.Text type="secondary">سوراني — يكتبه المسؤول، لا ترجمة آلية</Typography.Text>}
      >
        {kurdishIncomplete && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="الكردية ناقصة لهذا المنتج"
            description="الزبون الكردي يراه بالعربية مع تنبيه. اكتب الاسم والوصف بالكردية ليظهر بلغته."
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
            name="price"
            label="السعر"
            rules={[{ required: true, message: 'السعر مطلوب' }]}
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
            rules={[{ required: true, message: 'المخزون مطلوب' }]}
          >
            <InputNumber min={0} max={100000} style={{ width: 200 }} precision={0} />
          </Form.Item>
          <Form.Item
            name="restockAt"
            label="متوقع التوفر"
            tooltip="اختياري. يظهر للزبون «قريباً يتوفر» مع هذا التاريخ ما دام المخزون صفراً."
            getValueProps={(value?: string | null) => ({
              value: value ? dayjs(value) : null,
            })}
            // القيمة تُحفظ ISO-8601 كما يقبلها مسار التعديل؛ المسح يرسل
            // `null` صراحةً لا حقلاً غائباً — الغائب يعني «لا تغيّر».
            normalize={(value: Dayjs | null) => value?.toISOString() ?? null}
          >
            <DatePicker
              style={{ width: 200 }}
              placeholder="بلا موعد"
              format="YYYY/MM/DD"
              allowClear
            />
          </Form.Item>
        </Space>
        <Form.Item
          noStyle
          shouldUpdate={(prev, next) =>
            prev.stock !== next.stock || prev.restockAt !== next.restockAt
          }
        >
          {({ getFieldValue }) => {
            // ما سيراه الزبون فعلاً — مشتقٌّ بنفس قاعدة التطبيق، فلا يخمّن
            // المسؤول أثر ما أدخله.
            const stock = Number(getFieldValue('stock') ?? 0)
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

      <Card title="الصور" variant="outlined" style={{ marginTop: 16 }}>
        <Typography.Paragraph type="secondary">
          ارفع صورة من جهازك أو ألصق رابطاً. الصورة الأولى هي صورة الغلاف.
        </Typography.Paragraph>
        <ImagesEditor purpose="product" />
      </Card>

      <Card title="الأنمي المرتبط" variant="outlined" style={{ marginTop: 16 }}>
        <Typography.Paragraph type="secondary">
          بُعد تصنيف مستقل عن الأقسام — يسمح للعميل بتصفّح «ون بيس» عبر كل الأقسام.
        </Typography.Paragraph>
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
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="نسبة الخصم تُحسب تلقائياً من السعر السابق — لا تُدخل يدوياً. اترك السعر السابق فارغاً إن لم يكن هناك خصم حقيقي."
        />
        <Space size="large" wrap align="start">
          <Form.Item
            name="previousPrice"
            label="السعر قبل الخصم"
            tooltip="يجب أن يكون أعلى من السعر الحالي."
            rules={[
              {
                validator: (_rule, value: number | null) => {
                  if (value === null || value === undefined) return Promise.resolve()
                  const current = form.getFieldValue('price') as number
                  return value > current
                    ? Promise.resolve()
                    : Promise.reject(new Error('يجب أن يكون أعلى من السعر الحالي'))
                },
              },
            ]}
          >
            <InputNumber min={0} style={{ width: 200 }} addonAfter="د.ع" precision={0} />
          </Form.Item>
          <Form.Item label="نسبة الخصم المحسوبة">
            <Typography.Text strong style={{ fontSize: 18 }}>
              {discountPercent === null ? '—' : `${discountPercent}%`}
            </Typography.Text>
          </Form.Item>
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