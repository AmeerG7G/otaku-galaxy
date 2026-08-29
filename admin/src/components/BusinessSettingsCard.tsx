import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  InputNumber,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  getBusinessSettings,
  updateBusinessSettings,
} from '../api/businessSettingsApi'
import type { BusinessSetting, BusinessSettingKey } from '../types/businessSettings'

type FormValues = Partial<Record<BusinessSettingKey, number | null>>

/**
 * إعدادات الأعمال — القيم التجارية التي يضبطها صاحب المتجر.
 *
 * تعرض لكل إعداد أربعة أشياء متمايزة عمداً: القيمة المحفوظة، والقيمة
 * الفعّالة، والافتراضية، والمدى المسموح. بدون هذا التمييز لا يعرف المسؤول
 * هل الرقم الذي يراه اختيارُه أم افتراضُ النظام.
 *
 * الحقول الأمنية (دورات التشفير، أعمار الرموز، حدود المعدّل) ليست هنا ولا
 * يجوز أن تكون: ضبطها من المتصفح يجعل إضعاف المنظومة عمليةَ نقرة واحدة.
 */
export default function BusinessSettingsCard() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<FormValues>()

  const query = useQuery({
    queryKey: ['admin-business-settings'],
    queryFn: getBusinessSettings,
  })

  useEffect(() => {
    if (!query.data) return
    const values: FormValues = {}
    for (const item of query.data.items) {
      // الحقل الفارغ يعني «غير مضبوط»؛ لا نملؤه بالافتراضي كي لا يتحوّل
      // مجرّدُ فتح الصفحة والحفظ إلى تثبيتٍ صامت لقيمة لم يخترها أحد.
      values[item.key] = item.value === null ? null : Number(item.value)
    }
    form.setFieldsValue(values)
  }, [query.data, form])

  const mutation = useMutation({
    mutationFn: updateBusinessSettings,
    onSuccess: (result) => {
      message.success(result.message || 'حُفظت الإعدادات')
      void queryClient.invalidateQueries({ queryKey: ['admin-business-settings'] })
    },
    onError: (error: Error) => message.error(error.message),
  })

  const columns = [
    {
      title: 'الإعداد',
      key: 'label',
      render: (_: unknown, row: BusinessSetting) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{row.label}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.description}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'القيمة',
      key: 'value',
      width: 170,
      render: (_: unknown, row: BusinessSetting) => (
        <Form.Item
          name={row.key}
          style={{ marginBottom: 0 }}
          rules={[
            {
              type: 'number',
              min: row.min,
              max: row.max,
              message: `بين ${row.min} و${row.max}`,
            },
          ]}
        >
          <InputNumber
            min={row.min}
            max={row.max}
            step={1}
            precision={row.integer ? 0 : undefined}
            placeholder={`${row.defaultValue} (افتراضي)`}
            style={{ width: '100%' }}
            addonAfter={row.unit}
          />
        </Form.Item>
      ),
    },
    {
      title: 'الفعّال الآن',
      key: 'effective',
      width: 130,
      render: (_: unknown, row: BusinessSetting) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>
            {row.effectiveValue} {row.unit}
          </Typography.Text>
          {row.usingDefault ? (
            <Tag color="default">افتراضي</Tag>
          ) : (
            <Tag color="blue">مضبوط</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'الافتراضي',
      key: 'default',
      width: 110,
      render: (_: unknown, row: BusinessSetting) => (
        <Typography.Text type="secondary">
          {row.defaultValue} {row.unit}
        </Typography.Text>
      ),
    },
    {
      title: 'المدى',
      key: 'range',
      width: 110,
      render: (_: unknown, row: BusinessSetting) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {row.min} – {row.max}
        </Typography.Text>
      ),
    },
  ]

  return (
    <Card title="إعدادات الأعمال" variant="outlined" loading={query.isPending}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="التغيير يسري على ما يأتي فقط"
          description="تغيير قيم النقاط لا يمسّ أي نقطة مُنحت سابقاً — الدفتر يحفظ المبلغ الذي مُنح لحظة وقوعه. وتغيير مهلة التقييم يسري على الطلبات التي تخرج للتوصيل بعد الحفظ؛ الطلبات القائمة تحتفظ بموعدها ولا يُعاد تشغيل عدّاد أحد. أفرغ الحقل للعودة إلى القيمة الافتراضية."
        />

        <Form form={form} onFinish={(values) => mutation.mutate(values)}>
          <Table
            rowKey="key"
            size="small"
            pagination={false}
            columns={columns}
            dataSource={query.data?.items ?? []}
            scroll={{ x: 780 }}
          />
          <Button
            type="primary"
            htmlType="submit"
            loading={mutation.isPending}
            style={{ marginTop: 16 }}
          >
            حفظ إعدادات الأعمال
          </Button>
        </Form>
      </Space>
    </Card>
  )
}
