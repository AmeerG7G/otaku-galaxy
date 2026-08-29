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
  const isDelivery = pending?.to === 'OUT_FOR_DELIVERY'
  const activeAction = actions.find((action) => action.to === pending?.to)
  // سبب الرفض إلزامي على الخادم — نمنع الإرسال بلا سبب هنا أيضاً.
  const noteMissing = isRejection && !note.trim()

  /** صيغ وقت الوصول الجاهزة — تظهر للعميل كما هي في إشعار «طلبك بالطريق». */
  const ETA_PRESETS = ['سيصل اليوم', 'سيصل غداً', 'سيصل بعد غد', 'سيصل خلال ٢-٣ أيام']

  function openTransition(to: OrderStatus) {
    setPending({ to })
    setNote('')
  }

  function close() {
    setPending(null)
    setNote('')
  }

  async function confirmTransition() {
    if (!pending || noteMissing) return
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
          disabled: submitting || noteMissing,
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
                message="سبب الرفض إلزامي ويظهر للعميل داخل التطبيق."
                description="الكميات تُرجَع للمخزون تلقائياً عند الرفض، ويصل العميل إشعار بالسبب."
                style={{ marginBottom: 16 }}
              />
            )}
            {isDelivery && (
              <>
                <Alert
                  type="info"
                  showIcon
                  message="وقت الوصول المتوقع يظهر للعميل في إشعار «طلبك بالطريق» وفي تفاصيل الطلب."
                  style={{ marginBottom: 12 }}
                />
                <Space wrap style={{ marginBottom: 12 }}>
                  {ETA_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      size="small"
                      type={note === preset ? 'primary' : 'default'}
                      onClick={() => setNote(preset)}
                      disabled={submitting}
                    >
                      {preset}
                    </Button>
                  ))}
                </Space>
              </>
            )}
            <Input.TextArea
              rows={3}
              maxLength={300}
              showCount
              status={noteMissing ? 'error' : undefined}
              placeholder={
                isRejection
                  ? 'سبب الرفض (إلزامي) — مثال: المنتج غير متوفر حالياً'
                  : isDelivery
                    ? 'وقت الوصول المتوقع — مثال: سيصل غداً'
                    : 'ملاحظة (اختياري)'
              }
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={submitting}
            />
            {noteMissing && (
              <Typography.Text type="danger" style={{ fontSize: 12 }}>
                اكتب سبب الرفض قبل التأكيد.
              </Typography.Text>
            )}
          </>
        )}
      </Modal>
    </>
  )
}