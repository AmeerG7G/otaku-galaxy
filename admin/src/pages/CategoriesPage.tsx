import { useCallback, useMemo, useState, type Key } from 'react'
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
  HolderOutlined,
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
  reorderCategories,
  reorderSubcategories,
  updateCategory,
  updateSubcategory,
} from '../api/categoriesApi'
import { ApiError } from '../api/client'
import type { AdminCategory, AdminCategoryListResponse, AdminSubcategory } from '../types/categories'
import { DragHandle, SortableRow, SortableRows } from '../components/SortableRows'
import EmptyState from '../components/EmptyState'
import KurdishNameField from '../components/KurdishNameField'
import { kurdishOrNull, kurdishPatch } from '../utils/kurdish'

type EditorMode = 'create' | 'edit' | 'subcategory' | null

interface Editors {
  mode: Exclude<EditorMode, null>
  category?: AdminCategory
}

interface SubcategoryEditor {
  category: AdminCategory
  subcategory: AdminSubcategory
}

/**
 * قيم نموذج القسم الرئيسي — بلا صورة.
 *
 * [PRODUCT] قرار 2026-09-15: بطاقة القسم في التطبيق نصّيةٌ موسَّطة بلا
 * صورة، فاللوحة لا تعرض صورةً ولا تطلبها — تمثيلٌ واحد للقسم في الطرفين.
 * الحقل `imageUrl` باقٍ في عقد الـAPI والقاعدة (اختياري) ولا يُرسَل من هنا،
 * فما خُزّن سابقاً يبقى كما هو ولا يُمسح بتعديلٍ عرضي.
 */
interface CategoryFormValues {
  name: string
  /** اختياري (2026-10-26) — الفارغ يُعرض للزبون الكردي بالعربية. */
  nameCkb?: string | null
}

interface SubcategoryFormValues {
  categoryId: string
  name: string
  nameCkb?: string | null
}

interface SubcategoryEditorFormValues {
  name: string
  nameCkb?: string | null
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
    mutationFn: (values: CategoryFormValues) =>
      createCategory({
        name: values.name,
        nameCkb: kurdishOrNull(values.nameCkb),
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

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; values: CategoryFormValues; savedCkb: string | null }) =>
      updateCategory(input.id, {
        name: input.values.name,
        ...kurdishPatch('nameCkb', input.values.nameCkb, input.savedCkb),
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
    onError: (error: Error) => {
      message.error(error.message)
    },
  })

  const updateSubcategoryMutation = useMutation({
    mutationFn: (input: { id: string; values: SubcategoryEditorFormValues; savedCkb: string | null }) =>
      updateSubcategory(input.id, {
        name: input.values.name,
        ...kurdishPatch('nameCkb', input.values.nameCkb, input.savedCkb),
        isActive: input.values.isActive,
      }),
    onSuccess: (result) => {
      message.success(result.message || 'حُدّث القسم الفرعي')
      setSubcategoryEditor(null)
      invalidateCategories()
    },
    onError: (error: Error) => {
      message.error(error.message)
    },
  })

  const subcategoryMutation = useMutation({
    mutationFn: (values: SubcategoryFormValues) =>
      createSubcategory({
        categoryId: values.categoryId,
        name: values.name,
        nameCkb: kurdishOrNull(values.nameCkb),
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

  const deleteCategoryMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: (result) => {
      message.success(result.message || 'حُذف القسم')
      void queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
    },
    // رسالة الخادم تشرح ما الذي يمنع الحذف — نعرضها كما هي.
    onError: (error: Error) => {
      message.error(error.message)
    },
  })

  const deleteSubcategoryMutation = useMutation({
    mutationFn: deleteSubcategory,
    onSuccess: (result) => {
      message.success(result.message || 'حُذف القسم الفرعي')
      void queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
    },
    onError: (error: Error) => {
      message.error(error.message)
    },
  })

  /**
   * الترتيب بالسحب يُحفظ فور الإفلات (2026-11-03): القائمة تُعرض بترتيبها
   * الجديد في الحال، وإن رفضه الخادم عادت إلى المحفوظ مع رسالته. لا رقم يُكتب.
   */
  const setCachedCategories = (update: (items: AdminCategory[]) => AdminCategory[]) => {
    const previous = queryClient.getQueryData<AdminCategoryListResponse>(['admin-categories'])
    if (previous) {
      queryClient.setQueryData<AdminCategoryListResponse>(['admin-categories'], {
        ...previous,
        items: update(previous.items),
      })
    }
    return previous
  }

  const reorderMutation = useMutation({
    mutationFn: (input: { categoryId?: string; ids: string[] }) =>
      input.categoryId
        ? reorderSubcategories(input.categoryId, input.ids)
        : reorderCategories(input.ids),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['admin-categories'] })
      message.open({ key: 'category-order', type: 'loading', content: 'جارٍ حفظ الترتيب…', duration: 0 })
      const previous = setCachedCategories((items) =>
        input.categoryId
          ? items.map((category) =>
              category.id === input.categoryId
                ? { ...category, subcategories: orderBy(category.subcategories, input.ids) }
                : category,
            )
          : orderBy(items, input.ids),
      )
      return { previous }
    },
    onSuccess: (result) => {
      message.open({
        key: 'category-order',
        type: 'success',
        content: result.message || 'حُفظ الترتيب',
        duration: 2,
      })
    },
    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['admin-categories'], context.previous)
      }
      message.open({
        key: 'category-order',
        type: 'error',
        content: error instanceof ApiError ? error.message : 'تعذّر حفظ الترتيب',
        duration: 4,
      })
    },
    onSettled: () => invalidateCategories(),
  })

  const [expandedKeys, setExpandedKeys] = useState<readonly Key[]>([])
  const categories = useMemo(() => categoriesQuery.data?.items ?? [], [categoriesQuery.data])
  const categoryName = useCallback(
    (id: string) => categories.find((category) => category.id === id)?.name ?? '',
    [categories],
  )

  // الأعمدة تطابق بطاقة القسم في التطبيق: اسمٌ وعددٌ موسَّطان، بلا صورة.
  const columns = [
    {
      title: <span className="og-sr-only">الترتيب</span>,
      key: 'drag',
      width: 52,
      align: 'center' as const,
      render: (_: unknown, category: AdminCategory) => <DragHandle label={category.name} />,
    },
    {
      title: 'القسم',
      dataIndex: 'name',
      key: 'name',
      align: 'center' as const,
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
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
      align: 'center' as const,
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
            إدارة أقسام المتجر والأقسام الفرعية. اسحب المقبض <HolderOutlined aria-hidden /> لتغيير
            الترتيب — يُحفظ فور الإفلات ويظهر بالترتيب نفسه في المتجر والتطبيق.
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
          <SortableRows
            ids={categories.map((category) => category.id)}
            labelOf={categoryName}
            disabled={reorderMutation.isPending}
            // الصفّ المفتوح يترك فرعيّاته في مكانها أثناء السحب — يُطوى أولاً.
            onDragStart={() => setExpandedKeys([])}
            onReorder={(ids) => reorderMutation.mutate({ ids })}
          >
          <Table
            rowKey="id"
            columns={columns}
            dataSource={categories}
            components={{ body: { row: SortableRow } }}
            pagination={false}
            loading={categoriesQuery.isPending || (categoriesQuery.isFetching && !reorderMutation.isPending)}
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
              expandedRowKeys: expandedKeys,
              onExpandedRowsChange: (keys) => setExpandedKeys(keys),
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
                    <SortableRows
                      ids={category.subcategories.map((subcategory) => subcategory.id)}
                      labelOf={(id) =>
                        category.subcategories.find((subcategory) => subcategory.id === id)?.name ?? ''
                      }
                      disabled={reorderMutation.isPending}
                      onReorder={(ids) => reorderMutation.mutate({ categoryId: category.id, ids })}
                    >
                    <Table
                      size="small"
                      rowKey={(subcategory) => subcategory.id}
                      pagination={false}
                      components={{ body: { row: SortableRow } }}
                      columns={[
                        {
                          title: <span className="og-sr-only">الترتيب</span>,
                          key: 'drag',
                          width: 52,
                          align: 'center' as const,
                          render: (_: unknown, subcategory: AdminSubcategory) => (
                            <DragHandle label={subcategory.name} />
                          ),
                        },
                        { title: 'الاسم', dataIndex: 'name', key: 'name' },
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
                    </SortableRows>
                  )}
                </>
              ),
              rowExpandable: () => true,
            }}
          />
          </SortableRows>
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
              nameCkb: editor.category.nameCkb ?? '',
            }}
            submitting={updateMutation.isPending}
            onSubmit={(values) =>
              updateMutation.mutate({
                id: editor.category!.id,
                values,
                savedCkb: editor.category!.nameCkb ?? null,
              })
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
              nameCkb: subcategoryEditor.subcategory.nameCkb ?? '',
              isActive: subcategoryEditor.subcategory.isActive,
            }}
            submitting={updateSubcategoryMutation.isPending}
            onSubmit={(values) =>
              updateSubcategoryMutation.mutate({
                id: subcategoryEditor.subcategory.id,
                values,
                savedCkb: subcategoryEditor.subcategory.nameCkb ?? null,
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
      <KurdishNameField label="اسم القسم" min={2} max={60} />
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
      <KurdishNameField label="اسم القسم الفرعي" min={2} max={60} />
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
      <KurdishNameField label="اسم القسم الفرعي" min={2} max={60} />
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
/** العناصر بترتيب المعرّفات — ما لم يُذكر يبقى في آخرها كما كان. */
function orderBy<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const position = new Map(ids.map((id, index) => [id, index]))
  return [...items].sort(
    (a, b) => (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  )
}
