import { useState } from 'react'
import { Alert, Button, Input, Modal, Space, Tag, Typography } from 'antd'
import type { OrderStatus } from '../types/orders'
import { STATUS_LABELS, statusActions } from '../constants/orders'

interface StatusTransitionButtonsProps {
  orderNumber: string
  currentStatus: OrderStatus
  submitting: boolean
  onTransition: (status: OrderStatus, note?: string) => Promise<unknown>
}

interface PendingTransition {
  to: OrderStatus
}

export default function StatusTransitionButtons({
  orderNumber,
  currentStatus,
  submitting,
  onTransition,
}: StatusTransitionButtonsProps) {
  const [pending, setPending] = useState<PendingTransition | null>(null)
  const [note, setNote] = useState('')

  const actions = statusActions(currentStatus)
  const isRejection = pending?.to === 'REJECTED'
  const activeAction = actions.find((action) => action.to === pending?.to)

  function openTransition(to: OrderStatus) {
    setPending({ to })
    setNote('')
  }

  function close() {
    setPending(null)
    setNote('')
  }

  async function confirmTransition() {
    if (!pending) return
    try {
      await onTransition(pending.to, note.trim() || undefined)
      close()
    } catch {
      // تبقى النافذة مفتوحة ليعيد المستخدم المحاولة؛ الرسالة تظهر من الصفحة.
    }
  }

  if (actions.length === 0) {
    return (
      <Typography.Text type="secondary">
        لا توجد إجراءات متاحة لهذه الحالة.
      </Typography.Text>
    )
  }

  return (
    <>
      <Space wrap>
        {actions.map((action) => (
          <Button
            key={action.to}
            danger={action.to === 'REJECTED'}
            disabled={submitting}
            onClick={() => openTransition(action.to)}
          >
            {action.label}
          </Button>
        ))}
      </Space>
      <Modal
        open={pending !== null}
        title={`هل تريد ${activeAction?.label ?? ''} #${orderNumber}؟`}
        onOk={confirmTransition}
        onCancel={close}
        okText="تأكيد"
        cancelText="إلغاء"
        okButtonProps={{
          danger: isRejection,
          loading: submitting,
          disabled: submitting,
        }}
        cancelButtonProps={{ disabled: submitting }}
        destroyOnHidden
      >
        {pending && (
          <>
            <Space style={{ marginBottom: 16 }}>
              <Typography.Text type="secondary">الحالة الجديدة:</Typography.Text>
              <Tag>{STATUS_LABELS[pending.to]}</Tag>
            </Space>
            {isRejection && (
              <Alert
                type="warning"
                showIcon
                message="سيُعدّل الطلب كـ«مرفوض» ولن يظهر في تدفق الطلبات."
                description="ملاحظة: خادم المتجر الحالي لا يُرجع الكميات إلى المخزون عند الرفض من لوحة التحكم — تحتاج لتصحيح المخزون يدوياً من صفحة المنتج إن لزم."
                style={{ marginBottom: 16 }}
              />
            )}
            <Input.TextArea
              rows={3}
              placeholder={
                isRejection ? 'سبب الرفض (اختياري)' : 'ملاحظة (اختياري)'
              }
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={submitting}
            />
          </>
        )}
      </Modal>
    </>
  )
}