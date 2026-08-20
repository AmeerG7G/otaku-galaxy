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

  const selectedCategoryId = Form.useWatch('categoryId', form)

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

      <Card title="الصور (روابط)" variant="outlined" style={{ marginTop: 16 }}>
        <Typography.Paragraph type="secondary">
          الخادم يقبل روابط الصور فقط (لا رفع ملفات).
        </Typography.Paragraph>
        <ImagesEditor />
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
                label="التقييم (قيمة يدوية)"
                tooltip="الخادم لا يحتوي على نظام تقييم من الزبائن — هذه قيمة يدوية يتحكم بها المشرف."
                style={{ marginBottom: 0 }}
              >
                <InputNumber min={0} max={5} step={0.1} style={{ width: 120 }} />
              </Form.Item>
              <Form.Item
                name="reviewCount"
                label="عدد التقييمات"
                tooltip="عدد التقييمات اليدوي المرتبط بالتقييم أعلاه."
                style={{ marginBottom: 0 }}
              >
                <InputNumber min={0} max={1000000} style={{ width: 120 }} precision={0} />
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