import { useEffect, useMemo, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Flex,
  Form,
  Input,
  List,
  Radio,
  Row,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd'
import { CloudUploadOutlined, HistoryOutlined, LinkOutlined, StopOutlined, SyncOutlined } from '@ant-design/icons'
import { fetchAppVersionSettings, updateAppVersionSettings } from '../api/appVersionApi'
import { ApiError } from '../api/client'
import { PageHeader } from '../components/ui/PageHeader'
import { ErrorState } from '../components/ui/States'
import { copy } from '../constants/appUpdateCopy'
import {
  PRODUCTION_PACKAGE_ID,
  SEMVER_PATTERN,
  canonicalPlayStoreUrl,
  compareVersions,
  packageIdOf,
  type AppUpdateAdminView,
  type AppUpdateHistoryEntry,
  type AppUpdatePolicy,
  type AppUpdatePolicyInput,
  type UpdateMode,
} from '../types/appVersion'
import { formatDateTime } from '../utils/format'

/**
 * «تحديث التطبيق» — نشر سياسة التحديث إلى التطبيقات المثبَّتة (STEP 70).
 *
 * [CRITICAL] «إرسال التحديث» يكتب السياسة في الخادم وحده. لا يرفع APK/AAB إلى
 * Google Play ولا ينشر إصداراً هناك: الإصدار يُنشر من Google Play Console
 * أولاً، ثم يُلصق رابطه ورقمه هنا.
 *
 * والإجباري يحجب التطبيق فوراً عن كل نسخةٍ أقدم من الحدّ — لذلك: تأكيدٌ صريح
 * قبل كل نشر، ومعاينةٌ لما يراه الزبون، و«إيقاف السياسة» بضغطة (التراجع)،
 * والخادم يرفض حدّاً أعلى من أحدث إصدار ورابطاً ليس صفحة تطبيقنا.
 */
interface PolicyFormValues {
  enabled: boolean
  mode: UpdateMode
  latestVersion: string
  minimumVersion: string
  updateUrl: string
}

const QUERY_KEY = ['admin-app-version'] as const

function formValuesFrom(policy: AppUpdatePolicy): PolicyFormValues {
  return {
    enabled: policy.enabled,
    mode: policy.mode ?? 'mandatory',
    latestVersion: policy.latestVersion,
    minimumVersion: policy.minimumVersion,
    updateUrl: policy.updateUrl,
  }
}

function trimmed(values: PolicyFormValues): PolicyFormValues {
  return {
    enabled: Boolean(values.enabled),
    mode: values.mode,
    latestVersion: (values.latestVersion ?? '').trim(),
    minimumVersion: (values.minimumVersion ?? '').trim(),
    updateUrl: (values.updateUrl ?? '').trim(),
  }
}

export default function AppUpdatesPage() {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<PolicyFormValues>()
  const watched = Form.useWatch([], form) as PolicyFormValues | undefined

  const query = useQuery({ queryKey: QUERY_KEY, queryFn: fetchAppVersionSettings })
  const view = query.data

  useEffect(() => {
    if (view) form.setFieldsValue(formValuesFrom(view))
  }, [view, form])

  const publish = useMutation({
    mutationFn: (input: AppUpdatePolicyInput) => updateAppVersionSettings(input),
    onSuccess: (saved) => {
      queryClient.setQueryData(QUERY_KEY, saved)
      message.success(saved.enabled ? 'نُشرت سياسة التحديث' : 'سياسة التحديث موقوفة — لا أحد يرى تنبيهاً ولا حجباً')
    },
    onError: async (error: Error) => {
      message.error(error.message)
      // مسؤولٌ آخر غيّرها: القيم المعروضة قديمة، فتُعاد من الخادم.
      if (error instanceof ApiError && error.code === 'APP_UPDATE_POLICY_CHANGED') {
        await queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      }
    },
  })

  function submit(raw: PolicyFormValues) {
    if (!view) return
    const values = trimmed(raw)
    const input: AppUpdatePolicyInput = { ...values, revision: view.revision }
    const mandatory = values.enabled && values.mode === 'mandatory'
    const title = !values.enabled
      ? 'حفظ السياسة موقوفة؟'
      : mandatory
        ? 'نشر تحديث إجباري؟'
        : 'نشر تحديث اختياري؟'
    const content = !values.enabled
      ? 'لن يرى أحدٌ تنبيهاً ولا حجباً، وتبقى القيم محفوظة للمرة القادمة.'
      : mandatory
        ? `كل نسخةٍ أقدم من ${values.minimumVersion} ستُحجب فوراً ولن تستطيع استعمال التطبيق حتى تحدّث من Google Play. تأكّد أن الإصدار ${values.latestVersion} منشورٌ ومتاحٌ للجميع على الرابط قبل المتابعة.`
        : `النسخ الأقدم من ${values.latestVersion} سترى تنبيهاً يمكن إغلاقه مرةً لكل إصدار. لا أحد يُحجب.`
    modal.confirm({
      title,
      content,
      okText: mandatory ? 'نعم، فعّل الحجب' : 'إرسال',
      okButtonProps: { danger: mandatory },
      cancelText: 'إلغاء',
      onOk: () => publish.mutateAsync(input).catch(() => undefined),
    })
  }

  function disable() {
    if (!view) return
    modal.confirm({
      title: 'إيقاف سياسة التحديث؟',
      content: 'يُرفع الحجب والتنبيه فوراً عن كل النسخ، بلا إصدار ولا نشر خادم. القيم تبقى محفوظة.',
      okText: 'إيقاف الآن',
      okButtonProps: { danger: true },
      cancelText: 'إلغاء',
      onOk: () => publish.mutateAsync({ enabled: false, revision: view.revision }).catch(() => undefined),
    })
  }

  function restore(entry: AppUpdateHistoryEntry) {
    if (!entry.policy) return
    form.setFieldsValue(formValuesFrom(entry.policy))
    message.info(`حُمّلت قيم المراجعة ${entry.revision ?? ''} — راجعها ثم اضغط «إرسال التحديث»`)
  }

  if (query.isError) {
    return (
      <>
        <PageHeader title="تحديث التطبيق" />
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="تحديث التطبيق"
        description="ينشر سياسة التحديث إلى التطبيقات المثبَّتة. لا يرفع إصداراً إلى Google Play ولا ينشره هناك."
        extra={
          <Button icon={<SyncOutlined />} onClick={() => query.refetch()} loading={query.isFetching && !query.isPending}>
            تحديث
          </Button>
        }
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <StatusCard view={view} loading={query.isPending} onDisable={disable} disabling={publish.isPending} />
            <Card variant="outlined" title="السياسة" loading={query.isPending}>
              <PolicyForm form={form} watched={watched} onSubmit={submit} submitting={publish.isPending} />
            </Card>
          </Space>
        </Col>
        <Col xs={24} xl={10}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <PreviewCard values={watched} />
            <HistoryCard history={view?.history ?? []} loading={query.isPending} onRestore={restore} />
            <WorkflowCard />
          </Space>
        </Col>
      </Row>
    </>
  )
}

// ───────────────────────────── الحالة ─────────────────────────────

function StatusCard({
  view,
  loading,
  onDisable,
  disabling,
}: {
  view?: AppUpdateAdminView
  loading: boolean
  onDisable: () => void
  disabling: boolean
}) {
  const effective = view?.effective
  const tag = !view ? null : effective?.updateMode === 'mandatory' ? (
    <Tag color="red">إجباري — نافذ</Tag>
  ) : effective?.updateMode === 'optional' ? (
    <Tag color="gold">اختياري — نافذ</Tag>
  ) : view.enabled ? (
    <Tag color="orange">مفعّلة ولا تعمل</Tag>
  ) : (
    <Tag>موقوفة</Tag>
  )

  return (
    <Card
      variant="outlined"
      title={
        <Flex gap={8} align="center" wrap>
          <span>ما تراه التطبيقات الآن</span>
          {tag}
        </Flex>
      }
      loading={loading}
      extra={
        view?.enabled ? (
          <Button danger icon={<StopOutlined />} onClick={onDisable} loading={disabling}>
            إيقاف السياسة
          </Button>
        ) : null
      }
    >
      {view && (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {view.problem && <Alert type="warning" showIcon message={view.problem} />}
          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="أدنى إصدار مدعوم">
              {effective?.minimumSupportedVersion ? <Typography.Text dir="ltr">{effective.minimumSupportedVersion}</Typography.Text> : '— لا حجب'}
            </Descriptions.Item>
            <Descriptions.Item label="أحدث إصدار">
              {effective?.latestVersion ? <Typography.Text dir="ltr">{effective.latestVersion}</Typography.Text> : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="صفحة التطبيق">
              {effective?.updateUrl ? (
                <Typography.Link href={effective.updateUrl} target="_blank" rel="noopener noreferrer" dir="ltr" style={{ wordBreak: 'break-all' }}>
                  {packageIdOf(effective.updateUrl)}
                </Typography.Link>
              ) : (
                '—'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="آخر تعديل">
              {view.updatedAt ? `${view.updatedBy ?? '—'} · ${formatDateTime(view.updatedAt)}` : 'لم تُنشر سياسةٌ من اللوحة بعد'}
            </Descriptions.Item>
            <Descriptions.Item label="رقم المراجعة">{view.revision}</Descriptions.Item>
          </Descriptions>
        </Space>
      )}
    </Card>
  )
}

// ───────────────────────────── النموذج ─────────────────────────────

function versionRule(label: string, requiredWhen: () => boolean) {
  return {
    validator: (_rule: unknown, value: string) => {
      const text = (value ?? '').trim()
      if (!text) return requiredWhen() ? Promise.reject(new Error(`أدخل ${label}`)) : Promise.resolve()
      return SEMVER_PATTERN.test(text) ? Promise.resolve() : Promise.reject(new Error(`${label} بصيغة 1.2.3`))
    },
  }
}

function PolicyForm({
  form,
  watched,
  onSubmit,
  submitting,
}: {
  form: ReturnType<typeof Form.useForm<PolicyFormValues>>[0]
  watched?: PolicyFormValues
  onSubmit: (values: PolicyFormValues) => void
  submitting: boolean
}) {
  const enabled = Boolean(watched?.enabled)
  const mandatory = watched?.mode === 'mandatory'
  const packageId = packageIdOf(watched?.updateUrl ?? '')

  return (
    <Form
      form={form}
      layout="vertical"
      style={{ maxWidth: 560 }}
      initialValues={{ enabled: false, mode: 'mandatory', latestVersion: '', minimumVersion: '', updateUrl: '' }}
      onFinish={onSubmit}
      requiredMark={false}
    >
      <Form.Item
        name="updateUrl"
        label="رابط التطبيق على Google Play"
        dependencies={['enabled']}
        extra={
          packageId ? (
            packageId === PRODUCTION_PACKAGE_ID ? (
              <span>
                تطبيق الإنتاج: <span dir="ltr">{packageId}</span>
              </span>
            ) : (
              <Typography.Text type="warning">
                هذا ليس تطبيق الإنتاج: <span dir="ltr">{packageId}</span>
              </Typography.Text>
            )
          ) : (
            'انسخه من صفحة التطبيق في Google Play بعد نشر الإصدار هناك.'
          )
        }
        rules={[
          {
            validator: (_rule, value: string) => {
              const text = (value ?? '').trim()
              if (!text) {
                return form.getFieldValue('enabled')
                  ? Promise.reject(new Error('الصق رابط صفحة التطبيق قبل التفعيل'))
                  : Promise.resolve()
              }
              return canonicalPlayStoreUrl(text)
                ? Promise.resolve()
                : Promise.reject(new Error('الرابط ليس صفحة تطبيقنا على Google Play (https://play.google.com/store/apps/details?id=…)'))
            },
          },
        ]}
      >
        <Input dir="ltr" prefix={<LinkOutlined />} placeholder={`https://play.google.com/store/apps/details?id=${PRODUCTION_PACKAGE_ID}`} />
      </Form.Item>

      <Form.Item
        name="latestVersion"
        label="أحدث إصدار منشور على Google Play"
        dependencies={['enabled']}
        extra="رقم الإصدار (versionName) كما يظهر في Play Console، مثل 1.2.0."
        rules={[versionRule('أحدث إصدار', () => Boolean(form.getFieldValue('enabled')))]}
      >
        <Input dir="ltr" placeholder="1.2.0" inputMode="decimal" />
      </Form.Item>

      <Form.Item name="mode" label="نوع التحديث">
        <Radio.Group>
          <Space direction="vertical">
            <Radio value="optional">اختياري — تنبيهٌ يُغلق للنسخ الأقدم من أحدث إصدار</Radio>
            <Radio value="mandatory">إجباري — حجب النسخ الأقدم من أدنى إصدار مدعوم</Radio>
          </Space>
        </Radio.Group>
      </Form.Item>

      <Form.Item
        name="minimumVersion"
        label="أدنى إصدار مدعوم"
        dependencies={['enabled', 'mode', 'latestVersion']}
        extra={mandatory ? 'النسخ الأقدم منه تُحجب. لا يتجاوز أحدث إصدار.' : 'لا يُطبَّق في التحديث الاختياري.'}
        rules={[
          versionRule('أدنى إصدار مدعوم', () => form.getFieldValue('enabled') && form.getFieldValue('mode') === 'mandatory'),
          {
            validator: (_rule, value: string) => {
              const latest = (form.getFieldValue('latestVersion') ?? '').trim()
              const minimum = (value ?? '').trim()
              if (!minimum || !latest) return Promise.resolve()
              return (compareVersions(minimum, latest) ?? 0) > 0
                ? Promise.reject(new Error('أعلى من أحدث إصدار — لن تستطيع أي نسخة تجاوز شاشة التحديث'))
                : Promise.resolve()
            },
          },
        ]}
      >
        <Input dir="ltr" placeholder="1.1.0" inputMode="decimal" disabled={!mandatory} />
      </Form.Item>

      <Form.Item name="enabled" label="تفعيل السياسة" valuePropName="checked">
        <Switch checkedChildren="مفعّلة" unCheckedChildren="موقوفة" />
      </Form.Item>

      <Button
        type="primary"
        htmlType="submit"
        icon={<CloudUploadOutlined />}
        loading={submitting}
        danger={enabled && mandatory}
      >
        إرسال التحديث
      </Button>
    </Form>
  )
}

// ───────────────────────────── المعاينة ─────────────────────────────

/** ما يراه الزبون — بالنصّ نفسه الذي يعرضه التطبيق بالعربية. */
function PreviewCard({ values }: { values?: PolicyFormValues }) {
  const v = values ? trimmed(values) : undefined
  const minimum = v?.enabled && v.mode === 'mandatory' && SEMVER_PATTERN.test(v.minimumVersion) ? v.minimumVersion : ''
  const latest = v?.enabled && SEMVER_PATTERN.test(v.latestVersion) ? v.latestVersion : ''
  const optionalBand = latest && (!minimum || (compareVersions(minimum, latest) ?? 0) < 0)

  const ranges = useMemo(() => {
    if (!v?.enabled) return ['السياسة موقوفة: لا أحد يرى تنبيهاً ولا حجباً.']
    const lines: string[] = []
    if (minimum) lines.push(`النسخ الأقدم من ${minimum}: تُحجب حتى التحديث.`)
    if (optionalBand) lines.push(minimum ? `من ${minimum} إلى أقدم من ${latest}: تنبيهٌ يُغلق.` : `النسخ الأقدم من ${latest}: تنبيهٌ يُغلق.`)
    if (latest) lines.push(`${latest} فما فوق: لا شيء.`)
    return lines.length ? lines : ['أكمل الحقول لترى أثر السياسة.']
  }, [v?.enabled, minimum, latest, optionalBand])

  return (
    <Card variant="outlined" title="معاينة ما يراه الزبون">
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        {minimum ? (
          <PhoneFrame testId="preview-mandatory">
            <Typography.Title level={5} style={{ margin: 0 }}>{copy('updateRequiredTitle')}</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ margin: 0 }}>{copy('updateRequiredMessage')}</Typography.Paragraph>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {copy('yourVersion', 'x.y.z')} · {copy('requiredVersion', minimum)}
            </Typography.Text>
            <Button type="primary" block>{copy('updateApp')}</Button>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>بلا زرّ رجوع ولا «لاحقاً».</Typography.Text>
          </PhoneFrame>
        ) : null}
        {optionalBand ? (
          <PhoneFrame testId="preview-optional">
            <Typography.Title level={5} style={{ margin: 0 }}>{copy('updateAvailableTitle')}</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ margin: 0 }}>{copy('updateAvailableMessage')}</Typography.Paragraph>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{copy('latestVersion', latest)}</Typography.Text>
            <Flex gap={8}>
              <Button type="primary" style={{ flex: 1 }}>{copy('updateApp')}</Button>
              <Button style={{ flex: 1 }}>{copy('updateLater')}</Button>
            </Flex>
          </PhoneFrame>
        ) : null}
        {!minimum && !optionalBand ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="لا شيء يظهر للزبون" /> : null}
        <div>
          <Typography.Text strong>النسخ المتأثّرة</Typography.Text>
          <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }} data-testid="affected-ranges">
            {ranges.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            لا تُحصى الأجهزة لكل إصدار — الأثر نطاقات إصدارات لا أعداد. تطبيقٌ لم يتّصل بالخادم بعد النشر لا يعرف بالسياسة حتى يتّصل.
          </Typography.Text>
        </div>
      </Space>
    </Card>
  )
}

function PhoneFrame({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div
      data-testid={testId}
      style={{
        maxWidth: 320,
        width: '100%',
        marginInline: 'auto',
        border: '1px solid var(--ant-color-border, #d9d9d9)',
        borderRadius: 24,
        padding: '22px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {children}
    </div>
  )
}

// ───────────────────────────── السجلّ ─────────────────────────────

function historySummary(policy: AppUpdatePolicy | null, changes: AppUpdateHistoryEntry['changes']): string {
  if (!policy) return `تغيّر: ${Object.keys(changes).join('، ') || '—'}`
  if (!policy.enabled) return 'موقوفة'
  return policy.mode === 'mandatory'
    ? `إجباري · الحدّ ${policy.minimumVersion || '—'} · الأحدث ${policy.latestVersion || '—'}`
    : `اختياري · الأحدث ${policy.latestVersion || '—'}`
}

function HistoryCard({
  history,
  loading,
  onRestore,
}: {
  history: AppUpdateHistoryEntry[]
  loading: boolean
  onRestore: (entry: AppUpdateHistoryEntry) => void
}) {
  return (
    <Card variant="outlined" title={<span><HistoryOutlined /> آخر التغييرات</span>} loading={loading}>
      <List
        dataSource={history}
        locale={{ emptyText: 'لا تغييرات منشورة بعد' }}
        renderItem={(entry, index) => (
          <List.Item
            actions={
              entry.policy && index > 0
                ? [
                    <Button key="restore" size="small" onClick={() => onRestore(entry)}>
                      استعادة هذه القيم
                    </Button>,
                  ]
                : []
            }
          >
            <List.Item.Meta
              title={
                <span>
                  {entry.revision !== null ? `المراجعة ${entry.revision} · ` : ''}
                  {historySummary(entry.policy, entry.changes)}
                </span>
              }
              description={`${entry.actorName} · ${formatDateTime(entry.createdAt)}`}
            />
          </List.Item>
        )}
      />
    </Card>
  )
}

// ───────────────────────────── الخطوات ─────────────────────────────

function WorkflowCard() {
  return (
    <Card variant="outlined" title="خطوات نشر تحديث">
      <ol style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.9 }}>
        <li>انشر الإصدار الجديد على Google Play (من Play Console) وانتظر حتى يصير متاحاً للجميع.</li>
        <li>انسخ رابط صفحة التطبيق العامّ على Google Play.</li>
        <li>الصقه هنا، وأدخل أحدث إصدار، ثم اختر النوع (وأدنى إصدار مدعوم للإجباري).</li>
        <li>راجع المعاينة والنسخ المتأثّرة، ثم اضغط «إرسال التحديث» وأكّد.</li>
        <li>للتراجع: «إيقاف السياسة» أعلاه، أو «استعادة هذه القيم» من آخر التغييرات ثم «إرسال التحديث».</li>
      </ol>
      <Alert
        style={{ marginTop: 12 }}
        type="info"
        showIcon
        message="هذا الزرّ لا ينشر شيئاً على Google Play"
        description="نشر الإصدار يتمّ في Google Play Console. «إرسال التحديث» يخبر التطبيقات المثبَّتة بالسياسة فقط."
      />
    </Card>
  )
}
