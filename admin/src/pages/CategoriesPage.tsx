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
  Space,
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
  createCategory,
  createSubcategory,
  listAdminCategories,
  updateCategory,
} from '../api/categoriesApi'
import { ApiError } from '../api/client'
import type { AdminCategory } from '../types/categories'
import EmptyState from '../components/EmptyState'

const NO_IMAGE_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#f5f5f5"/><text x="32" y="36" font-size="12" text-anchor="middle" fill="#aaa">لا صورة</text></svg>',
  )

type EditorMode = 'create' | 'edit' | 'subcategory' | null

interface Editors {
  mode: Exclude<EditorMode, null>
  category?: AdminCategory
}

interface CategoryFormValues {
  name: string
  imageUrl?: string
  sortOrder?: number
}

interface SubcategoryFormValues {
  categoryId: string
  name: string
  sortOrder?: number
}

export default function CategoriesPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [editor, setEditor] = useState<Editors | null>(null)

  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: listAdminCategories,
  })

  const invalidateCategories = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
  }

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: (result) => {
      message.success(result.message)
      setEditor(null)
      invalidateCategories()
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; values: CategoryFormValues }) =>
      updateCategory(input.id, {
        name: input.values.name,
        imageUrl: input.values.imageUrl || null,
        sortOrder: input.values.sortOrder,
      }),
    onSuccess: (result) => {
      message.success(result.message)
      setEditor(null)
      invalidateCategories()
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  const subcategoryMutation = useMutation({
    mutationFn: createSubcategory,
    onSuccess: (result) => {
      message.success(result.message)
      setEditor(null)
      invalidateCategories()
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  const columns = [
    {
      title: 'الصورة',
      key: 'image',
      width: 80,
      render: (_: unknown, category: AdminCategory) => (
        <Image
          src={category.imageUrl ?? NO_IMAGE_PLACEHOLDER}
          width={48}
          height={48}
          style={{ objectFit: 'cover', borderRadius: 4 }}
          preview={false}
          fallback={NO_IMAGE_PLACEHOLDER}
        />
      ),
    },
    {
      title: 'القسم',
      dataIndex: 'name',
      key: 'name',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
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
      title: 'الأقسام الفرعية',
      key: 'subcategories',
      width: 160,
      render: (_: unknown, category: AdminCategory) =>
        `${category.subcategories.length} أقسام فرعية`,
    },
    {
      title: 'الإجراءات',
      key: 'actions',
      width: 170,
      render: (_: unknown, category: AdminCategory) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => setEditor({ mode: 'edit', category })}
          >
            تعديل
          </Button>
          <Button
            size="small"
            onClick={() => setEditor({ mode: 'subcategory', category })}
          >
            إضافة قسم فرعي
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
            الأقسام
          </Typography.Title>
          <Typography.Text type="secondary">
            إدارة أقسام المتجر والأقسام الفرعية.
          </Typography.Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            loading={categoriesQuery.isFetching}
            onClick={() => categoriesQuery.refetch()}
          >
            تحديث
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setEditor({ mode: 'create' })}
          >
            إضافة قسم
          </Button>
        </Space>
      </Flex>

      <Alert
        type="info"
        showIcon
        message="إدارة الأقسام: إضافة وتعديل فقط."
        description="لا يوفر خادم الإدارة تفعيل/تعطيل الأقسام أو حذفها، ولا تعديل/حذف الأقسام الفرعية — تُنشأ الأقسام الجديدة نشطة وتظهر الأقسام الفرعية هنا للاطلاع فقط."
      />

      <Card>
        {categoriesQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message="تعذر تحميل الأقسام"
            description={categoriesQuery.error.message}
            action={
              <Button size="small" onClick={() => categoriesQuery.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={categoriesQuery.data?.items ?? []}
            loading={categoriesQuery.isPending || categoriesQuery.isFetching}
            scroll={{ x: 860 }}
            locale={{
              emptyText: (
                <EmptyState
                  description="لا توجد أقسام بعد"
                  actionLabel="إضافة قسم"
                  onAction={() => setEditor({ mode: 'create' })}
                />
              ),
            }}
            expandable={{
              expandedRowRender: (category: AdminCategory) => (
                <>
                  {category.subcategories.length === 0 ? (
                    <Typography.Text type="secondary">
                      لا توجد أقسام فرعية لهذا القسم.
                    </Typography.Text>
                  ) : (
                    <Table
                      size="small"
                      rowKey={(subcategory) => subcategory.id}
                      pagination={false}
                      columns={[
                        { title: 'الاسم', dataIndex: 'name', key: 'name' },
                        {
                          title: 'الترتيب',
                          dataIndex: 'sortOrder',
                          key: 'sortOrder',
                          width: 100,
                        },
                      ]}
                      dataSource={category.subcategories}
                    />
                  )}
                </>
              ),
              rowExpandable: () => true,
            }}
          />
        )}
      </Card>

      <Modal
        open={editor?.mode === 'create'}
        title="إضافة قسم"
        onCancel={() => setEditor(null)}
        destroyOnHidden
        footer={null}
      >
        <CategoryEditorForm
          submitting={createMutation.isPending}
          onSubmit={(values) => createMutation.mutate(values)}
          onCancel={() => setEditor(null)}
        />
      </Modal>

      <Modal
        open={editor?.mode === 'edit'}
        title={`تعديل القسم: ${editor?.category?.name ?? ''}`}
        onCancel={() => setEditor(null)}
        destroyOnHidden
        footer={null}
      >
        {editor?.category && (
          <CategoryEditorForm
            initialValues={{
              name: editor.category.name,
              imageUrl: editor.category.imageUrl ?? undefined,
              sortOrder: editor.category.sortOrder,
            }}
            submitting={updateMutation.isPending}
            onSubmit={(values) =>
              updateMutation.mutate({ id: editor.category!.id, values })
            }
            onCancel={() => setEditor(null)}
          />
        )}
      </Modal>

      <Modal
        open={editor?.mode === 'subcategory'}
        title={`إضافة قسم فرعي لـ «${editor?.category?.name ?? ''}»`}
        onCancel={() => setEditor(null)}
        destroyOnHidden
        footer={null}
      >
        {editor?.category && (
          <SubcategoryForm
            categoryId={editor.category.id}
            submitting={subcategoryMutation.isPending}
            onSubmit={(values) => subcategoryMutation.mutate(values)}
            onCancel={() => setEditor(null)}
          />
        )}
      </Modal>
    </Space>
  )
}

interface CategoryEditorFormProps {
  initialValues?: Partial<CategoryFormValues>
  submitting: boolean
  onSubmit: (values: CategoryFormValues) => void
  onCancel: () => void
}

function CategoryEditorForm({
  initialValues,
  submitting,
  onSubmit,
  onCancel,
}: CategoryEditorFormProps) {
  const [form] = Form.useForm<CategoryFormValues>()
  return (
    <Form<CategoryFormValues>
      form={form}
      layout="vertical"
      initialValues={initialValues}
      onFinish={onSubmit}
      style={{ marginTop: 8 }}
    >
      <Form.Item
        name="name"
        label="اسم القسم"
        rules={[
          { required: true, message: 'اسم القسم مطلوب' },
          { min: 2, max: 60, message: 'الاسم يجب أن يكون بين 2 و 60 حرفاً' },
        ]}
      >
        <Input />
      </Form.Item>
      <Form.Item
        name="imageUrl"
        label="رابط الصورة"
        rules={[
          { type: 'url', message: 'رابط الصورة غير صالح' },
        ]}
      >
        <Input placeholder="رابط الصورة (اختياري)" />
      </Form.Item>
      <Form.Item name="sortOrder" label="الترتيب">
        <InputNumber min={0} max={1000} style={{ width: '100%' }} precision={0} />
      </Form.Item>
      <Space>
        <Button type="primary" htmlType="submit" loading={submitting}>
          حفظ
        </Button>
        <Button onClick={onCancel} disabled={submitting}>
          إلغاء
        </Button>
      </Space>
    </Form>
  )
}

interface SubcategoryFormProps {
  categoryId: string
  submitting: boolean
  onSubmit: (values: SubcategoryFormValues) => void
  onCancel: () => void
}

function SubcategoryForm({
  categoryId,
  submitting,
  onSubmit,
  onCancel,
}: SubcategoryFormProps) {
  const [form] = Form.useForm<SubcategoryFormValues>()
  return (
    <Form<SubcategoryFormValues>
      form={form}
      layout="vertical"
      initialValues={{ categoryId }}
      onFinish={onSubmit}
      style={{ marginTop: 8 }}
    >
      <Form.Item name="categoryId" hidden>
        <Input />
      </Form.Item>
      <Form.Item
        name="name"
        label="اسم القسم الفرعي"
        rules={[
          { required: true, message: 'الاسم مطلوب' },
          { min: 2, max: 60, message: 'الاسم يجب أن يكون بين 2 و 60 حرفاً' },
        ]}
      >
        <Input />
      </Form.Item>
      <Form.Item name="sortOrder" label="الترتيب">
        <InputNumber min={0} max={1000} style={{ width: '100%' }} precision={0} />
      </Form.Item>
      <Space>
        <Button type="primary" htmlType="submit" loading={submitting}>
          إضافة
        </Button>
        <Button onClick={onCancel} disabled={submitting}>
          إلغاء
        </Button>
      </Space>
    </Form>
  )
}