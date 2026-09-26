import { useMemo, useState } from 'react'
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
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  deleteGovernorate,
  listAdminGovernorates,
  updateGovernorate,
} from '../api/governoratesApi'
import { createZone, deleteZone, listZones, updateZone } from '../api/communityApi'
import type { AdminGovernorate } from '../types/governorates'
import type { DeliveryZone } from '../types/community'
import { formatCurrency } from '../utils/format'
import EmptyState from '../components/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'

interface GovernorateFormValues {
  name: string
  deliveryFee: number
  isActive?: boolean
}

interface ZoneFormValues {
  name: string
  deliveryFee: number
  sortOrder?: number
  isActive?: boolean
}

/**
 * المحافظات والتوصيل — شاشة واحدة لما كان شاشتين.
 *
 * المحافظة ومناطقها قرار تسعير واحد لا قراران: رسوم المحافظة هي المحتسبة
 * ما لم تُقسَّم مناطق، وعندها تحلّ رسوم المنطقة محلها ويصير اختيارها
 * إلزامياً على العميل. فصلهما في قائمتين كان يخفي هذه العلاقة تماماً —
 * يعدّل المسؤول رسوم النجف ولا يفهم لماذا لم يتغيّر ما يدفعه الزبون.
 *
 * الحساب كله على الخادم: هذه الشاشة تحرّر القيم فقط، ولا تحسب سعراً.
 */
export default function DeliveryPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [governorateForm] = Form.useForm<GovernorateFormValues>()
  const [zoneForm] = Form.useForm<ZoneFormValues>()

  const [governorateEditor, setGovernorateEditor] = useState<{
    governorate?: AdminGovernorate
  } | null>(null)
  const [zoneEditor, setZoneEditor] = useState<{
    governorate: AdminGovernorate
    zone?: DeliveryZone
  } | null>(null)

  const governoratesQuery = useQuery({
    queryKey: ['admin-governorates'],
    queryFn: listAdminGovernorates,
  })
  const zonesQuery = useQuery({ queryKey: ['admin-zones'], queryFn: listZones })

  /** مناطق كل محافظة — مفتاحها معرّف المحافظة. */
  const zonesByGovernorate = useMemo(() => {
    const map = new Map<string, DeliveryZone[]>()
    for (const zone of zonesQuery.data?.items ?? []) {
      const list = map.get(zone.governorateId) ?? []
      list.push(zone)
      map.set(zone.governorateId, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder)
    return map
  }, [zonesQuery.data])

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-governorates'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-zones'] }),
    ])
  }

  const saveGovernorate = useMutation({
    mutationFn: (values: GovernorateFormValues) => {
      if (!governorateEditor?.governorate) {
        throw new Error('لا توجد محافظة للتعديل')
      }
      return updateGovernorate(governorateEditor.governorate.id, values)
    },
    onSuccess: async (result) => {
      message.success(result.message || 'تم الحفظ')
      setGovernorateEditor(null)
      governorateForm.resetFields()
      await refresh()
    },
    onError: (error: Error) => message.error(error.message),
  })

  const removeGovernorate = useMutation({
    mutationFn: deleteGovernorate,
    // الخادم يشرح ما الذي يمنع الحذف (طلبات/مناطق) — تُعرض رسالته كما هي.
    onSuccess: async (result) => {
      message.success(result.message || 'حُذفت المحافظة')
      await refresh()
    },
    onError: (error: Error) => message.error(error.message),
  })

  /** إيقاف المحافظة عن الواجهة أو إعادتها — بديل الحذف ما دامت مشغولة. */
  const toggleGovernorate = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      updateGovernorate(input.id, { isActive: input.isActive }),
    onSuccess: async () => {
      await refresh()
    },
    onError: (error: Error) => message.error(error.message),
  })

  const saveZone = useMutation({
    mutationFn: (values: ZoneFormValues) => {
      if (!zoneEditor) throw new Error('لا محافظة محددة')
      if (zoneEditor.zone) {
        return updateZone(zoneEditor.zone.id, {
          name: values.name,
          deliveryFee: values.deliveryFee,
          sortOrder: values.sortOrder,
          isActive: values.isActive,
        })
      }
      return createZone({
        governorateId: zoneEditor.governorate.id,
        name: values.name,
        deliveryFee: values.deliveryFee,
        sortOrder: values.sortOrder,
      })
    },
    onSuccess: async () => {
      message.success(zoneEditor?.zone ? 'تم التحديث' : 'أُضيفت المنطقة')
      setZoneEditor(null)
      zoneForm.resetFields()
      await refresh()
    },
    onError: (error: Error) => message.error(error.message),
  })

  const removeZone = useMutation({
    mutationFn: (id: string) => deleteZone(id),
    onSuccess: async () => {
      message.success('حُذفت المنطقة')
      await refresh()
    },
    onError: (error: Error) => message.error(error.message),
  })

  function openGovernorate(governorate: AdminGovernorate) {
    setGovernorateEditor({ governorate })
    governorateForm.setFieldsValue({
      name: governorate.name,
      deliveryFee: governorate.deliveryFee,
      isActive: governorate.isActive,
    })
  }

  function openZone(governorate: AdminGovernorate, zone?: DeliveryZone) {
    setZoneEditor({ governorate, zone })
    zoneForm.setFieldsValue({
      name: zone?.name ?? '',
      deliveryFee: zone?.deliveryFee ?? governorate.deliveryFee,
      sortOrder: zone?.sortOrder ?? zonesByGovernorate.get(governorate.id)?.length ?? 0,
      isActive: zone?.isActive ?? true,
    })
  }

  const governorateColumns = [
    {
      title: 'المحافظة',
      dataIndex: 'name',
      key: 'name',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      title: 'رسوم التوصيل',
      key: 'deliveryFee',
      width: 220,
      render: (_: unknown, governorate: AdminGovernorate) => {
        const zones = zonesByGovernorate.get(governorate.id) ?? []
        const active = zones.filter((zone) => zone.isActive)
        if (active.length === 0) return formatCurrency(governorate.deliveryFee)
        const fees = active.map((zone) => zone.deliveryFee)
        const min = Math.min(...fees)
        const max = Math.max(...fees)
        return (
          <Tooltip title="المناطق تتجاوز رسوم المحافظة — الرسوم المحتسبة هي رسوم المنطقة المختارة.">
            <span>
              {min === max
                ? formatCurrency(min)
                : `${formatCurrency(min)} — ${formatCurrency(max)}`}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: 'المناطق',
      key: 'zones',
      width: 160,
      render: (_: unknown, governorate: AdminGovernorate) => {
        const zones = zonesByGovernorate.get(governorate.id) ?? []
        return zones.length === 0 ? (
          <Tag color="default">رسوم موحّدة</Tag>
        ) : (
          <Tag color="blue">{zones.length} منطقة</Tag>
        )
      },
    },
    {
      title: 'الحالة',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 120,
      render: (value: boolean, governorate: AdminGovernorate) => (
        <Switch
          size="small"
          checked={value}
          checkedChildren="نشطة"
          unCheckedChildren="موقوفة"
          loading={
            toggleGovernorate.isPending &&
            toggleGovernorate.variables?.id === governorate.id
          }
          onChange={(checked) =>
            toggleGovernorate.mutate({ id: governorate.id, isActive: checked })
          }
        />
      ),
    },
    {
      title: 'الإجراءات',
      key: 'actions',
      width: 280,
      render: (_: unknown, governorate: AdminGovernorate) => (
        <Space size={4} wrap>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => openZone(governorate)}
          >
            منطقة
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openGovernorate(governorate)}
          >
            تعديل
          </Button>
          <Popconfirm
            title="حذف المحافظة"
            description="مرفوض ما دامت طلبات أو مناطق مرتبطة بها."
            okText="حذف"
            cancelText="إلغاء"
            okButtonProps={{ danger: true }}
            onConfirm={() => removeGovernorate.mutate(governorate.id)}
          >
            <Button danger size="small" icon={<DeleteOutlined />}>
              حذف
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  function zoneTable(governorate: AdminGovernorate) {
    const zones = zonesByGovernorate.get(governorate.id) ?? []
    if (zones.length === 0) {
      return (
        <Alert
          type="info"
          showIcon
          message={`«${governorate.name}» بلا مناطق — كل الزبائن يدفعون ${formatCurrency(governorate.deliveryFee)}.`}
          description="أضف منطقتين أو أكثر إن اختلفت الرسوم داخل المحافظة (داخل القضاء / خارجه)."
          action={
            <Button size="small" onClick={() => openZone(governorate)}>
              أضف منطقة
            </Button>
          }
        />
      )
    }
    return (
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={zones}
        columns={[
          {
            title: 'المنطقة',
            dataIndex: 'name',
            key: 'name',
            render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
          },
          {
            title: 'الرسوم',
            dataIndex: 'deliveryFee',
            key: 'deliveryFee',
            width: 150,
            render: (value: number) => formatCurrency(value),
          },
          { title: 'الترتيب', dataIndex: 'sortOrder', key: 'sortOrder', width: 90 },
          {
            title: 'مفعّلة',
            dataIndex: 'isActive',
            key: 'isActive',
            width: 100,
            render: (value: boolean) =>
              value ? <Tag color="green">نعم</Tag> : <Tag>لا</Tag>,
          },
          {
            title: 'إجراء',
            key: 'actions',
            width: 180,
            render: (_: unknown, zone: DeliveryZone) => (
              <Space size={4}>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openZone(governorate, zone)}
                >
                  تعديل
                </Button>
                <Popconfirm
                  title="حذف المنطقة"
                  description="الطلبات السابقة تحتفظ باسم منطقتها."
                  okText="حذف"
                  cancelText="إلغاء"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => removeZone.mutate(zone.id)}
                >
                  <Button danger size="small" icon={<DeleteOutlined />}>
                    حذف
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    )
  }

  const loading = governoratesQuery.isPending || zonesQuery.isPending

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="المحافظات والتوصيل"
        description="رسوم التوصيل لكل محافظة، ومناطقها حين تختلف الرسوم داخلها."
        extra={
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              loading={governoratesQuery.isFetching || zonesQuery.isFetching}
              onClick={() => void refresh()}
            >
              تحديث
            </Button>
          </Space>
        }
      />

      <Alert
        type="info"
        showIcon
        message="كيف تُحتسب رسوم التوصيل"
        description="بلا مناطق: يدفع الزبون رسوم المحافظة. مع منطقة نشطة واحدة أو أكثر: يختار الزبون منطقته إجبارياً في الدفع، وتُحتسب رسومها. الحساب يجري على الخادم دائماً — التطبيق يعرض ولا يحسب."
      />

      <Card variant="outlined">
        <Table
          rowKey="id"
          loading={loading}
          columns={governorateColumns}
          dataSource={governoratesQuery.data?.items ?? []}
          pagination={false}
          scroll={{ x: 860 }}
          expandable={{
            expandedRowRender: (governorate: AdminGovernorate) => zoneTable(governorate),
            rowExpandable: () => true,
          }}
          locale={{
            emptyText: (
              <EmptyState
                description="لا توجد محافظات"
              />
            ),
          }}
        />
      </Card>

      <Modal
        open={governorateEditor !== null}
        title="تعديل المحافظة"
        okText="حفظ"
        cancelText="إلغاء"
        confirmLoading={saveGovernorate.isPending}
        onOk={() => governorateForm.submit()}
        onCancel={() => setGovernorateEditor(null)}
        destroyOnHidden
      >
        <Form
          form={governorateForm}
          layout="vertical"
          onFinish={(values) => saveGovernorate.mutate(values)}
        >
          <Form.Item
            name="name"
            label="الاسم"
            rules={[{ required: true, message: 'الاسم مطلوب' }]}
          >
            <Input placeholder="النجف" maxLength={80} />
          </Form.Item>
          <Form.Item
            name="deliveryFee"
            label="رسوم التوصيل الافتراضية"
            extra="تُستخدم ما لم تُقسَّم المحافظة مناطق."
            rules={[{ required: true, message: 'الرسوم مطلوبة' }]}
          >
            <InputNumber min={0} step={500} style={{ width: '100%' }} placeholder="4000" />
          </Form.Item>
          {governorateEditor?.governorate && (
            <Form.Item name="isActive" label="نشطة للطلبات" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        open={zoneEditor !== null}
        title={
          zoneEditor?.zone
            ? `تعديل منطقة — ${zoneEditor.governorate.name}`
            : `منطقة جديدة — ${zoneEditor?.governorate.name ?? ''}`
        }
        okText="حفظ"
        cancelText="إلغاء"
        confirmLoading={saveZone.isPending}
        onOk={() => zoneForm.submit()}
        onCancel={() => setZoneEditor(null)}
        destroyOnHidden
      >
        <Form form={zoneForm} layout="vertical" onFinish={(values) => saveZone.mutate(values)}>
          <Form.Item
            name="name"
            label="اسم المنطقة"
            extra="هذا النص هو ما يقرؤه الزبون في الدفع."
            rules={[{ required: true, message: 'الاسم مطلوب' }]}
          >
            <Input placeholder="داخل قضاء النجف" maxLength={80} />
          </Form.Item>
          <Form.Item
            name="deliveryFee"
            label="رسوم التوصيل"
            rules={[{ required: true, message: 'الرسوم مطلوبة' }]}
          >
            <InputNumber min={0} step={500} style={{ width: '100%' }} placeholder="3000" />
          </Form.Item>
          <Form.Item name="sortOrder" label="الترتيب">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
          </Form.Item>
          {zoneEditor?.zone && (
            <Form.Item name="isActive" label="مفعّلة" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Space>
  )
}
