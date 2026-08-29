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
  Popconfirm,
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
  listFranchises,
  updateFranchise,
} from '../api/communityApi'
import type { Franchise } from '../types/community'

interface FormValues {
  name: string
  sortOrder?: number
  isActive?: boolean
}

/**
 * الأنمي/الامتياز بُعد تصنيف مستقل عن الأقسام: «ون بيس» يجمع منتجات من
 * الملابس والإكسسوارات معاً، ولا يُستخدم كقسم رئيسي.
 */
export default function FranchisesPage() {
  const { message } = App.useApp()
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
          sortOrder: values.sortOrder,
          isActive: values.isActive,
        })
      }
      return createFranchise({ name: values.name, sortOrder: values.sortOrder })
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
    onSuccess: async () => {
      message.success('حُذف الأنمي')
      await invalidate()
    },
    onError: (error: Error) => message.error(error.message),
  })

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
          <Popconfirm
            title="حذف الأنمي"
            description={
              franchise.productCount > 0
                ? 'مرتبط بمنتجات — أوقفه بدل حذفه.'
                : 'لا يمكن التراجع عن الحذف.'
            }
            okText="حذف"
            cancelText="إلغاء"
            okButtonProps={{ danger: true }}
            disabled={franchise.productCount > 0}
            onConfirm={() => removal.mutate(franchise.id)}
          >
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              disabled={franchise.productCount > 0}
            >
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
            scroll={{ x: 700 }}
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
