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
} from 'antd'
import { useQuery } from '@tanstack/react-query'
import { listAdminCategories } from '../api/categoriesApi'
import { listFranchises } from '../api/communityApi'
import ImagesEditor from './ImagesEditor'
import OptionsEditor from './OptionsEditor'

export interface ProductFormValues {
  name: string
  description: string
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
      onFinish={onSubmit}
      style={{ maxWidth: 760 }}
    >
      {!optionsAvailable && (
        <Alert
          type="warning"
          showIcon
          message="خيارات هذا المنتج غير متاحة للمنتجات غير النشطة في الخادم."
          description="حفظ التعديلات سيُمسح الخيارات المحفوظة نهائياً — سيُطلب منك تأكيد صريح قبل الحفظ. أعد إدخال الخيارات يدوياً إذا أردت الاحتفاظ بها، أو فعّل المنتج أولاً بطريقة أخرى."
          style={{ marginBottom: 16 }}
        />
      )}

      <Card title="المعلومات الأساسية" variant="outlined">
        <Form.Item
          name="name"
          label="اسم المنتج"
          rules={[
            { required: true, message: 'اسم المنتج مطلوب' },
            { min: 2, message: 'الاسم قصير جداً (حرفان كحد أدنى)' },
            { max: 150, message: 'الاسم طويل جداً (150 حرفاً كحد أقصى)' },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="description"
          label="الوصف"
          rules={[{ max: 3000, message: 'الوصف طويل جداً' }]}
        >
          <Input.TextArea rows={4} />
        </Form.Item>
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
        </Space>
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