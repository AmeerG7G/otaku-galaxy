import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  createFranchise,
  deleteFranchise,
  franchiseUsage,
  listFranchises,
  updateFranchise,
} from '../api/communityApi'
import type { Franchise } from '../types/community'

interface FormValues {
  name: string
  altNames?: string[]
  sortOrder?: number
  isActive?: boolean
}

/**
 * الأنمي/الامتياز بُعد تصنيف مستقل عن الأقسام: «ون بيس» يجمع منتجات من
 * الملابس والإكسسوارات معاً، ولا يُستخدم كقسم رئيسي.
 */
export default function FranchisesPage() {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<FormValues>()
  const [editing, setEditing] = useState<Franchise | null>(null)
  const [open, setOpen] = useState(false)

  const franchisesQuery = useQuery({
    queryKey: ['admin-franchises'],
    queryFn: listFranchises,
  })

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['admin-franchises'] })
  }

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      if (editing) {
        return updateFranchise(editing.id, {
          name: values.name,
          altNames: values.altNames ?? [],
          sortOrder: values.sortOrder,
          isActive: values.isActive,
        })
      }
      return createFranchise({
        name: values.name,
        altNames: values.altNames ?? [],
        sortOrder: values.sortOrder,
      })
    },
    onSuccess: async () => {
      message.success(editing ? 'تم التحديث' : 'أُضيف الأنمي')
      setOpen(false)
      setEditing(null)
      form.resetFields()
      await invalidate()
    },
    onError: (error: Error) => message.error(error.message),
  })

  const removal = useMutation({
    mutationFn: (id: string) => deleteFranchise(id),
    onSuccess: async (result) => {
      message.success(
        result.unlinkedProducts > 0
          ? `حُذف الأنمي وأُزيل من ${result.unlinkedProducts} منتج — المنتجات باقية`
          : 'حُذف الأنمي',
      )
      await invalidate()
      // المنتجات فقدت هذا الوسم: قوائمها ونماذجها تُقرأ من جديد.
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      await queryClient.invalidateQueries({ queryKey: ['product-edit'] })
    },
    onError: (error: Error) => message.error(error.message),
  })

  /**
   * [STEP 64 §6.2] الحذف متاحٌ دائماً ولو ارتبط الأنمي بمنتجات. التأكيد يقرأ
   * عدد المنتجات المرتبطة كلها (النشطة والموقوفة) من الخادم لحظة الضغط،
   * ويقول ما سيحدث: يُزال الوسم وحده، والمنتجات وصورها لا تُحذف.
   */
  async function confirmDelete(franchise: Franchise) {
    let count = franchise.productCount
    try {
      count = (await franchiseUsage(franchise.id)).productCount
    } catch {
      // العدد تقريبي إن تعذّرت القراءة — الخادم يحذف بالعدد الفعلي على كل حال.
    }
    modal.confirm({
      title: `حذف «${franchise.name}»؟`,
      content:
        count > 0
          ? `سيُزال هذا الأنمي من ${count} منتج. المنتجات وصورها وبياناتها الأخرى لن تُحذف — يُحذف الوسم وحده.`
          : 'لا منتجات مرتبطة بهذا الأنمي. لا يمكن التراجع عن الحذف.',
      okText: 'حذف',
      okButtonProps: { danger: true },
      cancelText: 'إلغاء',
      onOk: () => removal.mutateAsync(franchise.id),
    })
  }

  const toggle = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      updateFranchise(input.id, { isActive: input.isActive }),
    onSuccess: invalidate,
    onError: (error: Error) => message.error(error.message),
  })

  function openCreate() {
    setEditing(null)
    form.resetFields()
    setOpen(true)
  }

  function openEdit(franchise: Franchise) {
    setEditing(franchise)
    form.setFieldsValue({
      name: franchise.name,
      altNames: franchise.altNames,
      sortOrder: franchise.sortOrder,
      isActive: franchise.isActive,
    })
    setOpen(true)
  }

  const columns = [
    {
      title: 'الأنمي',
      dataIndex: 'name',
      key: 'name',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      title: 'أسماء البحث',
      dataIndex: 'altNames',
      key: 'altNames',
      render: (values: string[]) =>
        values.length === 0 ? (
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          <Space size={4} wrap>
            {values.map((value) => (
              <Tag key={value}>{value}</Tag>
            ))}
          </Space>
        ),
    },
    {
      title: 'المنتجات المرتبطة',
      dataIndex: 'productCount',
      key: 'productCount',
      width: 160,
      render: (value: number) => <Tag color={value > 0 ? 'blue' : 'default'}>{value}</Tag>,
    },
    {
      title: 'الترتيب',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 100,
    },
    {
      title: 'ظاهر',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (value: boolean, franchise: Franchise) => (
        <Switch
          size="small"
          checked={value}
          loading={toggle.isPending && toggle.variables?.id === franchise.id}
          onChange={(checked) => toggle.mutate({ id: franchise.id, isActive: checked })}
        />
      ),
    },
    {
      title: 'إجراء',
      key: 'actions',
      width: 170,
      render: (_: unknown, franchise: Franchise) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(franchise)}>
            تعديل
          </Button>
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            loading={removal.isPending && removal.variables === franchise.id}
            onClick={() => void confirmDelete(franchise)}
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
            الأنمي والامتيازات
          </Typography.Title>
          <Typography.Text type="secondary">
            بُعد تصنيف مستقل عن الأقسام — «ون بيس» يجمع منتجات من أقسام مختلفة.
          </Typography.Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            loading={franchisesQuery.isFetching}
            onClick={() => franchisesQuery.refetch()}
          >
            تحديث
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            أنمي جديد
          </Button>
        </Space>
      </Flex>

      <Card variant="outlined">
        {franchisesQuery.data?.items.length === 0 && !franchisesQuery.isPending ? (
          <Empty description="لا يوجد أنمي بعد — أضف أول واحد" />
        ) : (
          <Table
            rowKey="id"
            loading={franchisesQuery.isPending}
            columns={columns}
            dataSource={franchisesQuery.data?.items ?? []}
            pagination={false}
            scroll={{ x: 820 }}
          />
        )}
      </Card>

      <Modal
        open={open}
        title={editing ? 'تعديل الأنمي' : 'أنمي جديد'}
        okText="حفظ"
        cancelText="إلغاء"
        confirmLoading={save.isPending}
        onOk={() => form.submit()}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)}>
          <Form.Item
            name="name"
            label="الاسم"
            rules={[{ required: true, message: 'الاسم مطلوب' }]}
          >
            <Input placeholder="ون بيس" maxLength={80} />
          </Form.Item>
          <Form.Item
            name="altNames"
            label="أسماء بديلة للبحث"
            tooltip="يبحث بها العميل عن هذا الأنمي: الاسم العربي، النقحرة، أي تسمية شائعة. الاسم الأساسي مشمول تلقائياً."
            extra="اكتب الاسم ثم اضغط Enter لإضافته."
          >
            <Select
              mode="tags"
              open={false}
              suffixIcon={null}
              placeholder="قاتل الشياطين، Kimetsu no Yaiba"
              tokenSeparators={[',']}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="sortOrder" label="الترتيب">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
          </Form.Item>
          {editing && (
            <Form.Item name="isActive" label="ظاهر للعملاء" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Space>
  )
}
