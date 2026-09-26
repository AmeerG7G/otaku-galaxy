import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Button,
  Card,
  Collapse,
  DatePicker,
  Drawer,
  Image,
  Popconfirm,
  Radio,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd'
import {
  ClockCircleOutlined,
  DeleteOutlined,
  PictureOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import {
  clearSlotImage,
  clearSlotTemporaryImage,
  listVisualSlots,
  setSlotImage,
  setSlotTemporaryImage,
} from '../api/visualsApi'
import { uploadImage } from '../api/uploadsApi'
import { FIXED_ASSETS, GROUP_LABELS, GROUP_ORDER, type VisualSlot } from '../types/visuals'
import { formatDateTime } from '../utils/format'
import { resolveMediaUrl } from '../utils/media'
import { endOfStoreDayIso, isStoreDaySelectable } from '../utils/storeDay'
import EmptyState from '../components/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#f0f0f0"/><text x="36" y="40" font-size="11" text-anchor="middle" fill="#999">لا صورة</text></svg>',
  )

const ACCEPTED = 'image/png,image/jpeg,image/webp'

/** الحدّ الأقصى للمؤقّتة كما يفرضه الخادم (`TEMPORARY_MAX_DAYS`). */
const TEMPORARY_MAX_DAYS = 366

/** نوع الصورة التي سيرفعها المسؤول الآن. */
type ImageMode = 'permanent' | 'temporary'

/**
 * أطول مهلةٍ لمؤقّتٍ واحد حتى لحظة الانتهاء — يومٌ، كما في التطبيق: مؤقّت
 * المتصفح يفيض بعد ٢٤٫٨ يوماً فيطلق فوراً؛ الأبعد يُدرَك بجلبٍ وسيط يعيد
 * التسليح من الردّ.
 */
const MAX_EXPIRY_TIMER_MS = 24 * 60 * 60 * 1000

/** ما تعود إليه الفتحة حين تنتهي المؤقّتة — بلغة صاحب المتجر. */
function fallbackLabel(slot: VisualSlot) {
  return slot.imageUrl ? 'الصورة الدائمة' : 'الرسم المضمَّن'
}

/** شارة الحالة: ما يراه الزبون الآن ومن أين — كما حسبها الخادم. */
function ModeTag({ slot }: { slot: VisualSlot }) {
  if (slot.activeMode === 'temporary') {
    return (
      <Tag color="orange" icon={<ClockCircleOutlined />}>
        مؤقّتة حتى {formatDateTime(slot.temporaryUntil!)}
      </Tag>
    )
  }
  if (slot.activeMode === 'permanent') return <Tag color="blue">صورة دائمة</Tag>
  return <Tag>الرسم المضمَّن</Tag>
}

/**
 * إدارة رسوم الشخصيات — موضعٌ واحد = فتحةٌ واحدة = صورةٌ فعّالة واحدة.
 *
 * كل صفٍّ موضعٌ في التطبيق (شاشة ومكان) يحمل صورةً **دائمة** واحدة يستبدلها
 * المسؤول أو يزيلها، وقد يضع فوقها صورةً **مؤقّتة** واحدة إلى يومٍ محدّد:
 * تحجب الدائمة حتى تنتهي ثم تعود الدائمة من تلقاء نفسها — لا تكتب فوقها
 * أبداً. لا إنشاء فتحات ولا حذفها (تُعرَّف بالهجرات فتطابق كود التطبيق
 * حرفياً)، ولا قوائم صور ولا تدوير (الهجرتان ٠٥٤ و٠٥٥). الفتحة بلا صورة
 * تعرض الرسم المضمَّن مع التطبيق — وهذا ما يجعل الإزالة آمنة: لا شاشة تفرغ.
 *
 * «ما يراه الزبون الآن» (`activeImageUrl`/`activeMode`) يحسبه الخادم؛
 * اللوحة تعرضه ولا تعيد حساب القاعدة.
 */
export default function VisualSlotsPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [openSlotId, setOpenSlotId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [mode, setMode] = useState<ImageMode>('permanent')
  const [temporaryDay, setTemporaryDay] = useState<Dayjs | null>(null)

  const slotsQuery = useQuery({
    queryKey: ['admin-visual-slots'],
    queryFn: listVisualSlots,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-visual-slots'] })

  // [CRITICAL] انتهاء المؤقّتة يظهر من تلقاء نفسه: جلبٌ **واحد** مجدول لأقرب
  // لحظة انتهاء بين الفتحات (بحدّ يومٍ ثم يُعاد من الردّ)، يُلغى ويُعاد
  // تسليحه مع كل ردّ — إنهاءٌ يدوي أو استبدالٌ يغيّر اللحظة فيتبعها. بدونه
  // كانت اللوحة (بلا `refetchOnWindowFocus`) تقول «مؤقّتة حتى …» بعد أن
  // عاد الزبون يرى الدائمة، حتى يُضغط «تحديث». لا استطلاع، ولا حساب انتهاءٍ
  // هنا: الجلب يعيد الحالة كما يحسبها الخادم.
  const nextChangeAt = useMemo(() => {
    const moments = (slotsQuery.data?.items ?? [])
      .map((slot) => (slot.temporaryUntil ? Date.parse(slot.temporaryUntil) : Number.NaN))
      .filter((moment) => Number.isFinite(moment))
    return moments.length > 0 ? Math.min(...moments) : null
  }, [slotsQuery.data])

  useEffect(() => {
    if (nextChangeAt === null) return
    // ثانيةٌ بعد اللحظة لا قبلها: يجب أن تكون قد مضت بساعة الخادم أيضاً.
    const delay = Math.min(Math.max(nextChangeAt - Date.now(), 0) + 1000, MAX_EXPIRY_TIMER_MS)
    const timer = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ['admin-visual-slots'] })
    }, delay)
    return () => window.clearTimeout(timer)
    // `dataUpdatedAt`: كل ردٍّ يعيد التسليح ولو لم تتغيّر اللحظة (جلبٌ وسيط لانتهاءٍ أبعد من يوم).
  }, [nextChangeAt, slotsQuery.dataUpdatedAt, queryClient])

  // المسؤول يختار **يوماً** («مؤقّتة حتى نهاية الخميس») والخادم يريد لحظةً
  // مطلقة: نهاية ذلك اليوم في **منطقة المتجر** التي يعلنها الخادم — لا في
  // منطقة هذا المتصفح — تُرسَل ISO 8601 كما يُرسل موعد التوفر، والخادم
  // يقارنها بساعته ويرفض الماضي والأبعد من الحدّ.
  const storeTimezone = slotsQuery.data?.timezone

  // الفتحة المفتوحة تُقرأ من نتيجة الاستعلام لا من حالة محلية: بعد كل تعديل
  // تعيد الخادمُ الفتحة كاملة، فتبقى اللوحة معبِّرة عمّا في القاعدة فعلاً.
  const openSlot = useMemo(
    () => (slotsQuery.data?.items ?? []).find((slot) => slot.id === openSlotId) ?? null,
    [slotsQuery.data, openSlotId],
  )

  function openDrawer(slotId: string) {
    setMode('permanent')
    setTemporaryDay(null)
    setOpenSlotId(slotId)
  }

  /** الفتحات مجمَّعة بمناطق التطبيق — يجيب عن «أين أغيّر رسم شاشة الدخول؟». */
  const grouped = useMemo(() => {
    const buckets = new Map<string, VisualSlot[]>()
    for (const slot of slotsQuery.data?.items ?? []) {
      const key = slot.groupKey || 'other'
      const list = buckets.get(key) ?? []
      list.push(slot)
      buckets.set(key, list)
    }
    // مجموعة غير معروفة تظهر في آخر القائمة بدل أن تختفي.
    const order = [...GROUP_ORDER, ...[...buckets.keys()].filter((k) => !GROUP_ORDER.includes(k))]
    return order
      .filter((key) => buckets.has(key))
      .map((key) => ({
        key,
        label: GROUP_LABELS[key] ?? key,
        slots: buckets.get(key)!,
      }))
  }, [slotsQuery.data])

  const totals = useMemo(() => {
    const items = slotsQuery.data?.items ?? []
    return {
      slots: items.length,
      configured: items.filter((slot) => slot.activeImageUrl !== null).length,
      temporary: items.filter((slot) => slot.activeMode === 'temporary').length,
    }
  }, [slotsQuery.data])

  const fail = (error: Error) => message.error(error.message)

  const replaceImage = useMutation({
    mutationFn: (input: { slotId: string; url: string }) => setSlotImage(input.slotId, input.url),
    onSuccess: async (slot) => {
      message.success(
        slot.activeMode === 'temporary'
          ? 'حُفظت الصورة الدائمة — تظهر للزبون بعد انتهاء المؤقّتة'
          : 'استُبدلت الصورة الدائمة — سيراها التطبيق فوراً',
      )
      await invalidate()
    },
    onError: fail,
  })

  const replaceTemporary = useMutation({
    mutationFn: (input: { slotId: string; url: string; until: string }) =>
      setSlotTemporaryImage(input.slotId, input.url, input.until),
    onSuccess: async (slot) => {
      message.success(
        `وُضعت الصورة المؤقّتة حتى ${formatDateTime(slot.temporaryUntil!)} — بعدها تعود ${fallbackLabel(slot)} تلقائياً`,
      )
      setTemporaryDay(null)
      await invalidate()
    },
    onError: fail,
  })

  const removeImage = useMutation({
    mutationFn: (slotId: string) => clearSlotImage(slotId),
    onSuccess: async () => {
      message.success('أُزيلت الصورة الدائمة — التطبيق يعرض الرسم المضمَّن')
      await invalidate()
    },
    onError: fail,
  })

  const endTemporary = useMutation({
    mutationFn: (slotId: string) => clearSlotTemporaryImage(slotId),
    onSuccess: async (slot) => {
      message.success(`أُنهيت الصورة المؤقّتة — التطبيق يعرض ${fallbackLabel(slot)}`)
      await invalidate()
    },
    onError: fail,
  })

  /** رفع ثم وضع — خطوتان لأن الرفع يخدم كل الأغراض والوضع يخصّ الفتحة ونوعها. */
  async function handleUpload(file: File, slotId: string) {
    setUploading(true)
    try {
      let until: string | null = null
      if (mode === 'temporary') {
        if (!temporaryDay || !storeTimezone) throw new Error('اختر آخر يومٍ تظهر فيه الصورة المؤقّتة')
        // يُعاد الحكم لحظةَ الرفع لا لحظةَ الاختيار: يومٌ مضى (أو تجاوز الحدّ)
        // بينما الدرج مفتوح يُوقَف هنا **قبل** الرفع — وإلا رُفع الملف ثم رُفض
        // الوضع وبقي على الخادم بلا مرجع.
        if (!isStoreDaySelectable(temporaryDay, storeTimezone, new Date(), TEMPORARY_MAX_DAYS)) {
          throw new Error('اليوم المختار لم يعد صالحاً — اختر يوماً آخر')
        }
        until = endOfStoreDayIso(temporaryDay, storeTimezone)
      }
      const url = await uploadImage(file, 'slot')
      if (until !== null) {
        await replaceTemporary.mutateAsync({ slotId, url, until })
      } else {
        await replaceImage.mutateAsync({ slotId, url })
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'تعذر رفع الصورة')
    } finally {
      setUploading(false)
    }
    // نمنع الرفع التلقائي من AntD لأننا نتولّاه بأنفسنا.
    return false
  }

  const temporaryNeedsDay = mode === 'temporary' && temporaryDay === null

  const columns = [
    {
      title: 'الشخصية ومكان ظهورها',
      key: 'slot',
      render: (_: unknown, slot: VisualSlot) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{slot.label || slot.slotKey}</Typography.Text>
          {/* الموضع بلغة صاحب المتجر — شاشةٌ واحدة وموضعٌ واحد، لا قائمة شاشات. */}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {slot.location}
          </Typography.Text>
          <Tooltip title="المفتاح الذي يعرفه كود التطبيق">
            <Typography.Text
              type="secondary"
              style={{ fontSize: 11, fontFamily: 'monospace', opacity: 0.65 }}
            >
              {slot.slotKey}
            </Typography.Text>
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'النوع',
      key: 'kind',
      width: 130,
      // كل فتحةٍ في هذا الفهرس شخصيةٌ قابلة للتغيير؛ الأصول الثابتة في
      // الجدول المنفصل أعلاه ولا صفوف لها هنا.
      render: () => <Tag color="green">شخصية قابلة للتغيير</Tag>,
    },
    {
      title: 'الصورة الحالية',
      key: 'current',
      width: 120,
      // ما يراه الزبون **الآن** — المؤقّتة السارية إن وُجدت، وإلا الدائمة.
      render: (_: unknown, slot: VisualSlot) =>
        slot.activeImageUrl ? (
          <Image
            src={resolveMediaUrl(slot.activeImageUrl) ?? PLACEHOLDER}
            width={48}
            height={48}
            style={{ objectFit: 'contain' }}
            fallback={PLACEHOLDER}
          />
        ) : (
          <Tooltip title="لا صورة مرفوعة — التطبيق يعرض الرسم المضمَّن معه.">
            <Tag>مضمَّن</Tag>
          </Tooltip>
        ),
    },
    {
      title: 'الحالة',
      key: 'status',
      width: 230,
      render: (_: unknown, slot: VisualSlot) => (
        <Space direction="vertical" size={2}>
          <ModeTag slot={slot} />
          {slot.activeMode === 'temporary' && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              ثم تعود {fallbackLabel(slot)} تلقائياً
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: 'إجراء',
      key: 'actions',
      width: 160,
      render: (_: unknown, slot: VisualSlot) => (
        <Button size="small" icon={<PictureOutlined />} onClick={() => openDrawer(slot.id)}>
          {slot.activeImageUrl ? 'استبدال الصورة' : 'رفع صورة'}
        </Button>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="الشخصيات القابلة للتغيير"
        description={`صورةٌ دائمة واحدة لكل موضع، ويمكن وضع صورةٍ مؤقّتة فوقها إلى يومٍ محدّد — ${totals.configured} من ${totals.slots} موضعاً له صورة حالياً${totals.temporary ? `، منها ${totals.temporary} بصورة مؤقّتة` : ''}. كل صفٍّ يذكر الشاشة والمكان الذي تظهر فيه الصورة.`}
        extra={
          <Button
            icon={<ReloadOutlined />}
            loading={slotsQuery.isFetching}
            onClick={() => slotsQuery.refetch()}
          >
            تحديث
          </Button>
        }
      />

      {/* ما لا يُبدَّل من هنا — حتى لا يُبحث عنه بين الشخصيات (§48.4، §51.6). */}
      <Card
        variant="outlined"
        size="small"
        title="أصولٌ ثابتة — غير قابلة للتغيير من اللوحة"
        data-testid="fixed-assets"
      >
        <Table
          rowKey="name"
          size="small"
          pagination={false}
          dataSource={[...FIXED_ASSETS]}
          columns={[
            { title: 'الأصل', dataIndex: 'name', key: 'name' },
            { title: 'مكان الظهور', dataIndex: 'where', key: 'where' },
            { title: 'السبب', dataIndex: 'why', key: 'why' },
            {
              title: 'قابل للتغيير',
              key: 'editable',
              width: 120,
              render: () => <Tag>لا</Tag>,
            },
          ]}
        />
      </Card>

      {slotsQuery.isPending ? (
        <Card variant="outlined" loading />
      ) : grouped.length === 0 ? (
        <Card variant="outlined">
          <EmptyState description="لا فتحات — التطبيق يعمل كله بالرسوم المضمَّنة. الفتحات تُعرَّف بترقية الخادم لا من هنا." />
        </Card>
      ) : (
        <Collapse
          defaultActiveKey={grouped.map((group) => group.key)}
          items={grouped.map((group) => ({
            key: group.key,
            label: (
              <Space size={8}>
                <Typography.Text strong>{group.label}</Typography.Text>
                <Tag>{group.slots.length}</Tag>
                {group.slots.some((slot) => slot.activeImageUrl !== null) && (
                  <Tag color="blue">
                    {group.slots.filter((slot) => slot.activeImageUrl !== null).length} لها صورة
                  </Tag>
                )}
                {group.slots.some((slot) => slot.activeMode === 'temporary') && (
                  <Tag color="orange">
                    {group.slots.filter((slot) => slot.activeMode === 'temporary').length} مؤقّتة
                  </Tag>
                )}
              </Space>
            ),
            children: (
              <Table
                rowKey="id"
                size="small"
                columns={columns}
                dataSource={group.slots}
                pagination={false}
                scroll={{ x: 900 }}
              />
            ),
          }))}
        />
      )}

      {/* ── صورة فتحة: الدائمة والمؤقّتة ── */}
      <Drawer
        open={openSlot !== null}
        onClose={() => setOpenSlotId(null)}
        width={520}
        title={
          openSlot ? (
            <Space direction="vertical" size={0}>
              <Typography.Text strong>{openSlot.label || openSlot.slotKey}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {openSlot.location}
              </Typography.Text>
            </Space>
          ) : (
            'الفتحة'
          )
        }
        destroyOnHidden
      >
        {openSlot && (
          <Space direction="vertical" size={18} style={{ width: '100%' }}>
            {/* ── ما يراه الزبون الآن — كما حسبه الخادم ── */}
            <Card
              size="small"
              variant="outlined"
              styles={{ body: { textAlign: 'center', padding: 20 } }}
              data-testid="active-now"
            >
              <Typography.Text
                type="secondary"
                style={{ fontSize: 12, display: 'block', marginBottom: 12 }}
              >
                ما يظهر للزبون الآن في هذا الموضع
              </Typography.Text>
              {openSlot.activeImageUrl ? (
                <Image
                  src={resolveMediaUrl(openSlot.activeImageUrl) ?? PLACEHOLDER}
                  height={132}
                  style={{ objectFit: 'contain', maxWidth: '100%' }}
                  fallback={PLACEHOLDER}
                />
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  لم تُرفع صورة لهذا الموضع بعد.
                </Typography.Text>
              )}
              <div style={{ marginTop: 12 }}>
                <ModeTag slot={openSlot} />
              </div>
              {openSlot.activeMode === 'temporary' && (
                <Typography.Text
                  type="secondary"
                  style={{ fontSize: 12, display: 'block', marginTop: 8 }}
                >
                  بعد ذلك تعود {fallbackLabel(openSlot)} تلقائياً — لا حاجة لأي خطوة.
                </Typography.Text>
              )}
            </Card>

            {/* ── الرفع: دائمة أو مؤقّتة إلى يوم ── */}
            <Card size="small" variant="outlined" styles={{ body: { padding: 16 } }}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Radio.Group
                  value={mode}
                  onChange={(event) => setMode(event.target.value as ImageMode)}
                  optionType="button"
                  buttonStyle="solid"
                  options={[
                    { label: 'صورة دائمة', value: 'permanent' },
                    { label: 'صورة مؤقّتة حتى يوم', value: 'temporary' },
                  ]}
                />
                {mode === 'temporary' && (
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <DatePicker
                      value={temporaryDay}
                      onChange={(day) => setTemporaryDay(day)}
                      placeholder="آخر يومٍ تظهر فيه"
                      format="YYYY/MM/DD"
                      style={{ width: '100%' }}
                      // أيام المتجر: يومٌ انتهى بتقويم المتجر لا يُعرض ولو كان «اليوم» هنا،
                      // ولا يومٌ أبعد من الحدّ — الخادم يرفضهما أصلاً، فلا يُعرض ما سيُرفض.
                      disabledDate={(day) =>
                        !storeTimezone ||
                        !isStoreDaySelectable(day, storeTimezone, new Date(), TEMPORARY_MAX_DAYS)
                      }
                    />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      تظهر الصورة المؤقّتة حتى نهاية اليوم المختار بتوقيت المتجر ({storeTimezone})، ثم
                      تعود {fallbackLabel(openSlot)} تلقائياً. الصورة الدائمة لا تُمسّ.
                    </Typography.Text>
                  </Space>
                )}
                <Upload.Dragger
                  accept={ACCEPTED}
                  showUploadList={false}
                  disabled={uploading || temporaryNeedsDay}
                  beforeUpload={(file) => handleUpload(file as unknown as File, openSlot.id)}
                  style={{ padding: '18px 12px' }}
                >
                  <p style={{ margin: 0, fontSize: 30, lineHeight: 1 }}>
                    <UploadOutlined />
                  </p>
                  <p style={{ margin: '10px 0 4px', fontWeight: 600 }}>
                    {mode === 'temporary'
                      ? temporaryDay
                        ? `رفع صورة مؤقّتة حتى ${temporaryDay.format('YYYY/MM/DD')}`
                        : 'اختر اليوم أولاً ثم ارفع الصورة المؤقّتة'
                      : openSlot.imageUrl
                        ? 'استبدال الصورة الدائمة'
                        : 'رفع صورة دائمة لهذا الموضع'}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
                    اسحب الصورة هنا أو اضغط للاختيار — PNG / JPG / WebP.{' '}
                    {mode === 'temporary'
                      ? 'تحلّ محلّ أي صورة مؤقّتة سابقة.'
                      : 'الصورة الجديدة تحلّ محلّ الدائمة الحالية فوراً.'}
                  </p>
                </Upload.Dragger>
              </Space>
            </Card>

            {/* ── المؤقّتة السارية ── */}
            {openSlot.temporaryImageUrl && (
              <Card
                size="small"
                variant="outlined"
                title="الصورة المؤقّتة السارية"
                data-testid="temporary-card"
              >
                <Space align="start" size={12}>
                  <Image
                    src={resolveMediaUrl(openSlot.temporaryImageUrl) ?? PLACEHOLDER}
                    width={64}
                    height={64}
                    style={{ objectFit: 'contain' }}
                    fallback={PLACEHOLDER}
                  />
                  <Space direction="vertical" size={6}>
                    <Typography.Text style={{ fontSize: 12 }}>
                      تنتهي: {formatDateTime(openSlot.temporaryUntil!)}
                    </Typography.Text>
                    <Popconfirm
                      title="إنهاء الصورة المؤقّتة الآن"
                      description={`يعود هذا الموضع إلى ${fallbackLabel(openSlot)} فوراً. الملف نفسه يبقى على الخادم.`}
                      okText="إنهاء"
                      cancelText="إلغاء"
                      onConfirm={() => endTemporary.mutate(openSlot.id)}
                    >
                      <Button size="small" icon={<ClockCircleOutlined />} loading={endTemporary.isPending}>
                        إنهاء الصورة المؤقّتة الآن
                      </Button>
                    </Popconfirm>
                  </Space>
                </Space>
              </Card>
            )}

            {/* ── الدائمة (حين تحجبها مؤقّتة تُعرض هنا كي لا يظنّها المسؤول ضائعة) ── */}
            {openSlot.imageUrl && (
              <Card
                size="small"
                variant="outlined"
                title={
                  openSlot.activeMode === 'temporary'
                    ? 'الصورة الدائمة — تعود بعد انتهاء المؤقّتة'
                    : 'الصورة الدائمة'
                }
                data-testid="permanent-card"
              >
                <Space align="start" size={12}>
                  {openSlot.activeMode === 'temporary' && (
                    <Image
                      src={resolveMediaUrl(openSlot.imageUrl) ?? PLACEHOLDER}
                      width={64}
                      height={64}
                      style={{ objectFit: 'contain' }}
                      fallback={PLACEHOLDER}
                    />
                  )}
                  <Popconfirm
                    title="إزالة الصورة الدائمة"
                    description={
                      openSlot.activeMode === 'temporary'
                        ? 'بعد انتهاء المؤقّتة يعود هذا الموضع إلى الرسم المضمَّن مع التطبيق. الملف نفسه يبقى على الخادم.'
                        : 'يعود هذا الموضع إلى الرسم المضمَّن مع التطبيق فوراً. الملف نفسه يبقى على الخادم.'
                    }
                    okText="إزالة"
                    cancelText="إلغاء"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => removeImage.mutate(openSlot.id)}
                  >
                    <Button danger icon={<DeleteOutlined />} loading={removeImage.isPending}>
                      إزالة الصورة الدائمة — العودة إلى الرسم المضمَّن
                    </Button>
                  </Popconfirm>
                </Space>
              </Card>
            )}
          </Space>
        )}
      </Drawer>
    </Space>
  )
}
