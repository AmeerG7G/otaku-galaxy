import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Flex,
  Grid,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd'
import { ReloadOutlined, SendOutlined } from '@ant-design/icons'
import { listBirthdayCustomers } from '../api/customersApi'
import {
  BIRTHDAY_FILTER_LABELS,
  type BirthdayCustomer,
  type BirthdayFilter,
} from '../types/birthdays'
import type { BroadcastAudience } from '../types/notifications'
import BroadcastComposer from '../components/BroadcastComposer'
import EmptyState from '../components/EmptyState'
import { resolveMediaUrl } from '../utils/media'
import { formatDateTime } from '../utils/format'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { useCan } from '../hooks/useAdminProfile'
import { useTableState } from '../hooks/useTableState'

const PAGE_SIZE = 20

/** التبويبات بالترتيب الذي يعمل به المسؤول: الأعجل أولاً. */
const TABS: BirthdayFilter[] = [
  'today',
  'upcoming',
  'recent',
  'missing',
  'registered',
  'all',
]

/** نصوص مقترحة لكل جمهور — يعدّلها المسؤول قبل الإرسال. */
const SUGGESTED: Partial<Record<BirthdayFilter, { title: string; body: string }>> = {
  today: {
    title: 'كل عام وأنت بخير 🎂',
    body: 'عيد ميلاد سعيد! خصم ميلادك بانتظارك في التطبيق.',
  },
  upcoming: {
    title: 'عيد ميلادك قرب 🎁',
    body: 'استعد — خصم عيد ميلادك يفتح في يومه.',
  },
  missing: {
    title: 'أكمل تاريخ ميلادك 🎂',
    body: 'سجّل تاريخ ميلادك في التطبيق لتحصل على مزايا عيد ميلادك.',
  },
}

/**
 * أعياد الميلاد — من قائمة مسجَّلين إلى أداة استهداف.
 *
 * [CRITICAL] «اليوم» و«قريباً» يحسبهما الخادم بمنطقة المتجر الزمنية
 * (Asia/Baghdad افتراضياً) لا بساعة متصفح المسؤول ولا بـUTC. خادمٌ يعمل
 * بـUTC يرى يوماً جديداً الثالثة فجراً ببغداد: تصل تهنئةُ الغد قبل أن
 * ينتهي اليوم عند صاحبها بثلاث ساعات، ويمرّ يومُه الحقيقي مصنَّفاً «أمس».
 *
 * ولا إرسال تلقائي: لا جدولة إشعارات في المنظومة (الجدولة الوحيدة القائمة
 * هي تذكير التقييم، وهي مربوطة بحالة الطلب لا بالتقويم). ادّعاء تهنئة
 * تلقائية هنا كان سيعني وعداً لا ينفّذه شيء.
 */
/** نوافذ «قادمة/مؤخّراً» — والقيمة في الرابط تُقبل منها وحدها. */
const WINDOWS = [7, 14, 30] as const

function readTab(raw: string | undefined): BirthdayFilter {
  return TABS.includes(raw as BirthdayFilter) ? (raw as BirthdayFilter) : 'today'
}

function readWindow(raw: string | undefined): number {
  const value = Number(raw)
  return (WINDOWS as readonly number[]).includes(value) ? value : 7
}

export default function BirthdaysPage() {
  // [STEP 64 §15] التبويب والنافذة والصفحة في الرابط لا في حالة المكوّن: كانت
  // إعادة التحميل تُرجع كل اختيار إلى «أعياد اليوم / ٧ أيام» — «الخيار لا يُحفظ».
  const table = useTableState()
  const filter = readTab(table.value('tab'))
  const windowDays = readWindow(table.value('window'))
  const page = table.page
  const [composer, setComposer] = useState<BroadcastAudience | null>(null)
  const screens = Grid.useBreakpoint()
  const canNotify = useCan('notifications')

  function update(next: { tab?: BirthdayFilter; window?: number; page?: number }) {
    const params = new URLSearchParams(table.searchParams)
    if (next.tab !== undefined) params.set('tab', next.tab)
    if (next.window !== undefined) params.set('window', String(next.window))
    params.set('page', String(next.page ?? 1))
    table.setSearchParams(params)
  }

  const query = useQuery({
    queryKey: ['admin-birthdays', filter, windowDays, page],
    queryFn: () =>
      listBirthdayCustomers({ filter, windowDays, page, limit: PAGE_SIZE }),
  })

  const counts = query.data?.counts
  const windowed = filter === 'upcoming' || filter === 'recent'

  /** جمهور التبويب الحالي — نفس المعيار الذي بنى الجدول. */
  function audienceForTab(): BroadcastAudience | null {
    switch (filter) {
      case 'today':
        return { audience: 'segment', segment: 'birthday_today' }
      case 'upcoming':
        return { audience: 'segment', segment: 'birthday_upcoming', windowDays }
      case 'recent':
        return { audience: 'segment', segment: 'birthday_recent', windowDays }
      case 'missing':
        return { audience: 'segment', segment: 'birthday_missing' }
      default:
        // «المسجَّلون» و«الكل» ليسا مناسبتين — إشعارٌ بلا مناسبة إزعاج.
        return null
    }
  }

  const tabAudience = audienceForTab()
  const suggestion = SUGGESTED[filter]

  const renderWho = (customer: BirthdayCustomer) => (
    <Flex align="center" gap={10}>
      <Avatar src={resolveMediaUrl(customer.avatarUrl)} size={34}>
        {customer.username.charAt(0)}
      </Avatar>
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{customer.username}</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {customer.phone}
        </Typography.Text>
      </Space>
    </Flex>
  )
  const renderBirthday = (customer: BirthdayCustomer) =>
    customer.isRegistered ? (
      <Tag color="magenta" style={{ marginInlineEnd: 0 }}>
        {customer.birthDay}/{customer.birthMonth}
      </Tag>
    ) : (
      <Tag style={{ marginInlineEnd: 0 }}>لم يسجّل</Tag>
    )
  const renderDays = (customer: BirthdayCustomer) => {
    if (customer.daysUntilBirthday === null) return '—'
    if (customer.daysUntilBirthday === 0) return <Tag color="gold">اليوم 🎂</Tag>
    return `${customer.daysUntilBirthday} يوم`
  }
  const renderDiscount = (used: boolean) =>
    used ? <Tag color="default">مستهلَك</Tag> : <Tag color="green">متاح</Tag>

  const columns = [
    {
      title: 'الزبون',
      key: 'user',
      render: (_: unknown, customer: BirthdayCustomer) => renderWho(customer),
    },
    {
      title: 'الميلاد',
      key: 'birthday',
      width: 120,
      render: (_: unknown, customer: BirthdayCustomer) => renderBirthday(customer),
    },
    {
      title: 'المتبقّي',
      key: 'daysUntil',
      width: 140,
      render: (_: unknown, customer: BirthdayCustomer) => renderDays(customer),
    },
    {
      title: 'خصم هذه السنة',
      dataIndex: 'discountUsedThisYear',
      key: 'discountUsedThisYear',
      width: 140,
      render: (value: boolean) => renderDiscount(value),
    },
    {
      title: 'طلبات مكتملة',
      dataIndex: 'completedOrders',
      key: 'completedOrders',
      width: 130,
    },
    {
      title: 'سجّل في',
      dataIndex: 'birthdaySetAt',
      key: 'birthdaySetAt',
      render: (value: string | null) => (value ? formatDateTime(value) : '—'),
    },
  ]

  /** بطاقة الهاتف — كل أعمدة الجدول، بلا عرضٍ ثابت ولا تمرير جانبي. */
  function renderCard(customer: BirthdayCustomer) {
    return (
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Flex justify="space-between" align="center" gap={8}>
          {renderWho(customer)}
          {renderBirthday(customer)}
        </Flex>
        <Flex wrap gap={8} align="center">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>المتبقّي:</Typography.Text>
          {renderDays(customer)}
          {renderDiscount(customer.discountUsedThisYear)}
        </Flex>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          طلبات مكتملة: {customer.completedOrders} · سجّل في:{' '}
          {customer.birthdaySetAt ? formatDateTime(customer.birthdaySetAt) : '—'}
        </Typography.Text>
      </Space>
    )
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="أعياد الميلاد"
        description="من له عيد اليوم، ومن يقترب عيده، ومن لم يسجّل تاريخه بعد."
        extra={
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              loading={query.isFetching}
              onClick={() => query.refetch()}
            >
              تحديث
            </Button>
            {canNotify && (
              <Button
                type="primary"
                icon={<SendOutlined />}
                disabled={!tabAudience || (query.data?.total ?? 0) === 0}
                onClick={() => setComposer(tabAudience)}
              >
                إشعار لهذه المجموعة
              </Button>
            )}
          </Space>
        }
      />

      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="أعياد اليوم" value={counts?.today ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={`خلال ${counts?.windowDays ?? windowDays} يوماً`}
              value={counts?.upcoming ?? 0}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="مسجَّلون" value={counts?.registered ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="لم يسجّلوا" value={counts?.missing ?? 0} />
          </Card>
        </Col>
      </Row>

      <Card variant="outlined">
        {/*
          [STEP 64 §15] على الهاتف كان شريط التبويبات الستّة (497px) في صندوقٍ
          بعرض 309 داخل محتوى يقصّ الفائض أفقياً: «المسجَّلون» و«الكل» خارج
          الشاشة فلا يُضغطان — «الخيار الأخير لا يُحفظ». دون `md` صار قائمةً
          منسدلة بعرض السطر، والنافذة شريطاً بعرض السطر؛ كل خيار في المتناول.
        */}
        <Flex wrap gap={12} align="center" vertical={!screens.md} style={{ marginBottom: 16 }}>
          {screens.md ? (
            <Segmented
              value={filter}
              onChange={(value) => update({ tab: value as BirthdayFilter })}
              options={TABS.map((value) => ({ label: BIRTHDAY_FILTER_LABELS[value], value }))}
            />
          ) : (
            <Select
              aria-label="مجموعة أعياد الميلاد"
              value={filter}
              style={{ width: '100%' }}
              onChange={(value: BirthdayFilter) => update({ tab: value })}
              options={TABS.map((value) => ({ label: BIRTHDAY_FILTER_LABELS[value], value }))}
            />
          )}
          {windowed && (
            <Segmented
              block={!screens.md}
              style={screens.md ? undefined : { width: '100%' }}
              value={windowDays}
              onChange={(value) => update({ window: Number(value) })}
              options={[
                { label: '٧ أيام', value: 7 },
                { label: '١٤ يوماً', value: 14 },
                { label: '٣٠ يوماً', value: 30 },
              ]}
            />
          )}
        </Flex>

        {query.isError ? (
          <Alert
            type="error"
            showIcon
            message="تعذّر تحميل القائمة"
            description={query.error.message}
            action={
              <Button size="small" onClick={() => query.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : (
          <ResponsiveTable<BirthdayCustomer>
            rowKey="id"
            columns={columns}
            dataSource={query.data?.items ?? []}
            loading={query.isPending || query.isFetching}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: query.data?.total ?? 0,
              showSizeChanger: false,
              showTotal: (total) => `${total} زبون`,
              onChange: (next) => update({ page: next }),
            }}
            renderCard={renderCard}
            locale={{
              emptyText: (
                <EmptyState
                  description={`لا زبون في «${BIRTHDAY_FILTER_LABELS[filter]}»`}
                />
              ),
            }}
          />
        )}
      </Card>

      <BroadcastComposer
        open={composer !== null}
        initialAudience={composer ?? undefined}
        initialTitle={suggestion?.title}
        initialBody={suggestion?.body}
        onClose={() => setComposer(null)}
      />
    </Space>
  )
}
