import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Descriptions,
  Form,
  InputNumber,
  Popconfirm,
  Space,
  Typography,
} from 'antd'
import { SendOutlined } from '@ant-design/icons'
import { rescheduleReminder, sendReminderNow } from '../../api/ordersApi'
import { ApiError } from '../../api/client'
import type { AdminOrder } from '../../types/orders'
import { formatDateTime } from '../../utils/format'
import { parseStoreDateTime, TIME_FORMAT_HINT } from '../../utils/storeDate'
import { StoreDateInput, StoreTimeInput } from './StoreDateInput'

/** مهلات جاهزة بالثقافة العربية — تستعمل في الوضع المضمّن. */
const REMINDER_PRESET_HOURS = [1, 6, 12, 24, 48] as const

const REMINDER_QUERY_KEYS = [
  'order',
  'orders',
  'admin-notifications',
  'admin-orders-completed',
  'admin-notification-stats',
] as const

interface ReminderControlsProps {
  order: AdminOrder
  /** مضمّن (صفحة الطلب) أو داخل نافذة (صفحة الإشعارات). */
  variant?: 'inline' | 'modal'
  /** تُستدعى بعد نجاح عملية ضبط/إرسال (لإغلاق النافذة مثلاً). */
  onDone?: () => void
}

/**
 * ضبط تذكير «هل استلمت طلبك؟» — مصدر واحد بين صفحة الطلب وصفحة الإشعارات.
 *
 * الجدولة على الخادم تقرأ عموداً في القاعدة، فتغيير الموعد هنا يكفي — لا
 * مؤقّت قديم يبقى معلّقاً. وبعد الإرسال تُقفل الأدوات لأن الخادم يرفض
 * إعادة الجدولة أو الإرسال مرة ثانية (REMINDER_ALREADY_SENT). «إرسال الآن»
 * محميّ بتأكيد صريح في كل الوضعين لأن لا رجوع عن إشعار قيل للعميل إنه قادم.
 */
export function ReminderControls({ order, variant = 'inline', onDone }: ReminderControlsProps) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  // لحظةٌ صريحة تُكتب باليد: يوم `YYYY-MM-DD` ووقت `HH:mm` بتوقيت بغداد.
  const [custom, setCustom] = useState<{ date: string; time: string; error?: string }>({
    date: '',
    time: '',
  })

  const sent = order.ratingReminderSentAt !== null

  const invalidate = () => {
    for (const key of REMINDER_QUERY_KEYS) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
    onDone?.()
  }

  const reschedule = useMutation({
    mutationFn: (payload: { delayHours: number } | { remindAt: string }) =>
      rescheduleReminder(order.id, payload),
    onSuccess: () => {
      message.success('حُدّث موعد التذكير')
      invalidate()
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'تعذر التحديث')
    },
  })

  const sendNow = useMutation({
    mutationFn: () => sendReminderNow(order.id),
    onSuccess: () => {
      message.success('أُرسل الإشعار للعميل')
      invalidate()
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'تعذر الإرسال')
    },
  })

  const busy = reschedule.isPending || sendNow.isPending

  if (sent) {
    const content = (
      <>
        <Typography.Text strong>أُرسل التذكير للعميل</Typography.Text>
        <Typography.Text type="secondary" style={{ display: 'block' }}>
          وقت الإرسال: {formatDateTime(order.ratingReminderSentAt!)}. لا يمكن
          إعادة إرساله أو إعادة جدولته.
        </Typography.Text>
      </>
    )
    return variant === 'inline' ? (
      <Alert type="success" showIcon message={content} />
    ) : (
      <Space direction="vertical" size={4}>
        {content}
      </Space>
    )
  }

  if (variant === 'modal') {
    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          موعد التذكير الحالي:{' '}
          <strong>
            {order.ratingReminderAt ? formatDateTime(order.ratingReminderAt) : '—'}
          </strong>
        </Typography.Paragraph>
        <Form
          layout="vertical"
          onFinish={(values: { delayHours?: number; availableDate?: string; availableTime?: string }) => {
            // اللحظة الصريحة تسبق المهلة إن مُلئ الحقلان — الخادم يقبل
            // أحدهما فقط. (التحقق في قواعد الحقلين أدناه.)
            const at = parseStoreDateTime(values.availableDate, values.availableTime, { requireTime: true })
            if (at.kind === 'ok') {
              reschedule.mutate({ remindAt: at.iso })
              return
            }
            if (typeof values.delayHours === 'number') {
              reschedule.mutate({ delayHours: values.delayHours })
            }
          }}
        >
          <Form.Item
            name="delayHours"
            label="مهلة بالساعات من الآن"
            tooltip="تُستعمل عند ترك الحقل الزمني فارغاً."
          >
            <InputNumber min={0} max={720} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="أو لحظة صريحة" extra={`بتوقيت بغداد — ${TIME_FORMAT_HINT}`} style={{ marginBottom: 16 }}>
            <Space wrap>
              <Form.Item
                name="availableDate"
                noStyle
                dependencies={['availableTime']}
                rules={[
                  ({ getFieldValue }) => ({
                    validator: (_, date?: string) => {
                      const at = parseStoreDateTime(date, getFieldValue('availableTime'), {
                        requireTime: true,
                        notBefore: new Date(),
                      })
                      return at.kind === 'error' ? Promise.reject(new Error(at.message)) : Promise.resolve()
                    },
                  }),
                ]}
              >
                <StoreDateInput aria-label="تاريخ التذكير" />
              </Form.Item>
              <Form.Item name="availableTime" noStyle>
                <StoreTimeInput aria-label="وقت التذكير" />
              </Form.Item>
            </Space>
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={reschedule.isPending}>
              حفظ الموعد
            </Button>
            <Popconfirm
              title="إرسال الإشعار الآن؟"
              description="سيصل العميل فوراً، ولن يُرسل التذكير المجدول بعدها."
              okText="إرسال"
              cancelText="إلغاء"
              okButtonProps={{ loading: sendNow.isPending }}
              onConfirm={() => sendNow.mutateAsync().catch(() => undefined)}
            >
              <Button icon={<SendOutlined />} loading={sendNow.isPending}>
                إرسال الآن
              </Button>
            </Popconfirm>
          </Space>
        </Form>
      </Space>
    )
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Descriptions column={1} size="small">
        <Descriptions.Item label="خروج الطلب للتوصيل">
          {order.dispatchedAt ? formatDateTime(order.dispatchedAt) : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="تأكيد الاستلام">
          {order.deliveredAt ? formatDateTime(order.deliveredAt) : 'لم يؤكّد بعد'}
        </Descriptions.Item>
        <Descriptions.Item label="موعد التذكير الحالي">
          {order.ratingReminderAt ? formatDateTime(order.ratingReminderAt) : '—'}
        </Descriptions.Item>
      </Descriptions>

      <Space wrap>
        <Typography.Text type="secondary">بعد الخروج للتوصيل بـ:</Typography.Text>
        {REMINDER_PRESET_HOURS.map((hours) => (
          <Button
            key={hours}
            disabled={busy}
            onClick={() => reschedule.mutate({ delayHours: hours })}
          >
            {hours} ساعة
          </Button>
        ))}
      </Space>

      <Space wrap>
        <Typography.Text type="secondary">أو وقت محدّد:</Typography.Text>
        <StoreDateInput
          aria-label="تاريخ التذكير"
          value={custom.date}
          disabled={busy}
          onChange={(date) => setCustom({ ...custom, date, error: undefined })}
        />
        <StoreTimeInput
          aria-label="وقت التذكير"
          value={custom.time}
          disabled={busy}
          onChange={(time) => setCustom({ ...custom, time, error: undefined })}
        />
        <Button
          disabled={busy || !custom.date}
          onClick={() => {
            const at = parseStoreDateTime(custom.date, custom.time, { requireTime: true })
            if (at.kind === 'ok') reschedule.mutate({ remindAt: at.iso })
            else if (at.kind === 'error') setCustom({ ...custom, error: at.message })
          }}
        >
          حفظ الموعد
        </Button>
      </Space>
      <Typography.Text type={custom.error ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
        {custom.error ?? `بتوقيت بغداد — ${TIME_FORMAT_HINT}`}
      </Typography.Text>
      <Space wrap>
      </Space>

      <Popconfirm
        title="إرسال الإشعار الآن؟"
        description="سيصل العميل فوراً، ولن يُرسل التذكير المجدول بعدها."
        okText="إرسال"
        cancelText="إلغاء"
        okButtonProps={{ loading: sendNow.isPending }}
        onConfirm={() => sendNow.mutateAsync().catch(() => undefined)}
      >
        <Button type="primary" disabled={busy}>
          إرسال الإشعار الآن
        </Button>
      </Popconfirm>
    </Space>
  )
}