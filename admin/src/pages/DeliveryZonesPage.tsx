import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
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
  Select,
  Space,
  Switch,
  Table,
  Typography,
} from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { createZone, deleteZone, listZones, updateZone } from '../api/communityApi'
import { listAdminGovernorates } from '../api/governoratesApi'
import type { DeliveryZone } from '../types/community'
import { formatCurrency } from '../utils/format'

interface FormValues {
  governorateId: string
  name: string
  deliveryFee: number
  sortOrder?: number
  isActive?: boolean
}

/**
 * مناطق التوصيل داخل المحافظة. متى وُجدت مناطق نشطة لمحافظة، صار اختيار
 * المنطقة إلزامياً في الدفع، ورسومها هي المحتسبة بدل رسوم المحافظة.
 */
export default function DeliveryZonesPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<FormValues>()
  const [editing, setEditing] = useState<DeliveryZone | null>(null)
  const [open, setOpen] = useState(false)

  const zonesQuery = useQuery({ queryKey: ['admin-zones'], queryFn: listZones })
  const governoratesQuery = useQuery({
    queryKey: ['admin-governorates'],
    queryFn: listAdminGovernorates,
  })

  const governorateName = useMemo(() => {
    const map = new Map<string, string>()
    for (const governorate of governoratesQuery.data?.items ?? []) {
      map.set(governorate.id, governorate.name)
    }
    return map
  }, [governoratesQuery.data])

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['admin-zones'] })
  }

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      if (editing) {
        return updateZone(editing.id, {
          name: values.name,
          deliveryFee: values.deliveryFee,
          sortOrder: values.sortOrder,
          isActive: values.isActive,
        })
      }
      return createZone({
        governorateId: values.governorateId,
        name: values.name,
        deliveryFee: values.deliveryFee,
        sortOrder: values.sortOrder,
      })
    },
    onSuccess: async () => {
      message.success(editing ? 'تم التحديث' : 'أُضيفت المنطقة')
      setOpen(false)
      setEditing(null)
      form.resetFields()
      await invalidate()
    },
    onError: (error: Error) => message.error(error.message),
  })

  const removal = useMutation({
    mutationFn: (id: string) => deleteZone(id),
    onSuccess: async () => {
      message.success('حُذفت المنطقة')
      await invalidate()
    },
    onError: (error: Error) => message.error(error.message),
  })

  function openCreate() {
    setEditing(null)
    form.resetFields()
    setOpen(true)
  }

  function openEdit(zone: DeliveryZone) {
    setEditing(zone)
    form.setFieldsValue({
      governorateId: zone.governorateId,
      name: zone.name,
      deliveryFee: zone.deliveryFee,
      sortOrder: zone.sortOrder,
      isActive: zone.isActive,
    })
    setOpen(true)
  }

  const columns = [
    {
      title: 'المحافظة',
      dataIndex: 'governorateId',
      key: 'governorateId',
      render: (value: string) => governorateName.get(value) ?? '—',
    },
    {
      title: 'المنطقة',
      dataIndex: 'name',
      key: 'name',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      title: 'رسوم التوصيل',
      dataIndex: 'deliveryFee',
      key: 'deliveryFee',
      width: 160,
      render: (value: number) => formatCurrency(value),
    },
    { title: 'الترتيب', dataIndex: 'sortOrder', key: 'sortOrder', width: 90 },
    {
      title: 'مفعّلة',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (value: boolean) => (value ? 'نعم' : 'لا'),
    },
    {
      title: 'إجراء',
      key: 'actions',
      width: 170,
      render: (_: unknown, zone: DeliveryZone) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(zone)}>
            تعديل
          </Button>
          <Popconfirm
            title="حذف المنطقة"
            description="الطلبات السابقة تحتفظ باسم منطقتها."
            okText="حذف"
            cancelText="إلغاء"
            okButtonProps={{ danger: true }}
            onConfirm={() => removal.mutate(zone.id)}
          >
            <Button danger size="small" icon={<DeleteOutlined />}>
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
            مناطق التوصيل
          </Typography.Title>
          <Typography.Text type="secondary">
            رسوم مستقلة داخل المحافظة الواحدة (داخل/خارج قضاء النجف مثلاً).
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          منطقة جديدة
        </Button>
      </Flex>

      <Alert
        type="info"
        showIcon
        message="متى أضفت منطقة واحدة لمحافظة، صار اختيار المنطقة إلزامياً على العميل في الدفع، ورسوم المنطقة هي المحتسبة بدل رسوم المحافظة."
      />

      <Card variant="outlined">
        {zonesQuery.data?.items.length === 0 && !zonesQuery.isPending ? (
          <Empty description="لا توجد مناطق — المحافظات تستخدم رسومها العامة" />
        ) : (
          <Table
            rowKey="id"
            loading={zonesQuery.isPending}
            columns={columns}
            dataSource={zonesQuery.data?.items ?? []}
            pagination={false}
            scroll={{ x: 760 }}
          />
        )}
      </Card>

      <Modal
        open={open}
        title={editing ? 'تعديل المنطقة' : 'منطقة جديدة'}
        okText="حفظ"
        cancelText="إلغاء"
        confirmLoading={save.isPending}
        onOk={() => form.submit()}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)}>
          <Form.Item
            name="governorateId"
            label="المحافظة"
            rules={[{ required: true, message: 'اختر المحافظة' }]}
          >
            <Select
              disabled={editing !== null}
              placeholder="اختر المحافظة"
              options={(governoratesQuery.data?.items ?? []).map((governorate) => ({
                value: governorate.id,
                label: governorate.name,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label="اسم المنطقة"
            rules={[{ required: true, message: 'الاسم مطلوب' }]}
          >
            <Input placeholder="داخل قضاء النجف" maxLength={80} />
          </Form.Item>
          <Form.Item
            name="deliveryFee"
            label="رسوم التوصيل"
            rules={[{ required: true, message: 'الرسوم مطلوبة' }]}
          >
            <InputNumber min={0} step={500} style={{ width: '100%' }} placeholder="4000" />
          </Form.Item>
          <Form.Item name="sortOrder" label="الترتيب">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
          </Form.Item>
          {editing && (
            <Form.Item name="isActive" label="مفعّلة" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Space>
  )
}
