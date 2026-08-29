import { useState } from 'react'
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
  createGovernorate,
  deleteGovernorate,
  listAdminGovernorates,
  updateGovernorate,
} from '../api/governoratesApi'
import { ApiError } from '../api/client'
import type { AdminGovernorate } from '../types/governorates'
import { formatCurrency } from '../utils/format'
import EmptyState from '../components/EmptyState'

interface GovernorateFormValues {
  name: string
  deliveryFee: number
}

export default function GovernoratesPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [editor, setEditor] = useState<{ governorate?: AdminGovernorate } | null>(
    null,
  )

  const governoratesQuery = useQuery({
    queryKey: ['governorates'],
    queryFn: listAdminGovernorates,
  })

  const invalidateGovernorates = () => {
    queryClient.invalidateQueries({ queryKey: ['governorates'] })
  }

  const createMutation = useMutation({
    mutationFn: createGovernorate,
    onSuccess: (result) => {
      message.success(result.message)
      setEditor(null)
      invalidateGovernorates()
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; values: GovernorateFormValues }) =>
      updateGovernorate(input.id, {
        name: input.values.name,
        deliveryFee: input.values.deliveryFee,
      }),
    onSuccess: (result) => {
      message.success(result.message)
      setEditor(null)
      invalidateGovernorates()
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteGovernorate,
    onSuccess: (result) => {
      message.success(result.message || 'حُذفت المحافظة')
      void queryClient.invalidateQueries({ queryKey: ['admin-governorates'] })
    },
    // الخادم يشرح ما الذي يمنع الحذف (طلبات/مناطق) — تُعرض رسالته كما هي.
    onError: (error: Error) => message.error(error.message),
  })

  const columns = [
    {
      title: 'المحافظة',
      dataIndex: 'name',
      key: 'name',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      title: 'رسوم التوصيل',
      dataIndex: 'deliveryFee',
      key: 'deliveryFee',
      render: (value: number) => formatCurrency(value),
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
      width: 120,
      render: (_: unknown, governorate: AdminGovernorate) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => setEditor({ governorate })}
          >
            تعديل
          </Button>
          <Popconfirm
            title="حذف المحافظة؟"
            description="يُرفض الحذف إن كانت طلبات أو مناطق توصيل مرتبطة بها."
            okText="حذف"
            cancelText="إلغاء"
            okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
            onConfirm={() => deleteMutation.mutate(governorate.id)}
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
            المحافظات
          </Typography.Title>
          <Typography.Text type="secondary">
            محافظات التوصيل في المتجر.
          </Typography.Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            loading={governoratesQuery.isFetching}
            onClick={() => governoratesQuery.refetch()}
          >
            تحديث
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setEditor({})}
          >
            إضافة محافظة
          </Button>
        </Space>
      </Flex>

      <Alert
        type="info"
        showIcon
        message="تُعرض المحافظات النشطة فقط، ولا يوفر الخادم تفعيل/تعطيل محافظة."
        description="تُنشأ المحافظة الجديدة نشطة دائماً؛ والمحافظات الموقوفة لا تظهر في هذه القائمة ولا يمكن تغيير حالتها عبر لوحة الإدارة."
      />

      <Card>
        {governoratesQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message="تعذر تحميل المحافظات"
            description={governoratesQuery.error.message}
            action={
              <Button size="small" onClick={() => governoratesQuery.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={governoratesQuery.data?.items ?? []}
            loading={governoratesQuery.isPending || governoratesQuery.isFetching}
            scroll={{ x: 700 }}
            locale={{
              emptyText: (
                <EmptyState
                  description="لا توجد محافظات بعد"
                  actionLabel="إضافة محافظة"
                  onAction={() => setEditor({})}
                />
              ),
            }}
          />
        )}
      </Card>

      <Modal
        open={editor !== null && !editor.governorate}
        title="إضافة محافظة"
        onCancel={() => setEditor(null)}
        destroyOnHidden
        footer={null}
      >
        <GovernorateForm
          submitting={createMutation.isPending}
          onSubmit={(values) => createMutation.mutate(values)}
          onCancel={() => setEditor(null)}
        />
      </Modal>

      <Modal
        open={editor?.governorate != null}
        title={`تعديل المحافظة: ${editor?.governorate?.name ?? ''}`}
        onCancel={() => setEditor(null)}
        destroyOnHidden
        footer={null}
      >
        {editor?.governorate && (
          <GovernorateForm
            initialValues={{
              name: editor.governorate.name,
              deliveryFee: editor.governorate.deliveryFee,
            }}
            submitting={updateMutation.isPending}
            onSubmit={(values) =>
              updateMutation.mutate({ id: editor.governorate!.id, values })
            }
            onCancel={() => setEditor(null)}
          />
        )}
      </Modal>
    </Space>
  )
}

interface GovernorateFormProps {
  initialValues?: Partial<GovernorateFormValues>
  submitting: boolean
  onSubmit: (values: GovernorateFormValues) => void
  onCancel: () => void
}

function GovernorateForm({
  initialValues,
  submitting,
  onSubmit,
  onCancel,
}: GovernorateFormProps) {
  const [form] = Form.useForm<GovernorateFormValues>()
  return (
    <Form<GovernorateFormValues>
      form={form}
      layout="vertical"
      initialValues={initialValues}
      onFinish={onSubmit}
      style={{ marginTop: 8 }}
    >
      <Form.Item
        name="name"
        label="اسم المحافظة"
        rules={[
          { required: true, message: 'اسم المحافظة مطلوب' },
          { min: 2, max: 60, message: 'الاسم يجب أن يكون بين 2 و 60 حرفاً' },
        ]}
      >
        <Input />
      </Form.Item>
      <Form.Item
        name="deliveryFee"
        label="رسوم التوصيل (دينار)"
        rules={[{ required: true, message: 'رسوم التوصيل مطلوبة' }]}
      >
        <InputNumber min={0} max={100000} style={{ width: '100%' }} precision={0} />
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