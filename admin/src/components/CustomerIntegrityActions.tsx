import { useState } from 'react'
import { App, Button, Input, Modal, Radio, Space, Tag, Typography } from 'antd'
import { useMutation } from '@tanstack/react-query'
import { completeCustomerGender, setCustomerInternal } from '../api/customersApi'
import type { CustomerGender } from '../types/customers'

/**
 * إكمال جنس حسابٍ قديم (D5) — الزرّ يظهر **فقط** لحسابٍ بلا جنس (شذوذ ما قبل ٠٤٠).
 * ذكر أو أنثى، مرةً واحدة، بعد التحقّق من صاحب الحساب نفسه عبر واتساب.
 */
export function CompleteGenderAction({ customerId, onDone }: { customerId: string; onDone: () => void }) {
  const { message } = App.useApp()
  const [open, setOpen] = useState(false)
  const [gender, setGender] = useState<CustomerGender | null>(null)
  const save = useMutation({
    mutationFn: () => completeCustomerGender(customerId, gender!),
    onSuccess: () => {
      message.success('أُكمل جنس الحساب')
      setOpen(false)
      onDone()
    },
    onError: (error: Error) => {
      // لا تُعاد قيمة `message.error` (thenable يُحسم عند إغلاق الرسالة): React Query
      // ينتظرها، فيبقى الزرّ «يُحمَّل» ثلاث ثوانٍ بعد فشلٍ انتهى فعلاً.
      message.error(error.message)
    },
  })
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>
        إكمال جنس الحساب
      </Button>
      <Modal
        open={open}
        title="إكمال جنس الحساب"
        okText="حفظ"
        cancelText="إلغاء"
        onCancel={() => setOpen(false)}
        onOk={() => save.mutate()}
        okButtonProps={{ disabled: !gender, loading: save.isPending }}
        destroyOnHidden
      >
        <Space direction="vertical" size={12}>
          <Typography.Text>تحقّق من صاحب الحساب عبر واتساب أولاً، ثم اختر:</Typography.Text>
          <Radio.Group value={gender} onChange={(e) => setGender(e.target.value as CustomerGender)}>
            <Radio value="male">ذكر</Radio>
            <Radio value="female">أنثى</Radio>
          </Radio.Group>
        </Space>
      </Modal>
    </>
  )
}

/** حساب داخلي/اختباري (D2) — للمسؤول الأعلى؛ يُخرج طلبات الحساب من التحليلات. */
export function InternalAccountAction({
  customerId,
  isInternal,
  onDone,
}: {
  customerId: string
  isInternal: boolean
  onDone: () => void
}) {
  const { message } = App.useApp()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const save = useMutation({
    mutationFn: () => setCustomerInternal(customerId, { isInternal: !isInternal, reason: reason.trim() }),
    onSuccess: (result) => {
      message.success(result.isInternalAccount ? 'عُلِّم الحساب داخلياً — خارج التحليلات' : 'أُعيد الحساب إلى التحليلات')
      setOpen(false)
      setReason('')
      onDone()
    },
    onError: (error: Error) => {
      // لا تُعاد قيمة `message.error` (thenable يُحسم عند إغلاق الرسالة): React Query
      // ينتظرها، فيبقى الزرّ «يُحمَّل» ثلاث ثوانٍ بعد فشلٍ انتهى فعلاً.
      message.error(error.message)
    },
  })
  return (
    <Space wrap>
      {isInternal ? <Tag color="purple">داخلي — خارج التحليلات</Tag> : <Tag>زبون</Tag>}
      <Button size="small" onClick={() => setOpen(true)}>
        {isInternal ? 'إعادته إلى التحليلات' : 'تعليمه حساباً داخلياً'}
      </Button>
      <Modal
        open={open}
        title={isInternal ? 'إعادة الحساب إلى التحليلات' : 'تعليم الحساب داخلياً'}
        okText="حفظ"
        cancelText="إلغاء"
        onCancel={() => setOpen(false)}
        onOk={() => save.mutate()}
        okButtonProps={{ disabled: reason.trim().length < 3, loading: save.isPending }}
        destroyOnHidden
      >
        <Input.TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          rows={3}
          placeholder="السبب (يُحفظ في سجلّ النشاط)"
          aria-label="السبب"
        />
      </Modal>
    </Space>
  )
}
