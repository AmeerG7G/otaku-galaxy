import { isValidImageRef } from '../utils/media'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  UnorderedListOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  createCategory,
  createSubcategory,
  deleteCategory,
  deleteSubcategory,
  listAdminCategories,
  updateCategory,
  updateSubcategory,
} from '../api/categoriesApi'
import { ApiError } from '../api/client'
import type { AdminCategory, AdminSubcategory } from '../types/categories'
import EmptyState from '../components/EmptyState'
import ImageUploadField from '../components/ImageUploadField'
import { MediaThumb } from '../components/ui/MediaThumb'

type EditorMode = 'create' | 'edit' | 'subcategory' | null

interface Editors {
  mode: Exclude<EditorMode, null>
  category?: AdminCategory
}

interface SubcategoryEditor {
  category: AdminCategory
  subcategory: AdminSubcategory
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

interface SubcategoryEditorFormValues {
  name: string
  sortOrder?: number
  isActive: boolean
}

export default function CategoriesPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [editor, setEditor] = useState<Editors | null>(null)
  const [subcategoryEditor, setSubcategoryEditor] = useState<SubcategoryEditor | null>(null)

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

  /** إيقاف القسم عن الواجهة أو إعادته إليها — بديل الحذف حين يكون مشغولاً. */
  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      updateCategory(input.id, { isActive: input.isActive }),
    onSuccess: () => invalidateCategories(),
    onError: (error: Error) => message.error(error.message),
  })

  const updateSubcategoryMutation = useMutation({
    mutationFn: (input: { id: string; values: SubcategoryEditorFormValues }) =>
      updateSubcategory(input.id, {
        name: input.values.name,
        sortOrder: input.values.sortOrder,
        isActive: input.values.isActive,
      }),
    onSuccess: (result) => {
      message.success(result.message || 'حُدّث القسم الفرعي')
      setSubcategoryEditor(null)
      invalidateCategories()
    },
    onError: (error: Error) => message.error(error.message),
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

  const deleteCategoryMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: (result) => {
      message.success(result.message || 'حُذف القسم')
      void queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
    },
    // رسالة الخادم تشرح ما الذي يمنع الحذف — نعرضها كما هي.
    onError: (error: Error) => message.error(error.message),
  })

  const deleteSubcategoryMutation = useMutation({
    mutationFn: deleteSubcategory,
    onSuccess: (result) => {
      message.success(result.message || 'حُذف القسم الفرعي')
      void queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
    },
    onError: (error: Error) => message.error(error.message),
  })

  const columns = [
    {
      title: 'الصورة',
      key: 'image',
      width: 80,
      render: (_: unknown, category: AdminCategory) => (
        <MediaThumb reference={category.imageUrl} size={48} radius={8} />
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
      width: 110,
      render: (value: boolean, category: AdminCategory) => (
        <Switch
          size="small"
          checked={value}
          checkedChildren="نشط"
          unCheckedChildren="معطل"
          loading={
            toggleMutation.isPending && toggleMutation.variables?.id === category.id
          }
          onChange={(checked) =>
            toggleMutation.mutate({ id: category.id, isActive: checked })
          }
        />
      ),
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
          <Popconfirm
            title="حذف القسم؟"
            description="يُرفض الحذف إن كان القسم يحتوي منتجات أو أقساماً فرعية."
            okText="حذف"
            cancelText="إلغاء"
            okButtonProps={{ danger: true, loading: deleteCategoryMutation.isPending }}
            onConfirm={() => deleteCategoryMutation.mutate(category.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              حذف
            </Button>
          </Popconfirm>
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
        message="الحذف محميّ بالتبعيات"
        description="يُرفض حذف القسم أو القسم الفرعي ما دام شيء يعتمد عليه، ولا يُحذف أي منتج تبعاً لذلك. إن كان القسم مستعملاً فعطّله بدل حذفه."
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
                    <Space direction="vertical" size={8}>
                      <Typography.Text type="secondary">
                        لا توجد أقسام فرعية لهذا القسم.
                      </Typography.Text>
                      <Space size={4}>
                        <Button
                          size="small"
                          icon={<UnorderedListOutlined />}
                          onClick={() =>
                            navigate(`/products?categoryId=${category.id}`)
                          }
                        >
                          عرض منتجات القسم
                        </Button>
                        <Button
                          size="small"
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={() =>
                            navigate(`/products/new?categoryId=${category.id}`)
                          }
                        >
                          إضافة منتج
                        </Button>
                      </Space>
                    </Space>
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
                        {
                          title: 'الحالة',
                          dataIndex: 'isActive',
                          key: 'isActive',
                          width: 110,
                          render: (value: boolean) =>
                            value ? (
                              <Tag color="green">نشط</Tag>
                            ) : (
                              <Tag color="default">معطل</Tag>
                            ),
                        },
                        {
                          // المسار المقصود: قسم ← قسم فرعي ← منتجاته ←
                          // إضافة منتج بالقسم مختاراً مسبقاً. الرابطان
                          // يستعملان شاشة المنتجات ونموذجها القائمين — لا
                          // مسار إنشاء ثانٍ.
                          title: 'المنتجات',
                          key: 'products',
                          width: 220,
                          render: (
                            _: unknown,
                            subcategory: AdminSubcategory,
                          ) => {
                            const scope = new URLSearchParams({
                              categoryId: category.id,
                              subcategoryId: subcategory.id,
                            }).toString()
                            return (
                              <Space size={4}>
                                <Button
                                  size="small"
                                  icon={<UnorderedListOutlined />}
                                  onClick={() => navigate(`/products?${scope}`)}
                                >
                                  عرض
                                </Button>
                                <Button
                                  size="small"
                                  type="primary"
                                  icon={<PlusOutlined />}
                                  onClick={() =>
                                    navigate(`/products/new?${scope}`)
                                  }
                                >
                                  إضافة منتج
                                </Button>
                              </Space>
                            )
                          },
                        },
                        {
                          title: '',
                          key: 'actions',
                          width: 140,
                          render: (
                            _: unknown,
                            subcategory: AdminSubcategory,
                          ) => (
                            <Space size={4}>
                              <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() =>
                                  setSubcategoryEditor({
                                    category,
                                    subcategory,
                                  })
                                }
                              />
                              <Popconfirm
                                title="حذف القسم الفرعي؟"
                                description="يُرفض الحذف إن كانت منتجات مرتبطة به."
                                okText="حذف"
                                cancelText="إلغاء"
                                okButtonProps={{
                                  danger: true,
                                  loading: deleteSubcategoryMutation.isPending,
                                }}
                                onConfirm={() =>
                                  deleteSubcategoryMutation.mutate(subcategory.id)
                                }
                              >
                                <Button size="small" danger icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </Space>
                          ),
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

      <Modal
        open={Boolean(subcategoryEditor)}
        title={`تعديل قسم فرعي في «${subcategoryEditor?.category.name ?? ''}»`}
        onCancel={() => setSubcategoryEditor(null)}
        destroyOnHidden
        footer={null}
      >
        {subcategoryEditor && (
          <SubcategoryEditorForm
            initialValues={{
              name: subcategoryEditor.subcategory.name,
              sortOrder: subcategoryEditor.subcategory.sortOrder,
              isActive: subcategoryEditor.subcategory.isActive,
            }}
            submitting={updateSubcategoryMutation.isPending}
            onSubmit={(values) =>
              updateSubcategoryMutation.mutate({
                id: subcategoryEditor.subcategory.id,
                values,
              })
            }
            onCancel={() => setSubcategoryEditor(null)}
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
        label="صورة القسم (اختيارية)"
        rules={[
          {
            validator: (_rule, value: string) =>
              !value || isValidImageRef(value)
                ? Promise.resolve()
                : Promise.reject(new Error('رابط الصورة غير صالح')),
          },
        ]}
      >
        <ImageUploadField purpose="category" allowClear />
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

interface SubcategoryEditorFormProps {
  initialValues: SubcategoryEditorFormValues
  submitting: boolean
  onSubmit: (values: SubcategoryEditorFormValues) => void
  onCancel: () => void
}

function SubcategoryEditorForm({
  initialValues,
  submitting,
  onSubmit,
  onCancel,
}: SubcategoryEditorFormProps) {
  const [form] = Form.useForm<SubcategoryEditorFormValues>()
  return (
    <Form<SubcategoryEditorFormValues>
      form={form}
      layout="vertical"
      initialValues={initialValues}
      onFinish={onSubmit}
      style={{ marginTop: 8 }}
    >
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
      <Form.Item name="isActive" label="ظاهر للعملاء" valuePropName="checked">
        <Switch />
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