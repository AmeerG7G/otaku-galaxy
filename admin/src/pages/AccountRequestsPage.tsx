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
  Input,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TablePaginationConfig } from 'antd'
import {
  CheckOutlined,
  CloseOutlined,
  KeyOutlined,
  ReloadOutlined,
  WhatsAppOutlined,
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
import {
  ACCOUNT_REQUEST_KIND_LABELS,
  ACCOUNT_REQUEST_STATUS_LABELS,
  type AccountRequest,
  type AccountRequestKind,
  type AccountRequestStatus,
} from '../types/accountRequests'
import { customerGenderLabel } from '../types/customers'
import { formatDateTime } from '../utils/format'
import { whatsappUrl } from '../utils/phone'

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

  const columns = [
    {
      title: 'النوع',
      dataIndex: 'kind',
      key: 'kind',
      width: 150,
      render: (value: AccountRequestKind) => ACCOUNT_REQUEST_KIND_LABELS[value],
    },
    {
      title: 'ما أرسله الزبون',
      key: 'submitted',
      render: (_: unknown, r: AccountRequest) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{r.submitted.username}</Typography.Text>
          <Typography.Text dir="ltr" copyable>
            {r.submitted.phone}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {customerGenderLabel(r.submitted.gender)}
            {r.submitted.levelKey ? ` · المستوى: ${r.submitted.levelKey}` : ''}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'الحساب المخزَّن',
      key: 'account',
      render: (_: unknown, r: AccountRequest) =>
        r.account ? (
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
        ),
    },
    {
      title: 'الحالة',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value: AccountRequestStatus, r: AccountRequest) => (
        <Space direction="vertical" size={0}>
          <Tag color={STATUS_COLORS[value]}>{ACCOUNT_REQUEST_STATUS_LABELS[value]}</Tag>
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
      ),
    },
    {
      title: 'وقت الطلب',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'الإجراءات',
      key: 'actions',
      width: 300,
      render: (_: unknown, r: AccountRequest) => {
        const chat = whatsappUrl(r.submitted.phone)
        const pending = r.status === 'pending'
        return (
          <Space size={6} wrap>
            {/* يفتح المحادثة فقط ولا يرسل شيئاً — التحقّق فعلٌ يدوي من المسؤول. */}
            <Button
              size="small"
              icon={<WhatsAppOutlined />}
              disabled={!chat}
              href={chat ?? undefined}
              target="_blank"
              rel="noreferrer noopener"
            >
              واتساب
            </Button>
            {pending && r.kind === 'registration' && (
              <Button
                size="small"
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
                size="small"
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
                size="small"
                danger
                icon={<CloseOutlined />}
                loading={rejectMutation.isPending && rejectMutation.variables?.id === r.id}
                onClick={() => confirmReject(r)}
              >
                رفض
              </Button>
            )}
          </Space>
        )
      },
    },
  ]

  const data = requestsQuery.data
  const pendingCounts = data?.pending

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current ?? 1)
  }

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
                    <span style={{ paddingInlineEnd: 10 }}>إنشاء حساب</span>
                  </Badge>
                ),
              },
              {
                value: 'password_reset',
                label: (
                  <Badge count={pendingCounts?.password_reset ?? 0} size="small" offset={[-6, 0]}>
                    <span style={{ paddingInlineEnd: 10 }}>إعادة تعيين كلمة المرور</span>
                  </Badge>
                ),
              },
            ]}
          />
          <Select<AccountRequestStatus | 'all'>
            value={status}
            style={{ width: 160 }}
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
          <Input.Search
            allowClear
            placeholder="بحث بالرقم أو الاسم المرسَل"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ width: 260 }}
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
          <Table<AccountRequest>
            rowKey="id"
            loading={requestsQuery.isLoading}
            dataSource={data?.items ?? []}
            columns={columns}
            onChange={handleTableChange}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: data?.total ?? 0,
              showSizeChanger: false,
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
