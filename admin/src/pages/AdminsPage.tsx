import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App as AntApp,
  Button,
  Checkbox,
  Col,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  createSubAdmin,
  deleteSubAdmin,
  listAudit,
  listSubAdmins,
  updateOwnProfile,
  updateSubAdmin,
  type CreateSubAdminInput,
  type UpdateSubAdminInput,
} from '../api/adminAccountsApi'
import { ApiError } from '../api/client'
import EmptyState from '../components/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { PhoneText } from '../components/ui/PhoneText'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { ADMIN_ME_QUERY_KEY, useAdminProfile } from '../hooks/useAdminProfile'
import { useAuthStore } from '../stores/authStore'
import {
  ADMIN_SECTION_GROUPS,
  ADMIN_SECTION_LABELS,
  AUDIT_ACTION_LABELS,
  type AdminSection,
  type AuditEntry,
  type SubAdmin,
} from '../types/adminPermissions'
import { resyncWebPush } from '../push/webPush'
import { formatDateTime } from '../utils/format'
import { IRAQI_MOBILE_LENGTH, IRAQI_MOBILE_PATTERN } from '../utils/phone'

const errorText = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback)

/** `+9647701234567` → `07701234567` — الصيغة التي يكتبها المسؤول في الحقل. */
function localPhone(phone: string) {
  return phone.startsWith('+964') ? `0${phone.slice(4)}` : phone
}

const phoneRules = [
  { required: true, message: 'أدخل رقم الهاتف' },
  { pattern: IRAQI_MOBILE_PATTERN, message: 'رقم موبايل عراقي من 11 رقماً يبدأ بـ07' },
]
const passwordRules = [
  { required: true, message: 'أدخل كلمة المرور' },
  { min: 8, message: 'ثمانية أحرف على الأقل' },
]

/** مربّعات الصلاحيات مجمّعةً كالقائمة الجانبية. */
function PermissionPicker({ value = [], onChange }: { value?: AdminSection[]; onChange?: (next: AdminSection[]) => void }) {
  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      {ADMIN_SECTION_GROUPS.map((group) => (
        <div key={group.label}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {group.label}
          </Typography.Text>
          <Checkbox.Group
            style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 4 }}
            value={value.filter((section) => group.sections.includes(section))}
            options={group.sections.map((section) => ({ value: section, label: ADMIN_SECTION_LABELS[section] }))}
            onChange={(checked) => {
              const others = value.filter((section) => !group.sections.includes(section))
              onChange?.([...others, ...(checked as AdminSection[])])
            }}
          />
        </div>
      ))}
    </Space>
  )
}

function PermissionTags({ permissions }: { permissions: AdminSection[] }) {
  if (permissions.length === 0) return <Typography.Text type="secondary">بلا صلاحيات</Typography.Text>
  return (
    <Flex wrap gap={4}>
      {permissions.map((section) => (
        <Tag key={section} style={{ marginInlineEnd: 0 }}>
          {ADMIN_SECTION_LABELS[section]}
        </Tag>
      ))}
    </Flex>
  )
}

// ── ملفّي ──

function OwnProfileTab() {
  const { message } = AntApp.useApp()
  const queryClient = useQueryClient()
  const { data: profile } = useAdminProfile()
  const setSession = useAuthStore((state) => state.setSession)
  const storedUser = useAuthStore((state) => state.user)
  const [form] = Form.useForm()

  const save = useMutation({
    mutationFn: (input: Parameters<typeof updateOwnProfile>[0]) => updateOwnProfile(input),
    onSuccess: ({ profile: next, token }) => {
      // كلمة مرورٍ جديدة ⇒ الجلسات الأخرى سقطت، وهذا الجهاز يأخذ توكناً جديداً.
      if (token && storedUser) {
        setSession(token, { ...storedUser, username: next.username, phone: next.phone })
        // الخادم عطّل أجهزة الإشعار مع الجلسات؛ هذا المتصفّح يستعيد جهازه.
        void resyncWebPush()
      }
      queryClient.setQueryData(ADMIN_ME_QUERY_KEY, next)
      form.setFieldsValue({ currentPassword: '', newPassword: '', confirmPassword: '' })
      message.success('حُفظ ملفّك')
    },
    onError: (error) => message.error(errorText(error, 'تعذّر الحفظ')),
  })

  if (!profile) return null
  return (
    <Form
      form={form}
      layout="vertical"
      style={{ maxWidth: 520 }}
      initialValues={{ username: profile.username, phone: localPhone(profile.phone) }}
      onFinish={(values: { username: string; phone: string; currentPassword?: string; newPassword?: string }) => {
        const input: Parameters<typeof updateOwnProfile>[0] = {}
        if (values.username !== profile.username) input.username = values.username
        if (values.phone !== localPhone(profile.phone)) input.phone = values.phone
        if (values.newPassword) input.newPassword = values.newPassword
        if (input.phone || input.newPassword) input.currentPassword = values.currentPassword
        if (Object.keys(input).length === 0) {
          message.info('لا تغيير')
          return
        }
        save.mutate(input)
      }}
    >
      <Form.Item label="الاسم" name="username" rules={[{ required: true, min: 2, max: 40, message: 'اسم من 2 إلى 40 حرفاً' }]}>
        <Input autoComplete="name" />
      </Form.Item>
      <Form.Item label="رقم الهاتف" name="phone" rules={phoneRules}>
        <Input dir="ltr" inputMode="tel" maxLength={IRAQI_MOBILE_LENGTH} autoComplete="tel" />
      </Form.Item>
      <Form.Item label="كلمة المرور الجديدة" name="newPassword" rules={[{ min: 8, message: 'ثمانية أحرف على الأقل' }]}>
        <Input.Password autoComplete="new-password" placeholder="اتركها فارغة للإبقاء على الحالية" />
      </Form.Item>
      <Form.Item
        label="تأكيد كلمة المرور الجديدة"
        name="confirmPassword"
        dependencies={['newPassword']}
        rules={[
          ({ getFieldValue }) => ({
            validator: (_, value) =>
              !getFieldValue('newPassword') || value === getFieldValue('newPassword')
                ? Promise.resolve()
                : Promise.reject(new Error('كلمتا المرور غير متطابقتين')),
          }),
        ]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <Form.Item
        label="كلمة المرور الحالية"
        name="currentPassword"
        dependencies={['phone', 'newPassword']}
        extra="مطلوبة لتغيير الرقم أو كلمة المرور."
        rules={[
          ({ getFieldValue }) => ({
            validator: (_, value) =>
              (getFieldValue('phone') === localPhone(profile.phone) && !getFieldValue('newPassword')) || value
                ? Promise.resolve()
                : Promise.reject(new Error('أدخل كلمة المرور الحالية')),
          }),
        ]}
      >
        <Input.Password autoComplete="current-password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={save.isPending} block>
        حفظ
      </Button>
    </Form>
  )
}

// ── المسؤولون ──

type EditorState = { mode: 'create' } | { mode: 'edit'; admin: SubAdmin } | null

function AdminEditor({ state, onClose }: { state: EditorState; onClose: () => void }) {
  const { message } = AntApp.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const editing = state?.mode === 'edit' ? state.admin : null

  const done = (text: string) => {
    void queryClient.invalidateQueries({ queryKey: ['sub-admins'] })
    void queryClient.invalidateQueries({ queryKey: ['admin-audit'] })
    message.success(text)
    onClose()
  }
  const create = useMutation({
    mutationFn: (input: CreateSubAdminInput) => createSubAdmin(input),
    onSuccess: () => done('أُنشئ المسؤول'),
    onError: (error) => message.error(errorText(error, 'تعذّر الإنشاء')),
  })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSubAdminInput }) => updateSubAdmin(id, input),
    onSuccess: () => done('حُدّث المسؤول'),
    onError: (error) => message.error(errorText(error, 'تعذّر الحفظ')),
  })

  return (
    <Modal
      open={state !== null}
      title={editing ? `تعديل ${editing.username}` : 'مسؤول جديد'}
      okText={editing ? 'حفظ' : 'إنشاء'}
      cancelText="إلغاء"
      confirmLoading={create.isPending || update.isPending}
      onCancel={onClose}
      onOk={() => form.submit()}
      destroyOnHidden
      width={640}
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={
          editing
            ? { username: editing.username, phone: localPhone(editing.phone), permissions: editing.permissions, isActive: editing.isActive }
            : { permissions: [], isActive: true }
        }
        onFinish={(values: { username: string; phone: string; password?: string; permissions: AdminSection[]; isActive: boolean }) => {
          if (!editing) {
            create.mutate({ username: values.username, phone: values.phone, password: values.password!, permissions: values.permissions })
            return
          }
          const input: UpdateSubAdminInput = {}
          if (values.username !== editing.username) input.username = values.username
          if (values.phone !== localPhone(editing.phone)) input.phone = values.phone
          if ([...values.permissions].sort().join() !== [...editing.permissions].sort().join()) input.permissions = values.permissions
          if (values.isActive !== editing.isActive) input.isActive = values.isActive
          if (values.password) input.newPassword = values.password
          if (Object.keys(input).length === 0) return onClose()
          update.mutate({ id: editing.id, input })
        }}
      >
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item label="الاسم" name="username" rules={[{ required: true, min: 2, max: 40, message: 'اسم من 2 إلى 40 حرفاً' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="رقم الهاتف" name="phone" rules={phoneRules}>
              <Input dir="ltr" inputMode="tel" maxLength={IRAQI_MOBILE_LENGTH} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          label={editing ? 'كلمة مرور جديدة' : 'كلمة المرور'}
          name="password"
          rules={editing ? [{ min: 8, message: 'ثمانية أحرف على الأقل' }] : passwordRules}
          extra={editing ? 'اتركها فارغة للإبقاء على الحالية. تغييرها يُخرجه من كل أجهزته.' : 'كلمة دائمة — يغيّرها المسؤول من «ملفّي».'}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        {editing && (
          <Form.Item label="الحساب فعّال" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
        <Form.Item label="الصلاحيات" name="permissions">
          <PermissionPicker />
        </Form.Item>
      </Form>
    </Modal>
  )
}

function SubAdminsTab() {
  const { message } = AntApp.useApp()
  const queryClient = useQueryClient()
  const [editor, setEditor] = useState<EditorState>(null)
  const admins = useQuery({ queryKey: ['sub-admins'], queryFn: listSubAdmins })
  const remove = useMutation({
    mutationFn: deleteSubAdmin,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sub-admins'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-audit'] })
      message.success('حُذف المسؤول')
    },
    onError: (error) => message.error(errorText(error, 'تعذّر الحذف')),
  })

  const actions = (admin: SubAdmin) => (
    <Space wrap size={6}>
      <Button size="small" icon={<EditOutlined />} onClick={() => setEditor({ mode: 'edit', admin })}>
        تعديل
      </Button>
      <Popconfirm
        title={`حذف ${admin.username}؟`}
        description="يُحذف الحساب نهائياً ويبقى ما فعله في سجلّ النشاط باسمه."
        okText="حذف"
        okButtonProps={{ danger: true }}
        cancelText="إلغاء"
        onConfirm={() => remove.mutateAsync(admin.id)}
      >
        <Button size="small" danger icon={<DeleteOutlined />} loading={remove.isPending && remove.variables === admin.id}>
          حذف
        </Button>
      </Popconfirm>
    </Space>
  )

  const status = (admin: SubAdmin) =>
    admin.isActive ? <Tag color="green">فعّال</Tag> : <Tag color="red">موقوف</Tag>

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Flex justify="flex-end" gap={8} wrap>
        <Button icon={<ReloadOutlined />} onClick={() => admins.refetch()} loading={admins.isFetching}>
          تحديث
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor({ mode: 'create' })}>
          مسؤول جديد
        </Button>
      </Flex>
      <ResponsiveTable<SubAdmin>
        rowKey="id"
        loading={admins.isPending}
        dataSource={admins.data?.items ?? []}
        pagination={false}
        locale={{ emptyText: <EmptyState description="لا مسؤولين فرعيين بعد" /> }}
        columns={[
          {
            title: 'المسؤول',
            key: 'who',
            width: 220,
            render: (_: unknown, admin) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{admin.username}</Typography.Text>
                <PhoneText phone={admin.phone} secondary />
              </Space>
            ),
          },
          { title: 'الحالة', key: 'status', width: 100, render: (_: unknown, admin) => status(admin) },
          { title: 'الصلاحيات', key: 'permissions', width: 300, render: (_: unknown, admin) => <PermissionTags permissions={admin.permissions} /> },
          {
            title: 'آخر نشاط',
            key: 'activity',
            width: 160,
            render: (_: unknown, admin) => (admin.lastActivityAt ? formatDateTime(admin.lastActivityAt) : '—'),
          },
          { title: 'الإجراءات', key: 'actions', width: 190, fixed: 'end', render: (_: unknown, admin) => actions(admin) },
        ]}
        renderCard={(admin) => (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <Flex justify="space-between" align="flex-start" gap={8}>
              <Space direction="vertical" size={0} style={{ minWidth: 0 }}>
                <Typography.Text strong>{admin.username}</Typography.Text>
                <PhoneText phone={admin.phone} secondary />
              </Space>
              {status(admin)}
            </Flex>
            <PermissionTags permissions={admin.permissions} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              آخر نشاط: {admin.lastActivityAt ? formatDateTime(admin.lastActivityAt) : '—'}
            </Typography.Text>
            {actions(admin)}
          </Space>
        )}
      />
      <AdminEditor state={editor} onClose={() => setEditor(null)} />
    </Space>
  )
}

// ── سجلّ النشاط ──

function describeAudit(entry: AuditEntry) {
  const label = AUDIT_ACTION_LABELS[entry.action]
  if (label) return label
  // الأفعال العامّة: «PATCH /orders/:id/status» كما سُجّلت.
  return entry.action
}

function auditDetails(entry: AuditEntry) {
  const details = entry.details ?? {}
  const parts: string[] = []
  if (typeof details.username === 'string') parts.push(details.username)
  if (Array.isArray(details.added) && details.added.length)
    parts.push(`أُضيف: ${(details.added as AdminSection[]).map((s) => ADMIN_SECTION_LABELS[s] ?? s).join('، ')}`)
  if (Array.isArray(details.removed) && details.removed.length)
    parts.push(`سُحب: ${(details.removed as AdminSection[]).map((s) => ADMIN_SECTION_LABELS[s] ?? s).join('، ')}`)
  if (Array.isArray(details.fields) && details.fields.length) parts.push(`الحقول: ${(details.fields as string[]).join('، ')}`)
  if (typeof details.unlinkedProducts === 'number') parts.push(`فُكّ ارتباط ${details.unlinkedProducts} منتج`)
  if (details.changes && typeof details.changes === 'object') {
    for (const [key, change] of Object.entries(details.changes as Record<string, { before: string; after: string }>)) {
      parts.push(`${key}: «${change.before || '—'}» ← «${change.after || '—'}»`)
    }
  }
  return parts.join(' · ')
}

function AuditTab() {
  const [page, setPage] = useState(1)
  const [actorId, setActorId] = useState<string | undefined>()
  const admins = useQuery({ queryKey: ['sub-admins'], queryFn: listSubAdmins })
  const { data: me } = useAdminProfile()
  const audit = useQuery({
    queryKey: ['admin-audit', { page, actorId }],
    queryFn: () => listAudit({ page, limit: 20, ...(actorId ? { actorId } : {}) }),
  })
  const actors = useMemo(
    () => [
      ...(me ? [{ value: me.id, label: `${me.username} (أنت)` }] : []),
      ...(admins.data?.items ?? []).map((admin) => ({ value: admin.id, label: admin.username })),
    ],
    [admins.data, me],
  )
  const pagination = {
    current: page,
    pageSize: 20,
    total: audit.data?.total ?? 0,
    showSizeChanger: false,
    onChange: setPage,
  }
  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Select
        allowClear
        placeholder="كل المسؤولين"
        style={{ width: '100%', maxWidth: 320 }}
        value={actorId}
        options={actors}
        onChange={(value) => {
          setActorId(value)
          setPage(1)
        }}
      />
      <ResponsiveTable<AuditEntry>
        rowKey="id"
        loading={audit.isPending}
        dataSource={audit.data?.items ?? []}
        pagination={pagination}
        locale={{ emptyText: <EmptyState description="لا نشاط مسجَّل" /> }}
        columns={[
          { title: 'الوقت', key: 'at', width: 160, render: (_: unknown, e) => formatDateTime(e.createdAt) },
          { title: 'المسؤول', dataIndex: 'actorName', key: 'actor', width: 160 },
          { title: 'الفعل', key: 'action', width: 240, render: (_: unknown, e) => describeAudit(e) },
          { title: 'التفاصيل', key: 'details', width: 280, render: (_: unknown, e) => <Typography.Text type="secondary">{auditDetails(e) || '—'}</Typography.Text> },
        ]}
        renderCard={(e) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Flex justify="space-between" gap={8} wrap>
              <Typography.Text strong>{e.actorName}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {formatDateTime(e.createdAt)}
              </Typography.Text>
            </Flex>
            <Typography.Text>{describeAudit(e)}</Typography.Text>
            {auditDetails(e) && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {auditDetails(e)}
              </Typography.Text>
            )}
          </Space>
        )}
      />
    </Space>
  )
}

/**
 * «المسؤولون» — المسؤول الأعلى يدير الفرعيين ويرى نشاطهم؛ والفرعي بصلاحية
 * «المسؤولون» يرى ملفّه وحده (الخادم يرفض له كل ما سواه).
 */
export default function AdminsPage() {
  const { data: profile } = useAdminProfile()
  const isSuper = Boolean(profile?.isSuperAdmin)
  const items = [
    { key: 'me', label: 'ملفّي', children: <OwnProfileTab /> },
    ...(isSuper
      ? [
          { key: 'admins', label: 'المسؤولون', children: <SubAdminsTab /> },
          { key: 'audit', label: 'سجلّ النشاط', children: <AuditTab /> },
        ]
      : []),
  ]
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="المسؤولون"
        description={isSuper ? 'الملفّ الشخصي، والمسؤولون الفرعيون وصلاحياتهم، وسجلّ نشاطهم.' : 'ملفّك الشخصي.'}
      />
      <Tabs items={items} destroyOnHidden />
    </Space>
  )
}
