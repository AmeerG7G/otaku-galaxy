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
  Typography,
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
  BannerContent,
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
import { SectionHeader } from '../components/ui/SectionHeader'

const DESTINATION_LABELS: Record<BannerDestinationType, string> = {
  product: 'منتج',
  category: 'قسم',
  subcategory: 'قسم فرعي',
  anime: 'أنمي',
  none: 'بدون وجهة',
}

interface BannerFormValues {
  imageUrl: string
  placement: BannerPlacement
  /**
   * نصّ البنر بلغتيه (هجرة ٠٦٧) — أربعة حقول مستقلة يكتبها المسؤول بيده، لا
   * ترجمة آلية ولا نسخ بين اللغتين. كلٌّ اختياري كما كان النصّ قبل الفصل.
   */
  titleAr?: string
  subtitleAr?: string
  titleCkb?: string
  subtitleCkb?: string
  destinationType: BannerDestinationType
  destinationValue?: string
  sortOrder?: number
}

const CONTENT_FIELDS = ['titleAr', 'subtitleAr', 'titleCkb', 'subtitleCkb'] as const

/** نصٌّ مقصوص أو `null` — الفراغ «لا نصّ بهذه اللغة»، كما يحفظه الخادم. */
function cleanText(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

function contentOf(values: Partial<Record<keyof BannerContent, string | null>>): BannerContent {
  return {
    titleAr: cleanText(values.titleAr),
    subtitleAr: cleanText(values.subtitleAr),
    titleCkb: cleanText(values.titleCkb),
    subtitleCkb: cleanText(values.subtitleCkb),
  }
}

/**
 * [CRITICAL] التعديل يرسل من النصوص الأربعة ما تغيّر وحده. الحقل الغائب لا
 * يُمسّ على الخادم، فحفظ العربية لا يعيد كتابة الكردية ولا العكس — ولو عدّلها
 * مسؤولٌ آخر بين فتح النموذج وحفظه.
 */
function changedContent(
  values: BannerFormValues,
  initial: BannerContent,
): Partial<BannerContent> {
  const next = contentOf(values)
  const before = contentOf(initial)
  const changed: Partial<BannerContent> = {}
  for (const field of CONTENT_FIELDS) {
    if (next[field] !== before[field]) changed[field] = next[field]
  }
  return changed
}

/** حدود كل حقل نصّ — حدود النموذج قبل الفصل، لكل لغة. */
function textRules(kind: 'title' | 'subtitle', language: string) {
  return kind === 'title'
    ? [{ max: 100, message: `العنوان ب${language} يجب ألا يتجاوز 100 حرف` }]
    : [{ max: 160, message: `السطر الثاني ب${language} يجب ألا يتجاوز 160 حرفاً` }]
}

/** لغةٌ ناقصة: للحقل نصٌّ باللغة الأخرى ولا نصّ له بهذه. */
function missingLanguage(banner: AdminBanner): string | null {
  if ((banner.titleAr && !banner.titleCkb) || (banner.subtitleAr && !banner.subtitleCkb)) {
    return 'الكردية ناقصة'
  }
  if ((banner.titleCkb && !banner.titleAr) || (banner.subtitleCkb && !banner.subtitleAr)) {
    return 'العربية ناقصة'
  }
  return null
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
    mutationFn: (values: BannerFormValues) =>
      createBanner({
        imageUrl: values.imageUrl,
        ...contentOf(values),
        placement: values.placement,
        destinationType: values.destinationType,
        destinationValue: values.destinationValue ?? null,
        sortOrder: values.sortOrder,
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

  const updateMutation = useMutation({
    // تعديل جزئي: الحقول الغائبة تعني «لا تغيير» كما في PATCH. مفتاح
    // التفعيل يرسل `isActive` وحده بلا أن يعيد كتابة بقية البنر.
    mutationFn: (input: {
      id: string
      values: BannerFormValues | { isActive: boolean }
      /** النصوص كما فُتح بها النموذج — منها يُعرف ما تغيّر. */
      initial?: BannerContent
    }) =>
      'isActive' in input.values && !('imageUrl' in input.values)
        ? updateBanner(input.id, { isActive: input.values.isActive })
        : updateBanner(input.id, {
            imageUrl: (input.values as BannerFormValues).imageUrl,
            ...changedContent(
              input.values as BannerFormValues,
              input.initial ?? contentOf({}),
            ),
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
      key: 'title',
      render: (_: unknown, banner: AdminBanner) => {
        const missing = missingLanguage(banner)
        return (
          <Space direction="vertical" size={2}>
            <span lang="ar">{banner.titleAr ?? '—'}</span>
            {banner.titleCkb && (
              <Typography.Text type="secondary" lang="ckb">
                {banner.titleCkb}
              </Typography.Text>
            )}
            {missing && <Tag color="orange">{missing}</Tag>}
          </Space>
        )
      },
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
              // كل لغةٍ في حقليها كما حفظها الخادم — لا احتياط يملأ لغةً من أخرى.
              titleAr: editor.banner.titleAr ?? undefined,
              subtitleAr: editor.banner.subtitleAr ?? undefined,
              titleCkb: editor.banner.titleCkb ?? undefined,
              subtitleCkb: editor.banner.subtitleCkb ?? undefined,
              placement: editor.banner.placement,
              destinationType: editor.banner.destinationType,
              destinationValue: editor.banner.destinationValue ?? undefined,
              sortOrder: editor.banner.sortOrder,
            }}
            submitting={updateMutation.isPending}
            onSubmit={(values) =>
              updateMutation.mutate({
                id: editor.banner!.id,
                values,
                initial: contentOf(editor.banner!),
              })
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
      <SectionHeader title="محتوى البنر" />
      <Card
        size="small"
        title="العربية"
        data-testid="banner-content-ar"
        style={{ marginBottom: 12 }}
      >
        <Form.Item name="titleAr" label="العنوان بالعربية" rules={textRules('title', 'العربية')}>
          <Input lang="ar" dir="rtl" placeholder="موسم جديد من عالم الأنمي" />
        </Form.Item>
        <Form.Item
          name="subtitleAr"
          label="السطر الثاني بالعربية"
          rules={textRules('subtitle', 'العربية')}
          style={{ marginBottom: 0 }}
        >
          <Input lang="ar" dir="rtl" placeholder="تشكيلة جديدة" />
        </Form.Item>
      </Card>
      <Card
        size="small"
        title="الكردية"
        data-testid="banner-content-ckb"
        style={{ marginBottom: 24 }}
      >
        <Form.Item name="titleCkb" label="العنوان بالكردية" rules={textRules('title', 'الكردية')}>
          <Input lang="ckb" dir="rtl" />
        </Form.Item>
        <Form.Item
          name="subtitleCkb"
          label="السطر الثاني بالكردية"
          rules={textRules('subtitle', 'الكردية')}
          style={{ marginBottom: 0 }}
        >
          <Input lang="ckb" dir="rtl" />
        </Form.Item>
      </Card>
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