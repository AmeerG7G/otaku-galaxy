import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  Drawer,
  Flex,
  Form,
  Image,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  addSlotImage,
  createVisualSlot,
  deleteSlotImage,
  deleteVisualSlot,
  listVisualSlots,
  reorderSlotImages,
  updateSlotImage,
  updateVisualSlot,
} from '../api/visualsApi'
import { uploadImage } from '../api/uploadsApi'
import {
  GROUP_LABELS,
  GROUP_ORDER,
  ROTATION_HINTS,
  ROTATION_LABELS,
  ROTATION_MODES,
  type RotationMode,
  type VisualSlot,
} from '../types/visuals'
import { resolveMediaUrl } from '../utils/media'
import EmptyState from '../components/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#f0f0f0"/><text x="36" y="40" font-size="11" text-anchor="middle" fill="#999">لا صورة</text></svg>',
  )

interface SlotFormValues {
  slotKey: string
  label: string
  location: string
  groupKey: string
  rotationMode: RotationMode
}

/**
 * إدارة رسوم الشخصيات.
 *
 * الفتحة دورٌ بصري في التطبيق («الحالة الفارغة للسلة»)، لا موضعٌ بعينه.
 * ما دامت الفتحة بلا صور نشطة، يعرض التطبيق الأصل المضمَّن معه — وهذا هو
 * ما يجعل حذف صورة من هنا آمناً: لا شاشة تفرغ، بل تعود إلى رسمها الأصلي.
 */
export default function VisualSlotsPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<SlotFormValues>()
  const [creating, setCreating] = useState(false)
  const [openSlotId, setOpenSlotId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const slotsQuery = useQuery({
    queryKey: ['admin-visual-slots'],
    queryFn: listVisualSlots,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-visual-slots'] })

  // الفتحة المفتوحة تُقرأ من نتيجة الاستعلام لا من حالة محلية: بعد كل تعديل
  // تعيد الخادمُ الفتحة كاملة، فتبقى اللوحة معبِّرة عمّا في القاعدة فعلاً.
  const openSlot = useMemo(
    () => (slotsQuery.data?.items ?? []).find((slot) => slot.id === openSlotId) ?? null,
    [slotsQuery.data, openSlotId],
  )

  /**
   * الفتحات مجمَّعة بمناطق التطبيق.
   *
   * قائمة مسطّحة بأربعين اسماً تحوّل كل تعديل إلى بحث. المجموعة تجيب عن
   * السؤال الذي يطرحه المسؤول فعلاً: «أين أغيّر رسم شاشة الدخول؟»
   */
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
      configured: items.filter((slot) => slot.images.some((image) => image.isActive)).length,
    }
  }, [slotsQuery.data])

  const fail = (error: Error) => message.error(error.message)

  const create = useMutation({
    mutationFn: (values: SlotFormValues) => createVisualSlot(values),
    onSuccess: async () => {
      message.success('أُضيفت الفتحة')
      setCreating(false)
      form.resetFields()
      await invalidate()
    },
    onError: fail,
  })

  const updateSlot = useMutation({
    mutationFn: (input: { id: string; values: Parameters<typeof updateVisualSlot>[1] }) =>
      updateVisualSlot(input.id, input.values),
    onSuccess: async () => {
      await invalidate()
    },
    onError: fail,
  })

  const removeSlot = useMutation({
    mutationFn: (id: string) => deleteVisualSlot(id),
    onSuccess: async () => {
      message.success('حُذفت الفتحة — التطبيق يعود إلى الرسم المضمَّن')
      setOpenSlotId(null)
      await invalidate()
    },
    onError: fail,
  })

  const attachImage = useMutation({
    mutationFn: (input: { slotId: string; url: string; mode: 'append' | 'replace' }) =>
      addSlotImage(input.slotId, input.url, input.mode),
    onSuccess: async (_data, variables) => {
      message.success(
        variables.mode === 'replace'
          ? 'استُبدلت الصورة — سيراها التطبيق فوراً'
          : 'أُضيفت الصورة إلى مجموعة التدوير',
      )
      await invalidate()
    },
    onError: fail,
  })

  const toggleImage = useMutation({
    mutationFn: (input: { slotId: string; imageId: string; isActive: boolean }) =>
      updateSlotImage(input.slotId, input.imageId, { isActive: input.isActive }),
    onSuccess: async () => {
      await invalidate()
    },
    onError: fail,
  })

  const removeImage = useMutation({
    mutationFn: (input: { slotId: string; imageId: string }) =>
      deleteSlotImage(input.slotId, input.imageId),
    onSuccess: async () => {
      message.success('حُذفت الصورة')
      await invalidate()
    },
    onError: fail,
  })

  const reorder = useMutation({
    mutationFn: (input: { slotId: string; imageIds: string[] }) =>
      reorderSlotImages(input.slotId, input.imageIds),
    onSuccess: async () => {
      await invalidate()
    },
    onError: fail,
  })

  /** رفع ثم ربط — خطوتان لأن الرفع يخدم كل الأغراض والربط يخصّ الفتحة. */
  async function handleUpload(
    file: File,
    slotId: string,
    mode: 'append' | 'replace',
  ) {
    setUploading(true)
    try {
      const url = await uploadImage(file, 'slot')
      await attachImage.mutateAsync({ slotId, url, mode })
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'تعذر رفع الصورة')
    } finally {
      setUploading(false)
    }
    // نمنع الرفع التلقائي من AntD لأننا نتولّاه بأنفسنا.
    return false
  }

  function move(slot: VisualSlot, index: number, delta: number) {
    const next = [...slot.images]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    reorder.mutate({ slotId: slot.id, imageIds: next.map((image) => image.id) })
  }

  const hasActiveImage = (slot: VisualSlot) =>
    slot.images.some((image) => image.isActive)

  /**
   * ما سيراه الزبون الآن — كما قرّره **الخادم**.
   *
   * كانت هذه الدالة تعيد تنفيذ قاعدة التدوير وتقرأ `Date.now()` أثناء
   * التصيير: نسخة ثانية من قاعدة واحدة، تعتمد على ساعة جهاز المسؤول لا
   * على تقويم المتجر. الآن الخادم يرسل `currentImageId` محسوباً بالدالة
   * نفسها التي تخدم التطبيق، فلا مجال لافتراق المعاينة عمّا يصل الزبون.
   */
  function currentImage(slot: VisualSlot) {
    if (slot.currentImageId === null) return null
    return slot.images.find((image) => image.id === slot.currentImageId) ?? null
  }

  const columns = [
    {
      title: 'الفتحة',
      key: 'slot',
      render: (_: unknown, slot: VisualSlot) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{slot.label || slot.slotKey}</Typography.Text>
          {/* الموضع بلغة صاحب المتجر — لا يحتاج معرفة أسماء ملفات فلاتر. */}
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
      title: 'المعروض الآن',
      key: 'current',
      width: 120,
      render: (_: unknown, slot: VisualSlot) => {
        const image = currentImage(slot)
        return image ? (
          <Image
            src={resolveMediaUrl(image.url) ?? PLACEHOLDER}
            width={48}
            height={48}
            style={{ objectFit: 'contain' }}
            fallback={PLACEHOLDER}
          />
        ) : (
          <Tooltip title="لا صورة نشطة — التطبيق يعرض الرسم المضمَّن معه.">
            <Tag>مضمَّن</Tag>
          </Tooltip>
        )
      },
    },
    {
      title: 'الصور',
      key: 'images',
      width: 130,
      render: (_: unknown, slot: VisualSlot) => {
        const active = slot.images.filter((image) => image.isActive).length
        return (
          <Space size={4}>
            <Tag color={active > 0 ? 'blue' : 'default'}>{active} نشطة</Tag>
            {slot.images.length > active && (
              <Tag>{slot.images.length - active} موقوفة</Tag>
            )}
          </Space>
        )
      },
    },
    {
      title: 'التدوير',
      dataIndex: 'rotationMode',
      key: 'rotationMode',
      width: 110,
      render: (mode: RotationMode) => (
        <Tooltip title={ROTATION_HINTS[mode]}>
          <Tag color={mode === 'daily' ? 'purple' : 'default'}>{ROTATION_LABELS[mode]}</Tag>
        </Tooltip>
      ),
    },
    {
      title: 'مفعّلة',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 90,
      render: (value: boolean, slot: VisualSlot) => (
        <Switch
          size="small"
          checked={value}
          loading={updateSlot.isPending && updateSlot.variables?.id === slot.id}
          onChange={(checked) =>
            updateSlot.mutate({ id: slot.id, values: { isActive: checked } })
          }
        />
      ),
    },
    {
      title: 'إجراء',
      key: 'actions',
      width: 150,
      render: (_: unknown, slot: VisualSlot) => (
        <Button size="small" icon={<PictureOutlined />} onClick={() => setOpenSlotId(slot.id)}>
          إدارة الصور
        </Button>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="رسوم الشخصيات"
        description={`غيّر شخصيات الواجهة بلا إصدار تطبيق جديد — ${totals.configured} من ${totals.slots} موضعاً مخصَّص حالياً.`}
        extra={
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              loading={slotsQuery.isFetching}
              onClick={() => slotsQuery.refetch()}
            >
              تحديث
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              فتحة جديدة
            </Button>
          </Space>
        }
      />

      <Alert
        type="info"
        showIcon
        message="الفتحة بلا صور = الرسم الأصلي"
        description="كل فتحة يقابلها رسم مضمَّن في التطبيق. ما دامت الفتحة فارغة أو موقوفة، يعرض التطبيق ذلك الرسم — وهو ما يجعل حذف صورة من هنا آمناً: الشاشة تعود إلى شكلها الأصلي ولا تفرغ. الشاشات التي تسبق الاتصال بالشبكة (البداية، وضع عدم الاتصال، شعار المتجر) تبقى مضمَّنة دائماً ولا فتحات لها."
      />

      {slotsQuery.isPending ? (
        <Card variant="outlined" loading />
      ) : grouped.length === 0 ? (
        <Card variant="outlined">
          <EmptyState
            description="لا فتحات بعد — التطبيق يعمل كله بالرسوم المضمَّنة"
            actionLabel="إضافة فتحة"
            onAction={() => setCreating(true)}
          />
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
                {group.slots.some((slot) => slot.images.some((i) => i.isActive)) && (
                  <Tag color="blue">
                    {group.slots.filter((slot) => slot.images.some((i) => i.isActive)).length} مخصَّصة
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
                scroll={{ x: 820 }}
              />
            ),
          }))}
        />
      )}

      {/* ── إنشاء فتحة ── */}
      <Modal
        open={creating}
        title="فتحة بصرية جديدة"
        okText="حفظ"
        cancelText="إلغاء"
        confirmLoading={create.isPending}
        onOk={() => form.submit()}
        onCancel={() => setCreating(false)}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ rotationMode: 'fixed' as RotationMode, groupKey: 'other' }}
          onFinish={(values) => create.mutate(values)}
        >
          <Form.Item
            name="slotKey"
            label="مفتاح الفتحة"
            extra="يجب أن يطابق المفتاح المكتوب في كود التطبيق. حروف إنجليزية صغيرة وأرقام وشرطة سفلية."
            rules={[
              { required: true, message: 'المفتاح مطلوب' },
              {
                pattern: /^[a-z][a-z0-9_]{2,48}$/,
                message: 'حروف إنجليزية صغيرة وأرقام وشرطة سفلية فقط',
              },
            ]}
          >
            <Input placeholder="empty_cart" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item name="label" label="الاسم المعروض">
            <Input placeholder="شخصية السلة الفارغة" maxLength={120} />
          </Form.Item>
          <Form.Item
            name="location"
            label="الموضع"
            extra="أين يظهر هذا الرسم — بلغة يفهمها من يدير المتجر."
          >
            <Input placeholder="السلة — حين تكون فارغة" maxLength={200} />
          </Form.Item>
          <Form.Item name="groupKey" label="المجموعة">
            <Select
              options={GROUP_ORDER.map((key) => ({
                value: key,
                label: GROUP_LABELS[key] ?? key,
              }))}
            />
          </Form.Item>
          <Form.Item name="rotationMode" label="التدوير">
            <Segmented
              options={ROTATION_MODES.map((mode) => ({
                label: ROTATION_LABELS[mode],
                value: mode,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── إدارة صور فتحة ── */}
      <Drawer
        open={openSlot !== null}
        onClose={() => setOpenSlotId(null)}
        width={560}
        title={
          openSlot ? (
            <Space direction="vertical" size={0}>
              <Typography.Text strong>
                {openSlot.label || openSlot.slotKey}
              </Typography.Text>
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
            {/* ── ما يراه الزبون الآن ── */}
            <Card
              size="small"
              variant="outlined"
              styles={{ body: { textAlign: 'center', padding: 20 } }}
            >
              <Typography.Text
                type="secondary"
                style={{ fontSize: 12, display: 'block', marginBottom: 12 }}
              >
                ما يظهر للزبون الآن
              </Typography.Text>
              {(() => {
                const live = currentImage(openSlot)
                return live ? (
                  <Image
                    src={resolveMediaUrl(live.url) ?? PLACEHOLDER}
                    height={132}
                    style={{ objectFit: 'contain', maxWidth: '100%' }}
                    fallback={PLACEHOLDER}
                  />
                ) : (
                  <Space direction="vertical" size={6}>
                    <Tag color="default" style={{ margin: 0 }}>
                      الرسم المضمَّن مع التطبيق
                    </Tag>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      لم تُرفع صورة لهذا الموضع بعد.
                    </Typography.Text>
                  </Space>
                )
              })()}
            </Card>

            {/* ── الرفع: مركزيّ وواضح، لا زرّ جانبي ── */}
            <Card
              size="small"
              variant="outlined"
              styles={{ body: { padding: 16 } }}
            >
              <Upload.Dragger
                accept="image/png,image/jpeg,image/webp"
                showUploadList={false}
                disabled={uploading}
                beforeUpload={(file) =>
                  handleUpload(
                    file as unknown as File,
                    openSlot.id,
                    // الفتحة التي فيها صورة نشطة: الرفع يعني الاستبدال.
                    // كان يعني الإضافة إلى آخر القائمة، فيبقى التطبيق يعرض
                    // القديمة بينما تُظهر اللوحة الجديدة.
                    hasActiveImage(openSlot) ? 'replace' : 'append',
                  )
                }
                style={{ padding: '18px 12px' }}
              >
                <p style={{ margin: 0, fontSize: 30, lineHeight: 1 }}>
                  <UploadOutlined />
                </p>
                <p style={{ margin: '10px 0 4px', fontWeight: 600 }}>
                  {hasActiveImage(openSlot)
                    ? 'استبدال الصورة الحالية'
                    : 'رفع صورة لهذا الموضع'}
                </p>
                <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
                  اسحب الصورة هنا أو اضغط للاختيار — PNG / JPG / WebP
                </p>
              </Upload.Dragger>

              {hasActiveImage(openSlot) && (
                <>
                  <div style={{ height: 10 }} />
                  <Upload
                    accept="image/png,image/jpeg,image/webp"
                    showUploadList={false}
                    disabled={uploading}
                    beforeUpload={(file) =>
                      handleUpload(file as unknown as File, openSlot.id, 'append')
                    }
                  >
                    <Button block icon={<PlusOutlined />} loading={uploading}>
                      إضافة صورة إلى مجموعة التدوير
                    </Button>
                  </Upload>
                  <Typography.Paragraph
                    type="secondary"
                    style={{ fontSize: 11.5, margin: '8px 0 0', textAlign: 'center' }}
                  >
                    الاستبدال يوقف الصور القائمة ويعرض الجديدة فوراً. الإضافة
                    تُبقيها كلها لتتناوب بالتدوير اليومي.
                  </Typography.Paragraph>
                </>
              )}
            </Card>

            {/* ── التدوير ── */}
            <Card size="small" variant="outlined" title="التدوير">
              <Segmented
                block
                value={openSlot.rotationMode}
                onChange={(value) =>
                  updateSlot.mutate({
                    id: openSlot.id,
                    values: { rotationMode: value as RotationMode },
                  })
                }
                options={ROTATION_MODES.map((mode) => ({
                  label: ROTATION_LABELS[mode],
                  value: mode,
                }))}
              />
              <Typography.Paragraph
                type="secondary"
                style={{ fontSize: 12, margin: '10px 0 0' }}
              >
                {ROTATION_HINTS[openSlot.rotationMode]}
              </Typography.Paragraph>
            </Card>

            {/* ── الصور ── */}
            <Card
              size="small"
              variant="outlined"
              title={`الصور (${openSlot.images.length})`}
            >
              {openSlot.images.length === 0 ? (
                <EmptyState description="لا صور — التطبيق يعرض الرسم المضمَّن" />
              ) : (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  {openSlot.images.map((image, index) => {
                    const live = currentImage(openSlot)?.id === image.id
                    return (
                      <Card
                        key={image.id}
                        size="small"
                        variant="outlined"
                        style={
                          live
                            ? { borderColor: '#1677ff', background: 'rgba(22,119,255,.04)' }
                            : undefined
                        }
                      >
                        <Flex align="center" gap={12} wrap>
                          <Image
                            src={resolveMediaUrl(image.url) ?? PLACEHOLDER}
                            width={60}
                            height={60}
                            style={{ objectFit: 'contain' }}
                            fallback={PLACEHOLDER}
                          />
                          <Space
                            direction="vertical"
                            size={4}
                            style={{ flex: 1, minWidth: 130 }}
                          >
                            <Space size={6} wrap>
                              <Tag>#{index + 1}</Tag>
                              {live && <Tag color="blue">معروضة الآن</Tag>}
                              {image.isActive ? (
                                <Tag color="green">نشطة</Tag>
                              ) : (
                                <Tag>موقوفة</Tag>
                              )}
                            </Space>
                          </Space>
                          <Space size={4}>
                            <Tooltip title="أعلى">
                              <Button
                                size="small"
                                icon={<ArrowUpOutlined />}
                                disabled={index === 0 || reorder.isPending}
                                onClick={() => move(openSlot, index, -1)}
                              />
                            </Tooltip>
                            <Tooltip title="أسفل">
                              <Button
                                size="small"
                                icon={<ArrowDownOutlined />}
                                disabled={
                                  index === openSlot.images.length - 1 || reorder.isPending
                                }
                                onClick={() => move(openSlot, index, 1)}
                              />
                            </Tooltip>
                            <Tooltip title={image.isActive ? 'إيقاف' : 'تفعيل'}>
                              <Switch
                                size="small"
                                checked={image.isActive}
                                onChange={(checked) =>
                                  toggleImage.mutate({
                                    slotId: openSlot.id,
                                    imageId: image.id,
                                    isActive: checked,
                                  })
                                }
                              />
                            </Tooltip>
                            <Popconfirm
                              title="حذف الصورة"
                              description="تختفي من التطبيق. الملف نفسه يبقى على الخادم."
                              okText="حذف"
                              cancelText="إلغاء"
                              okButtonProps={{ danger: true }}
                              onConfirm={() =>
                                removeImage.mutate({
                                  slotId: openSlot.id,
                                  imageId: image.id,
                                })
                              }
                            >
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        </Flex>
                      </Card>
                    )
                  })}
                </Space>
              )}
            </Card>

            <Popconfirm
              title="حذف الفتحة كاملة"
              description="التطبيق يعود إلى الرسم المضمَّن فوراً. لا شاشة تفرغ."
              okText="حذف"
              cancelText="إلغاء"
              okButtonProps={{ danger: true }}
              onConfirm={() => removeSlot.mutate(openSlot.id)}
            >
              <Button danger block icon={<DeleteOutlined />}>
                حذف الفتحة
              </Button>
            </Popconfirm>
          </Space>
        )}
      </Drawer>
    </Space>
  )
}
