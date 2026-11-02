import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App as AntApp, Alert, Flex, Form, Input, Modal, Select } from 'antd'
import { correctCustomerBirthday } from '../api/customersApi'
import { ApiError } from '../api/client'

interface Props {
  open: boolean
  customerId: string
  customerName: string
  /** التاريخ المحفوظ الآن — يبدأ منه النموذج. */
  day: number
  month: number
  onClose: () => void
}

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

/**
 * «تصحيح تاريخ الميلاد» (STEP 76 D1).
 *
 * الزبون يضبط تاريخه مرةً واحدة ولا يغيّره؛ تصحيحٌ بعدها هنا فقط، بسببٍ مكتوب
 * يُحفظ في سجلّ التدقيق مع التاريخين القديم والجديد. صحة اليوم داخل الشهر
 * والتدقيق كلاهما على الخادم — النموذج لا يقرّر شيئاً.
 */
export default function BirthdayCorrectionModal({ open, customerId, customerName, day, month, onClose }: Props) {
  const [form] = Form.useForm<{ day: number; month: number; reason: string }>()
  const { message } = AntApp.useApp()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (values: { day: number; month: number; reason: string }) =>
      correctCustomerBirthday(customerId, { day: values.day, month: values.month, reason: values.reason.trim() }),
    onSuccess: (result) => {
      message.success(result.changed ? 'صُحِّح تاريخ الميلاد' : 'التاريخ نفسه محفوظ — لا تغيير')
      void queryClient.invalidateQueries({ queryKey: ['admin-birthdays'] })
      void queryClient.invalidateQueries({ queryKey: ['customer-detail', customerId] })
      form.resetFields()
      onClose()
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'تعذّر تصحيح التاريخ')
    },
  })

  return (
    <Modal
      title={`تصحيح تاريخ الميلاد — ${customerName}`}
      open={open}
      onCancel={() => {
        form.resetFields()
        onClose()
      }}
      okText="حفظ التصحيح"
      cancelText="إلغاء"
      confirmLoading={mutation.isPending}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="يُسجَّل التصحيح في سجلّ التدقيق باسمك مع التاريخ السابق"
        description="خصم عيد الميلاد مرةً واحدة في السنة: نقل التاريخ لا يمنح خصماً ثانياً في السنة نفسها."
      />
      <Form
        form={form}
        layout="vertical"
        initialValues={{ day, month }}
        onFinish={(values) => mutation.mutate(values)}
      >
        <Flex gap={12}>
          <Form.Item name="day" label="اليوم" rules={[{ required: true, message: 'اختر اليوم' }]} style={{ flex: 1 }}>
            <Select
              data-testid="birthday-day"
              options={Array.from({ length: 31 }, (_, index) => ({ value: index + 1, label: String(index + 1) }))}
            />
          </Form.Item>
          <Form.Item name="month" label="الشهر" rules={[{ required: true, message: 'اختر الشهر' }]} style={{ flex: 2 }}>
            <Select
              data-testid="birthday-month"
              options={MONTHS.map((label, index) => ({ value: index + 1, label }))}
            />
          </Form.Item>
        </Flex>
        <Form.Item
          name="reason"
          label="سبب التصحيح"
          rules={[
            { required: true, whitespace: true, message: 'اكتب سبب التصحيح' },
            { min: 3, message: 'اكتب سبب التصحيح' },
            { max: 200, message: 'السبب أطول من ٢٠٠ حرف' },
          ]}
        >
          <Input.TextArea rows={2} maxLength={200} data-testid="birthday-reason" placeholder="مثال: الزبون أدخل الشهر خطأً — تحقّقت عبر واتساب" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
