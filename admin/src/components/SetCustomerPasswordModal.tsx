import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App as AntApp, Alert, Form, Input, Modal, Typography } from 'antd'
import { setCustomerPassword } from '../api/customersApi'
import { ApiError } from '../api/client'

interface Props {
  open: boolean
  customerId: string
  customerName: string
  /** طلب إعادة التعيين المعلَّق الذي يُحسم بهذا الفعل — إن وُجد. */
  requestId?: string
  onClose: () => void
}

/**
 * «تغيير كلمة مرور الزبون» — بعد تحقّق واتساب.
 *
 * ═══ القرار ═══ الكلمة التي يضعها المسؤول هي كلمة المرور **الدائمة**
 * للحساب: لا مؤقّتة، لا انتهاء، لا إجبار على التغيير بعد الدخول، لا شاشة
 * إضافية. الزبون يدخل بها عادياً ويغيّرها من الإعدادات إن شاء.
 *
 * [CRITICAL] الكلمة تُكتب هنا وتُرسَل مرّةً واحدة؛ لا تُعرض بعد الحفظ ولا
 * تُحفظ في المتصفّح ولا تعود في الردّ. المسؤول يبلّغها الزبون بنفسه عبر
 * محادثة واتساب التي تحقّق فيها منه.
 */
export default function SetCustomerPasswordModal({
  open,
  customerId,
  customerName,
  requestId,
  onClose,
}: Props) {
  const [form] = Form.useForm<{ newPassword: string; confirm: string; note?: string }>()
  const { message } = AntApp.useApp()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (values: { newPassword: string; note?: string }) =>
      setCustomerPassword(customerId, {
        newPassword: values.newPassword,
        ...(requestId ? { requestId } : {}),
        ...(values.note ? { note: values.note } : {}),
      }),
    onSuccess: ({ message: text }) => {
      message.success(text || 'وُضعت كلمة المرور الجديدة')
      form.resetFields()
      void queryClient.invalidateQueries({ queryKey: ['account-requests'] })
      void queryClient.invalidateQueries({ queryKey: ['customer-detail', customerId] })
      onClose()
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'تعذّر وضع كلمة المرور')
    },
  })

  return (
    <Modal
      title={`تغيير كلمة مرور الزبون — ${customerName}`}
      open={open}
      onCancel={() => {
        form.resetFields()
        onClose()
      }}
      okText="حفظ كلمة المرور"
      cancelText="إلغاء"
      confirmLoading={mutation.isPending}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="تحقّق من هوية الزبون عبر واتساب قبل الحفظ"
        description="الكلمة الجديدة دائمة ويدخل بها الزبون مباشرةً؛ بلّغه بها في محادثة واتساب نفسها التي تحقّقت فيها منه. الكلمة القديمة لا يمكن استرجاعها ولا عرضها."
      />
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => mutation.mutate({ newPassword: values.newPassword, note: values.note })}
      >
        <Form.Item
          name="newPassword"
          label="كلمة المرور الجديدة"
          rules={[
            { required: true, message: 'أدخل كلمة المرور الجديدة' },
            { min: 8, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' },
          ]}
        >
          <Input.Password autoComplete="new-password" data-testid="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="تأكيد كلمة المرور"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: 'أعد كتابة كلمة المرور' },
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                value === getFieldValue('newPassword')
                  ? Promise.resolve()
                  : Promise.reject(new Error('كلمتا المرور غير متطابقتين')),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" data-testid="confirm-password" />
        </Form.Item>
        <Form.Item name="note" label="ملاحظة (اختيارية)">
          <Input.TextArea rows={2} maxLength={500} placeholder="مثال: تحقّقت من الاسم والمستوى عبر واتساب" />
        </Form.Item>
      </Form>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        لا كلمة مؤقّتة ولا تغيير إجباري: هذه هي كلمة المرور الفعلية حتى يغيّرها الزبون بنفسه من الإعدادات.
      </Typography.Text>
    </Modal>
  )
}
