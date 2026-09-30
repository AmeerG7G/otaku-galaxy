import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  App as AntApp,
  Badge,
  Button,
  Card,
  Descriptions,
  Flex,
  Grid,
  Input,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  CheckOutlined,
  CloseOutlined,
  KeyOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  approveAccountRequest,
  listAccountRequests,
  rejectAccountRequest,
} from '../api/accountRequestsApi'
import { ApiError } from '../api/client'
import EmptyState from '../components/EmptyState'
import SetCustomerPasswordModal from '../components/SetCustomerPasswordModal'
import { PageHeader } from '../components/ui/PageHeader'
import { PhoneText } from '../components/ui/PhoneText'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { SearchField } from '../components/ui/SearchField'
import { WhatsAppButton } from '../components/ui/WhatsAppButton'
import {
  ACCOUNT_REQUEST_KIND_LABELS,
  ACCOUNT_REQUEST_STATUS_LABELS,
  type AccountRequest,
  type AccountRequestKind,
  type AccountRequestStatus,
} from '../types/accountRequests'
import { customerGenderLabel } from '../types/customers'
import { formatDateTime } from '../utils/format'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 350

const STATUS_COLORS: Record<AccountRequestStatus, string> = {
  pending: 'gold',
  approved: 'green',
  rejected: 'red',
}

/** إشارة مطابقة — للعين لا للقرار. */
function MatchTag({ ok, label }: { ok: boolean; label: string }) {
  return <Tag color={ok ? 'green' : 'volcano'}>{ok ? '✓' : '✗'} {label}</Tag>
}

/**
 * طلبات الحساب — إنشاءٌ وإعادةُ تعيين — كما تحسمها الإدارة يدوياً.
 *
 * ═══ القرار ═══ لا رمز SMS ولا بريد. الطلب يحمل ما أرسله الزبون بجانب
 * لقطة حسابه المخزَّن؛ المسؤول يفتح واتساب من هنا، يتحقّق بنفسه، ثم:
 *   - تسجيل: **موافقة** تفعّل الحساب، أو **رفض** يبقى في السجل.
 *   - إعادة تعيين: **وضع كلمة مرور جديدة دائمة** (لا موافقة بلا كلمة)،
 *     أو **رفض**.
 * لا شيء هنا آلي: إشارات المطابقة تلوّن الفرق ولا تقرّر.
 */
export default function AccountRequestsPage() {
  const { message, modal } = AntApp.useApp()
  const screens = Grid.useBreakpoint()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<AccountRequestKind | 'all'>('all')
  const [status, setStatus] = useState<AccountRequestStatus | 'all'>('pending')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [passwordFor, setPasswordFor] = useState<AccountRequest | null>(null)

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [searchInput])

  const requestsQuery = useQuery({
    queryKey: ['account-requests', { kind, status, search, page }],
    queryFn: () =>
      listAccountRequests({
        page,
        limit: PAGE_SIZE,
        ...(kind !== 'all' ? { kind } : {}),
        ...(status !== 'all' ? { status } : {}),
        ...(search ? { search } : {}),
      }),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['account-requests'] })
    void queryClient.invalidateQueries({ queryKey: ['customers'] })
  }

  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => approveAccountRequest(id, note),
    onSuccess: ({ message: text }) => {
      message.success(text || 'تمت الموافقة')
      invalidate()
    },
    onError: (error) => message.error(error instanceof ApiError ? error.message : 'تعذّرت الموافقة'),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => rejectAccountRequest(id, note),
    onSuccess: ({ message: text }) => {
      message.success(text || 'رُفض الطلب')
      invalidate()
    },
    onError: (error) => message.error(error instanceof ApiError ? error.message : 'تعذّر الرفض'),
  })

  function confirmApprove(request: AccountRequest) {
    let note = ''
    modal.confirm({
      title: 'تفعيل الحساب؟',
      content: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text>
            هل تحقّقت من {request.submitted.username} ({request.submitted.phone}) عبر واتساب؟
            بعد الموافقة يدخل الزبون بكلمة المرور التي اختارها عند التسجيل.
          </Typography.Text>
          <Input.TextArea
            rows={2}
            maxLength={500}
            placeholder="ملاحظة (اختيارية) — تبقى في السجل"
            onChange={(e) => {
              note = e.target.value
            }}
          />
        </Space>
      ),
      okText: 'موافقة وتفعيل',
      cancelText: 'إلغاء',
      onOk: () => approveMutation.mutateAsync({ id: request.id, ...(note.trim() ? { note: note.trim() } : {}) }),
    })
  }

  function confirmReject(request: AccountRequest) {
    let note = ''
    modal.confirm({
      title: 'رفض الطلب؟',
      content: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text>
            الطلب يبقى في السجل بحالة «مرفوض». يمكن للزبون التقديم من جديد لاحقاً.
          </Typography.Text>
          <Input.TextArea
            rows={2}
            maxLength={500}
            placeholder="سبب الرفض (اختياري) — يبقى في السجل"
            onChange={(e) => {
              note = e.target.value
            }}
          />
        </Space>
      ),
      okText: 'رفض',
      okButtonProps: { danger: true },
      cancelText: 'إلغاء',
      onOk: () => rejectMutation.mutateAsync({ id: request.id, ...(note.trim() ? { note: note.trim() } : {}) }),
    })
  }

  /** إجراءات الطلب — المعالجات نفسها في الجدول والبطاقة. */
  function renderActions(r: AccountRequest, block = false) {
    const pending = r.status === 'pending'
    const buttonProps = block ? { block: true, size: 'middle' as const } : { size: 'small' as const }
    return (
      <Flex gap={6} wrap vertical={block}>
        {/* يفتح المحادثة فقط ولا يرسل شيئاً — التحقّق فعلٌ يدوي من المسؤول. */}
        <WhatsAppButton phone={r.submitted.phone} {...buttonProps} />
        {pending && r.kind === 'registration' && (
          <Button
            {...buttonProps}
            type="primary"
            icon={<CheckOutlined />}
            disabled={!r.account}
            loading={approveMutation.isPending && approveMutation.variables?.id === r.id}
            onClick={() => confirmApprove(r)}
          >
            موافقة
          </Button>
        )}
        {pending && r.kind === 'password_reset' && (
          <Button
            {...buttonProps}
            type="primary"
            icon={<KeyOutlined />}
            disabled={!r.account}
            onClick={() => setPasswordFor(r)}
          >
            تغيير كلمة المرور
          </Button>
        )}
        {pending && (
          <Button
            {...buttonProps}
            danger
            icon={<CloseOutlined />}
            loading={rejectMutation.isPending && rejectMutation.variables?.id === r.id}
            onClick={() => confirmReject(r)}
          >
            رفض
          </Button>
        )}
      </Flex>
    )
  }

  function renderSubmitted(r: AccountRequest) {
    return (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{r.submitted.username}</Typography.Text>
        <PhoneText phone={r.submitted.phone} copyable />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {customerGenderLabel(r.submitted.gender)}
          {r.submitted.levelKey ? ` · المستوى: ${r.submitted.levelKey}` : ''}
        </Typography.Text>
      </Space>
    )
  }

  function renderAccount(r: AccountRequest) {
    return r.account ? (
      <Space direction="vertical" size={2}>
        <Link to={`/customers/${r.account.id}`}>{r.account.username}</Link>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {customerGenderLabel(r.account.gender)}
          {r.account.levelKey ? ` · المستوى: ${r.account.levelKey} (${r.account.points ?? 0} نقطة)` : ''}
          {r.account.isVerified ? ' · مفعَّل' : ' · غير مفعَّل'}
          {r.account.isActive ? '' : ' · محظور'}
        </Typography.Text>
        {r.kind === 'password_reset' && r.match && (
          <Space size={4} wrap>
            <MatchTag ok={r.match.username} label="الاسم" />
            <MatchTag ok={r.match.gender} label="الجنس" />
            <MatchTag ok={r.match.level} label="المستوى" />
          </Space>
        )}
      </Space>
    ) : (
      <Tag color="volcano">لا حساب بهذا الرقم</Tag>
    )
  }

  function renderStatus(r: AccountRequest) {
    return (
      <Space direction="vertical" size={0}>
        <Tag color={STATUS_COLORS[r.status]}>{ACCOUNT_REQUEST_STATUS_LABELS[r.status]}</Tag>
        {r.resolvedAt && (
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {formatDateTime(r.resolvedAt)}
          </Typography.Text>
        )}
        {r.adminNote && (
          <Typography.Text type="secondary" style={{ fontSize: 11 }} ellipsis={{ tooltip: r.adminNote }}>
            {r.adminNote}
          </Typography.Text>
        )}
      </Space>
    )
  }

  /** بطاقة الهاتف: كل ما في الصفّ، والإجراءات بعرض البطاقة. */
  function renderCard(r: AccountRequest) {
    return (
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Flex justify="space-between" align="flex-start" gap={8} wrap>
          <Tag color="purple" style={{ marginInlineEnd: 0 }}>{ACCOUNT_REQUEST_KIND_LABELS[r.kind]}</Tag>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(r.createdAt)}</Typography.Text>
        </Flex>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>ما أرسله الزبون</Typography.Text>
          {renderSubmitted(r)}
        </div>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>الحساب المخزَّن</Typography.Text>
          {renderAccount(r)}
        </div>
        {renderStatus(r)}
        {renderActions(r, true)}
      </Space>
    )
  }

  // [CRITICAL] العمودان المرنان كانا بلا عرض، والجدول بلا `scroll.x`: الأعمدة
  // الثابتة أخذت حصّتها وسُحق «ما أرسله الزبون» إلى ٤٠px فتكسّر الاسم حرفاً
  // حرفاً والرقم إلى «+9647 / 71234 / 5678»، ثم خرج الفائض من البطاقة وقُصّ.
  // الآن لكل عمودٍ عرض، والجدول يتمرّر أفقياً (`ResponsiveTable`)، والإجراءات
  // مثبّتة في نهايته فلا تغيب أثناء التمرير.
  const columns = [
    {
      title: 'النوع',
      dataIndex: 'kind',
      key: 'kind',
      width: 130,
      render: (value: AccountRequestKind) => ACCOUNT_REQUEST_KIND_LABELS[value],
    },
    {
      title: 'ما أرسله الزبون',
      key: 'submitted',
      width: 230,
      render: (_: unknown, r: AccountRequest) => renderSubmitted(r),
    },
    {
      title: 'الحساب المخزَّن',
      key: 'account',
      width: 270,
      render: (_: unknown, r: AccountRequest) => renderAccount(r),
    },
    {
      title: 'الحالة',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (_: AccountRequestStatus, r: AccountRequest) => renderStatus(r),
    },
    {
      title: 'وقت الطلب',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (value: string) => <span style={{ whiteSpace: 'nowrap' }}>{formatDateTime(value)}</span>,
    },
    {
      title: 'الإجراءات',
      key: 'actions',
      width: 240,
      fixed: 'end' as const,
      render: (_: unknown, r: AccountRequest) => renderActions(r),
    },
  ]

  const data = requestsQuery.data
  const pendingCounts = data?.pending

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="طلبات الحساب"
        description="إنشاء الحسابات وإعادة تعيين كلمات المرور — تُحسم يدوياً بعد التحقّق عبر واتساب. لا رمز SMS."
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => requestsQuery.refetch()} loading={requestsQuery.isFetching}>
            تحديث
          </Button>
        }
      />

      <Card variant="outlined">
        <Flex gap={12} wrap align="center">
          <Segmented<AccountRequestKind | 'all'>
            className="og-segmented-wrap"
            block={!screens.md}
            style={screens.md ? undefined : { width: '100%' }}
            value={kind}
            onChange={(value) => {
              setKind(value)
              setPage(1)
            }}
            options={[
              { value: 'all', label: 'الكل' },
              {
                value: 'registration',
                label: (
                  <Badge count={pendingCounts?.registration ?? 0} size="small" offset={[-6, 0]}>
                    <span style={{ paddingInlineEnd: 10 }}>{screens.md ? 'إنشاء حساب' : 'حساب جديد'}</span>
                  </Badge>
                ),
              },
              {
                value: 'password_reset',
                label: (
                  <Badge count={pendingCounts?.password_reset ?? 0} size="small" offset={[-6, 0]}>
                    <span style={{ paddingInlineEnd: 10 }}>{screens.md ? 'إعادة تعيين كلمة المرور' : 'كلمة المرور'}</span>
                  </Badge>
                ),
              },
            ]}
          />
          <Select<AccountRequestStatus | 'all'>
            value={status}
            style={{ width: 160, flex: '0 0 auto' }}
            onChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
            options={[
              { value: 'pending', label: 'قيد المراجعة' },
              { value: 'approved', label: 'موافَق عليه' },
              { value: 'rejected', label: 'مرفوض' },
              { value: 'all', label: 'كل الحالات' },
            ]}
          />
          <SearchField
            placeholder="بحث بالرقم أو الاسم المرسَل"
            aria-label="بحث طلبات الحساب"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </Flex>
      </Card>

      <Card>
        {requestsQuery.isError ? (
          <EmptyState
            description="تعذّر تحميل الطلبات"
            actionLabel="إعادة المحاولة"
            onAction={() => requestsQuery.refetch()}
          />
        ) : (
          <ResponsiveTable<AccountRequest>
            rowKey="id"
            loading={requestsQuery.isLoading}
            dataSource={data?.items ?? []}
            columns={columns}
            renderCard={renderCard}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: data?.total ?? 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
            locale={{ emptyText: <EmptyState description="لا طلبات مطابقة" /> }}
            expandable={{
              expandedRowRender: (r) => (
                <Descriptions size="small" column={2} bordered>
                  <Descriptions.Item label="معرّف الطلب">
                    <Typography.Text code copyable>
                      {r.id}
                    </Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="معرّف الحساب">
                    {r.account ? (
                      <Typography.Text code copyable>
                        {r.account.id}
                      </Typography.Text>
                    ) : (
                      '—'
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="المستوى المرسَل">{r.submitted.levelKey ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="المستوى المخزَّن">
                    {r.account?.levelKey ? `${r.account.levelKey} (${r.account.levelNumber})` : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="تاريخ إنشاء الحساب">
                    {r.account ? formatDateTime(r.account.createdAt) : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="آخر تحديث للطلب">{formatDateTime(r.updatedAt)}</Descriptions.Item>
                  <Descriptions.Item label="ملاحظة المسؤول" span={2}>
                    {r.adminNote ?? '—'}
                  </Descriptions.Item>
                </Descriptions>
              ),
            }}
          />
        )}
      </Card>

      {passwordFor?.account && (
        <SetCustomerPasswordModal
          open
          customerId={passwordFor.account.id}
          customerName={passwordFor.account.username}
          requestId={passwordFor.id}
          onClose={() => setPasswordFor(null)}
        />
      )}
    </Space>
  )
}
