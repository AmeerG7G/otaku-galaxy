import { isValidImageRef } from '../utils/media'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd'
import {
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  createBanner,
  deleteBanner,
  listAdminBanners,
  updateBanner,
} from '../api/bannersApi'
import { listAdminCategories } from '../api/categoriesApi'
import { listProducts } from '../api/productsApi'
import { ApiError } from '../api/client'
import type {
  AdminBanner,
  BannerDestinationType,
  BannerPlacement,
} from '../types/banners'
import { PLACEMENT_HINTS, PLACEMENT_LABELS } from '../types/banners'
import type { AdminCategory } from '../types/categories'
import type { Product } from '../types/products'
import EmptyState from '../components/EmptyState'
import ImageUploadField from '../components/ImageUploadField'
import { MediaThumb } from '../components/ui/MediaThumb'
import { PageHeader } from '../components/ui/PageHeader'
import { ConfirmDangerButton } from '../components/ui/ConfirmDangerButton'

const DESTINATION_LABELS: Record<BannerDestinationType, string> = {
  product: 'منتج',
  category: 'قسم',
  subcategory: 'قسم فرعي',
  anime: 'أنمي',
  none: 'بدون وجهة',
}

interface BannerFormValues {
  imageUrl: string
  subtitle?: string
  placement: BannerPlacement
  title?: string
  destinationType: BannerDestinationType
  destinationValue?: string
  sortOrder?: number
}

export default function BannersPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [editor, setEditor] = useState<{ banner?: AdminBanner } | null>(null)

  const bannersQuery = useQuery({
    queryKey: ['banners'],
    queryFn: listAdminBanners,
  })

  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: listAdminCategories,
  })

  const productsQuery = useQuery({
    queryKey: ['banner-products'],
    queryFn: () => listProducts({ page: 1, limit: 50 }),
  })

  const invalidateBanners = () => {
    queryClient.invalidateQueries({ queryKey: ['banners'] })
  }

  const createMutation = useMutation({
    mutationFn: createBanner,
    onSuccess: (result) => {
      message.success(result.message)
      setEditor(null)
      invalidateBanners()
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  const updateMutation = useMutation({
    // تعديل جزئي: الحقول الغائبة تعني «لا تغيير» كما في PATCH. مفتاح
    // التفعيل يرسل `isActive` وحده بلا أن يعيد كتابة بقية البنر.
    mutationFn: (input: {
      id: string
      values: BannerFormValues | { isActive: boolean }
    }) =>
      'isActive' in input.values && !('imageUrl' in input.values)
        ? updateBanner(input.id, { isActive: input.values.isActive })
        : updateBanner(input.id, {
            imageUrl: (input.values as BannerFormValues).imageUrl,
            title: (input.values as BannerFormValues).title?.trim() || null,
            subtitle: (input.values as BannerFormValues).subtitle ?? '',
            placement: (input.values as BannerFormValues).placement,
            destinationType: (input.values as BannerFormValues).destinationType,
            destinationValue:
              (input.values as BannerFormValues).destinationValue ?? null,
            sortOrder: (input.values as BannerFormValues).sortOrder,
          }),
    onSuccess: (result) => {
      message.success(result.message)
      setEditor(null)
      invalidateBanners()
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteBanner,
    onSuccess: (messageText) => {
      message.success(messageText)
      invalidateBanners()
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  const columns = [
    {
      title: 'الصورة',
      key: 'image',
      width: 110,
      render: (_: unknown, banner: AdminBanner) => (
        <MediaThumb
          reference={banner.imageUrl}
          width={88}
          height={48}
          radius={6}
        />
      ),
    },
    {
      title: 'العنوان',
      dataIndex: 'title',
      key: 'title',
      render: (value: string | null) => value ?? '—',
    },
    {
      // الموضع أول ما يحتاج المسؤول معرفته: بنر في «الشريط الترويجي» لا
      // يظهر في اللوحة الكبيرة مهما كان ترتيبه.
      title: 'الموضع',
      key: 'placement',
      width: 140,
      render: (_: unknown, banner: AdminBanner) => (
        <Tag color={banner.placement === 'hero' ? 'purple' : 'blue'}>
          {PLACEMENT_LABELS[banner.placement]}
        </Tag>
      ),
    },
    {
      title: 'الوجهة',
      key: 'destination',
      render: (_: unknown, banner: AdminBanner) =>
        banner.destinationType === 'none'
          ? DESTINATION_LABELS.none
          : `${DESTINATION_LABELS[banner.destinationType]} (${banner.destinationValue ?? '—'})`,
    },
    {
      title: 'الترتيب',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 90,
    },
    {
      title: 'مفعّل',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      // الخادم يقبل `isActive` في PATCH منذ البداية؛ كانت الشاشة تقول إنه
      // لا يقبله وتطلب الحذف وإعادة الإنشاء لتغيير الحالة.
      render: (value: boolean, banner: AdminBanner) => (
        <Switch
          size="small"
          checked={value}
          loading={updateMutation.isPending && updateMutation.variables?.id === banner.id}
          onChange={(checked) =>
            updateMutation.mutate({
              id: banner.id,
              values: { isActive: checked },
            })
          }
        />
      ),
    },
    {
      title: 'الإجراءات',
      key: 'actions',
      width: 170,
      render: (_: unknown, banner: AdminBanner) => (
        <Space size={4}>
          <Button icon={<EditOutlined />} onClick={() => setEditor({ banner })}>
            تعديل
          </Button>
          <ConfirmDangerButton
            title="حذف البنر؟"
            description="سيُحذف البنر نهائياً من قاعدة البيانات ولا يمكن التراجع."
            confirmText="حذف"
            confirmLoading={
              deleteMutation.isPending && deleteMutation.variables === banner.id
            }
            onConfirm={() => deleteMutation.mutate(banner.id)}
          >
            حذف
          </ConfirmDangerButton>
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="البنرات"
        description="البنرات الإعلانية المعروضة في الصفحة الرئيسية. البنر الجديد يُنشأ نشطاً."
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              loading={bannersQuery.isFetching}
              onClick={() => bannersQuery.refetch()}
            >
              تحديث
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setEditor({})}
            >
              إضافة بنر
            </Button>
          </Space>
        }
      />

      <Alert
        type="info"
        showIcon
        message="موضعان في الرئيسية"
        description="«اللوحة الكبيرة» أعلى الرئيسية وتُعرض منها واحدة فقط — الأولى ترتيباً بين المفعّلة. «الشريط الترويجي» تحتها ويقبل عدداً مفتوحاً بترتيبك. البنر الموقوف يبقى هنا ولا يظهر في التطبيق."
      />

      <Card>
        {bannersQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message="تعذر تحميل البنرات"
            description={bannersQuery.error.message}
            action={
              <Button size="small" onClick={() => bannersQuery.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={bannersQuery.data?.items ?? []}
            loading={bannersQuery.isPending || bannersQuery.isFetching}
            scroll={{ x: 900 }}
            locale={{
              emptyText: (
                <EmptyState
                  description="لا توجد بنرات حالياً"
                  actionLabel="إضافة بنر"
                  onAction={() => setEditor({})}
                />
              ),
            }}
          />
        )}
      </Card>

      <Modal
        open={editor !== null && !editor.banner}
        title="إضافة بنر"
        onCancel={() => setEditor(null)}
        destroyOnHidden
        footer={null}
      >
        <BannerForm
          submitting={createMutation.isPending}
          onSubmit={(values) => createMutation.mutate(values)}
          onCancel={() => setEditor(null)}
          categories={categoriesQuery.data?.items ?? []}
          products={productsQuery.data?.items ?? []}
          destinationDataLoading={
            productsQuery.isPending || categoriesQuery.isPending
          }
        />
      </Modal>

      <Modal
        open={editor?.banner != null}
        title="تعديل البنر"
        onCancel={() => setEditor(null)}
        destroyOnHidden
        footer={null}
      >
        {editor?.banner && (
          <BannerForm
            initialValues={{
              imageUrl: editor.banner.imageUrl,
              title: editor.banner.title ?? undefined,
              subtitle: editor.banner.subtitle,
              placement: editor.banner.placement,
              destinationType: editor.banner.destinationType,
              destinationValue: editor.banner.destinationValue ?? undefined,
              sortOrder: editor.banner.sortOrder,
            }}
            submitting={updateMutation.isPending}
            onSubmit={(values) =>
              updateMutation.mutate({ id: editor.banner!.id, values })
            }
            onCancel={() => setEditor(null)}
            categories={categoriesQuery.data?.items ?? []}
            products={productsQuery.data?.items ?? []}
            destinationDataLoading={
              productsQuery.isPending || categoriesQuery.isPending
            }
          />
        )}
      </Modal>
    </Space>
  )
}

interface BannerFormProps {
  initialValues?: Partial<BannerFormValues>
  submitting: boolean
  onSubmit: (values: BannerFormValues) => void
  onCancel: () => void
  categories: AdminCategory[]
  products: Product[]
  destinationDataLoading: boolean
}

function BannerForm({
  initialValues,
  submitting,
  onSubmit,
  onCancel,
  categories,
  products,
  destinationDataLoading,
}: BannerFormProps) {
  const [form] = Form.useForm<BannerFormValues>()
  const destinationType = Form.useWatch('destinationType', form) ?? 'none'
  const placement: BannerPlacement =
    Form.useWatch('placement', form) ?? 'promo'

  const subcategories = categories.flatMap((category) =>
    category.subcategories.map((subcategory) => ({
      value: subcategory.id,
      label: `${category.name} ← ${subcategory.name}`,
    })),
  )

  let destinationOptions: { value: string; label: string }[] = []
  if (destinationType === 'product') {
    destinationOptions = products.map((product) => ({
      value: product.id,
      label: product.name,
    }))
  } else if (destinationType === 'category') {
    destinationOptions = categories.map((category) => ({
      value: category.id,
      label: category.name,
    }))
  } else if (destinationType === 'subcategory') {
    destinationOptions = subcategories
  }

  return (
    <Form<BannerFormValues>
      form={form}
      layout="vertical"
      initialValues={initialValues}
      onFinish={onSubmit}
      style={{ marginTop: 8 }}
    >
      <Form.Item
        name="imageUrl"
        label="صورة البنر"
        rules={[
          { required: true, message: 'صورة البنر مطلوبة' },
          {
            validator: (_rule, value: string) =>
              !value || isValidImageRef(value)
                ? Promise.resolve()
                : Promise.reject(new Error('رابط الصورة غير صالح')),
          },
        ]}
      >
        <ImageUploadField purpose="banner" />
      </Form.Item>
      <Form.Item
        name="placement"
        label="موضع العرض"
        rules={[{ required: true, message: 'اختر الموضع' }]}
        extra={PLACEMENT_HINTS[placement]}
      >
        <Segmented
          block
          options={(Object.keys(PLACEMENT_LABELS) as BannerPlacement[]).map(
            (key) => ({ value: key, label: PLACEMENT_LABELS[key] }),
          )}
        />
      </Form.Item>
      <Form.Item
        name="title"
        label="العنوان"
        rules={[{ max: 100, message: 'العنوان يجب ألا يتجاوز 100 حرف' }]}
      >
        <Input placeholder="موسم جديد من عالم الأنمي" />
      </Form.Item>
      <Form.Item
        name="subtitle"
        label="السطر الثاني"
        rules={[{ max: 160, message: 'السطر الثاني يجب ألا يتجاوز 160 حرفاً' }]}
      >
        <Input placeholder="تشكيلة جديدة" />
      </Form.Item>
      <Form.Item
        name="destinationType"
        label="نوع الوجهة"
        rules={[{ required: true, message: 'اختر نوع الوجهة' }]}
      >
        <Select
          options={(
            Object.keys(DESTINATION_LABELS) as BannerDestinationType[]
          ).map((key) => ({ value: key, label: DESTINATION_LABELS[key] }))}
          placeholder="ماذا يفتح البنر عند الضغط عليه؟"
        />
      </Form.Item>
      {destinationType !== 'none' && (
        <Form.Item
          name="destinationValue"
          label="الوجهة"
          rules={[{ required: true, message: 'اختر الوجهة' }]}
        >
          <Select
            options={destinationOptions}
            showSearch
            optionFilterProp="label"
            loading={destinationDataLoading}
            placeholder={
              destinationOptions.length === 0
                ? 'لا توجد عناصر متاحة لهذه الوجهة'
                : 'اختر…'
            }
          />
        </Form.Item>
      )}
      <Form.Item name="sortOrder" label="الترتيب">
        <InputNumber min={0} max={1000} style={{ width: '100%' }} precision={0} />
      </Form.Item>
      <Space>
        <Button type="primary" htmlType="submit" loading={submitting}>
          حفظ
        </Button>
        <Button onClick={onCancel} disabled={submitting} type="text">
          إلغاء
        </Button>
      </Space>
    </Form>
  )
}