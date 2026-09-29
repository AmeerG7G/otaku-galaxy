import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Card,
  Form,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Statistic,
} from 'antd'
import { SendOutlined } from '@ant-design/icons'
import { broadcastNotification, previewAudience } from '../api/notificationsApi'
import { listCustomers } from '../api/customersApi'
import {
  AUDIENCE_SEGMENTS,
  AUDIENCE_SEGMENT_LABELS,
  WINDOWED_SEGMENTS,
  type AudienceSegment,
  type BroadcastAudience,
} from '../types/notifications'

type Mode = 'all' | 'users' | 'segment'

interface Props {
  /** استهداف مبدئي — تفتح به شاشةُ أعياد الميلاد المؤلِّفَ جاهزاً. */
  initialAudience?: BroadcastAudience
  /** نص مقترح يملأ الحقول عند الفتح. */
  initialTitle?: string
  initialBody?: string
  open: boolean
  onClose: () => void
}

/**
 * مؤلِّف الإشعارات — استهداف ثم نصّ ثم إرسال.
 *
 * [CRITICAL] الشاشة تفصل صراحةً بين «أُنشئ سجل داخل التطبيق» و«وصل إشعار
 * دفع إلى الهاتف». لا مزوّد دفع مربوطاً بالمنظومة، وادّعاء التسليم يجعل
 * المسؤول يبني قراراً تجارياً على وهم — يظنّ الرسالة وصلت وهي تنتظر أن
 * يفتح الزبون التطبيق.
 */
export default function BroadcastComposer({
  initialAudience,
  initialTitle,
  initialBody,
  open,
  onClose,
}: Props) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const [mode, setMode] = useState<Mode>('all')
  const [segment, setSegment] = useState<AudienceSegment>('birthday_today')
  const [windowDays, setWindowDays] = useState(7)
  const [userIds, setUserIds] = useState<string[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  // القيم المبدئية تُقرأ من مرجع لا من قائمة الاعتماديات: `initialAudience`
  // كائنٌ يبنيه الأب في كل تصيير، فإدراجه اعتماديةً كان يعيد تشغيل الأثر مع
  // كل تصيير ويمسح ما كتبه المسؤول توّاً في العنوان والنص.
  const initial = useRef({ initialAudience, initialTitle, initialBody })

  // التحديث بعد التثبيت لا أثناء التصيير: الكتابة في مرجع داخل التصيير
  // تجعله غير نقيّ، وتصييرٌ يُلغى في الوضع المتزامن كان يترك المرجع على
  // قيمة لم تُثبَّت. الأثر بلا قائمة اعتماديات يعمل بعد كل تثبيت، ووقوعه
  // **قبل** الأثر التالي في ترتيب التصريح هو ما يضمن أن القيم التي يقرؤها
  // عند فتح المؤلِّف هي الأحدث.
  useEffect(() => {
    initial.current = { initialAudience, initialTitle, initialBody }
  })

  // الضبط يجري عند **الانتقال** إلى الفتح فقط: مؤلِّفٌ يحتفظ بجمهور فتحةٍ
  // سابقة هو أسرع طريق لإرسال رسالة إلى الناس الخطأ.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (!open) {
      wasOpen.current = false
      return
    }
    if (wasOpen.current) return
    wasOpen.current = true

    const current = initial.current
    const audience = current.initialAudience ?? { audience: 'all' }
    setMode(audience.audience)
    if (audience.audience === 'segment') {
      setSegment(audience.segment)
      setWindowDays(audience.windowDays ?? 7)
    }
    setUserIds(audience.audience === 'users' ? [...audience.userIds] : [])
    setTitle(current.initialTitle ?? '')
    setBody(current.initialBody ?? '')
  }, [open])

  const audience: BroadcastAudience =
    mode === 'users'
      ? { audience: 'users', userIds }
      : mode === 'segment'
        ? {
            audience: 'segment',
            segment,
            ...(WINDOWED_SEGMENTS.includes(segment) ? { windowDays } : {}),
          }
        : { audience: 'all' }

  // الجمهور المرشَّح لا يُحسب في المتصفح: نفس الاستعلام الذي سيُستعمل عند
  // الإرسال هو الذي يعطي الرقم، فلا يختلف ما يُعرض عمّا يقع.
  const audienceReady = mode !== 'users' || userIds.length > 0
  const preview = useQuery({
    queryKey: ['broadcast-audience', audience],
    queryFn: () => previewAudience(audience),
    enabled: open && audienceReady,
  })

  const customers = useQuery({
    queryKey: ['broadcast-customers', customerSearch],
    queryFn: () =>
      listCustomers({
        limit: 30,
        ...(customerSearch ? { search: customerSearch } : {}),
      }),
    enabled: open && mode === 'users',
  })

  const send = useMutation({
    mutationFn: () => broadcastNotification({ ...audience, title, body }),
    onSuccess: async (result) => {
      message.success(`أُنشئ الإشعار لـ${result.recipients} زبوناً داخل التطبيق`)
      await queryClient.invalidateQueries({ queryKey: ['admin-notifications'] })
      await queryClient.invalidateQueries({ queryKey: ['admin-notification-stats'] })
      onClose()
    },
    onError: (error: Error) => message.error(error.message),
  })

  const canSend = title.trim().length > 0 && audienceReady && (preview.data?.recipients ?? 0) > 0

  return (
    <Modal
      open={open}
      title="إشعار جديد"
      width={640}
      okText="إرسال"
      cancelText="إلغاء"
      onCancel={onClose}
      onOk={() => send.mutate()}
      okButtonProps={{
        icon: <SendOutlined />,
        disabled: !canSend || send.isPending,
        loading: send.isPending,
      }}
      destroyOnHidden
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Form layout="vertical">
          <Form.Item label="إلى مَن">
            <Segmented
              block
              value={mode}
              onChange={(value) => setMode(value as Mode)}
              options={[
                { label: 'كل الزبائن', value: 'all' },
                { label: 'زبائن محدَّدون', value: 'users' },
                { label: 'شريحة', value: 'segment' },
              ]}
            />
          </Form.Item>

          {mode === 'users' && (
            <Form.Item
              label="الزبائن"
              extra="ابحث بالاسم أو الهاتف. البحث يجري على الخادم."
            >
              <Select
                mode="multiple"
                value={userIds}
                onChange={setUserIds}
                onSearch={setCustomerSearch}
                filterOption={false}
                loading={customers.isFetching}
                placeholder="اختر زبوناً أو أكثر"
                style={{ width: '100%' }}
                options={(customers.data?.items ?? []).map((customer) => ({
                  value: customer.id,
                  label: `${customer.username} — ${customer.phone}`,
                }))}
              />
            </Form.Item>
          )}

          {mode === 'segment' && (
            <>
              <Form.Item label="الشريحة">
                <Select
                  value={segment}
                  onChange={setSegment}
                  style={{ width: '100%' }}
                  options={AUDIENCE_SEGMENTS.map((value) => ({
                    value,
                    label: AUDIENCE_SEGMENT_LABELS[value],
                  }))}
                />
              </Form.Item>
              {WINDOWED_SEGMENTS.includes(segment) && (
                <Form.Item label="النافذة">
                  <Segmented
                    value={windowDays}
                    onChange={(value) => setWindowDays(Number(value))}
                    options={[
                      { label: '٧ أيام', value: 7 },
                      { label: '١٤ يوماً', value: 14 },
                      { label: '٣٠ يوماً', value: 30 },
                    ]}
                  />
                </Form.Item>
              )}
            </>
          )}

          <Form.Item label="العنوان" required>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              showCount
              placeholder="عرض خاص لنهاية الأسبوع"
            />
          </Form.Item>
          <Form.Item label="النص">
            <Input.TextArea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              maxLength={500}
              showCount
            />
          </Form.Item>
        </Form>

        <Card size="small" variant="outlined">
          <Statistic
            title="سيصل"
            value={audienceReady ? (preview.data?.recipients ?? 0) : 0}
            suffix="زبوناً"
            loading={preview.isFetching}
          />
        </Card>

      </Space>
    </Modal>
  )
}
