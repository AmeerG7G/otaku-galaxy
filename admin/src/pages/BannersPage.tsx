import { resolveMediaUrl } from '../utils/media'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
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
} from '../types/banners'
import type { AdminCategory } from '../types/categories'
import type { Product } from '../types/products'
import EmptyState from '../components/EmptyState'
import ImageUploadField, { isValidImageRef } from '../components/ImageUploadField'

const NO_IMAGE_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#f5f5f5"/><text x="32" y="36" font-size="12" text-anchor="middle" fill="#aaa">لا صورة</text></svg>',
  )

const DESTINATION_LABELS: Record<BannerDestinationType, string> = {
  product: 'منتج',
  category: 'قسم',
  subcategory: 'قسم فرعي',
  none: 'بدون وجهة',
}

interface BannerFormValues {
  imageUrl: string
  title?: string
  destinationType: BannerDestinationType
  destinationValue?: string
  sortOrder?: number
}

export default function BannersPage() {
  const { message, modal } = App.useApp()
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
    mutationFn: (input: { id: string; values: BannerFormValues }) =>
      updateBanner(input.id, {
        imageUrl: input.values.imageUrl,
        title: input.values.title?.trim() || null,
        destinationType: input.values.destinationType,
        destinationValue: input.values.destinationValue ?? null,
        sortOrder: input.values.sortOrder,
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

  function confirmDelete(banner: AdminBanner) {
    modal.confirm({
      title: 'حذف البنر؟',
      content: 'سيُحذف البنر نهائياً من قاعدة البيانات ولا يمكن التراجع.',
      okText: 'حذف',
      okButtonProps: { danger: true },
      cancelText: 'إلغاء',
      onOk: () => deleteMutation.mutateAsync(banner.id),
    })
  }

  const columns = [
    {
      title: 'الصورة',
      key: 'image',
      width: 110,
      render: (_: unknown, banner: AdminBanner) => (
        <Image
          src={resolveMediaUrl(banner.imageUrl)}
          width={88}
          height={48}
          style={{ objectFit: 'cover', borderRadius: 4 }}
          preview={false}
          fallback={NO_IMAGE_PLACEHOLDER}
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
      title: 'الحالة',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (value: boolean) =>
        value ? <Tag color="green">نشط</Tag> : <Tag color="default">غير نشط</Tag>,
    },
    {
      title: 'الإجراءات',
      key: 'actions',
      width: 170,
      render: (_: unknown, banner: AdminBanner) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => setEditor({ banner })}
          >
            تعديل
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => confirmDelete(banner)}
          >
            حذف
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Flex align="center" justify="space-between" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            البنرات
          </Typography.Title>
          <Typography.Text type="secondary">
            البنرات الإعلانية المعروضة في الصفحة الرئيسية. البنر الجديد يُنشأ نشطاً.
          </Typography.Text>
        </div>
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
      </Flex>

      <Alert
        type="info"
        showIcon
        message="لا يوفر خادم الإدارة تفعيل/تعطيل بنر قائم."
        description="البنر النشط فقط يظهر في المتجر؛ لتغيير الحالة احذف البنر وأنشئه من جديد بعد الحذف."
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
        name="title"
        label="العنوان"
        rules={[{ max: 100, message: 'العنوان يجب ألا يتجاوز 100 حرف' }]}
      >
        <Input placeholder="اختياري" />
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