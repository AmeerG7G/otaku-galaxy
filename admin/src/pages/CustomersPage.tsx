import { resolveMediaUrl } from '../utils/media'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Avatar,
  Button,
  Card,
  Flex,
  Grid,
  Modal,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import { ReloadOutlined, StarOutlined } from '@ant-design/icons'
import type { TablePaginationConfig } from 'antd'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCustomers, setUserActive } from '../api/customersApi'
import { PointsLedger } from '../components/PointsLedger'
import { ApiError } from '../api/client'
import type {
  AdminCustomer,
  CustomerGenderFilter,
  CustomerSort,
} from '../types/customers'
import { CUSTOMER_SORT_LABELS, customerGenderLabel } from '../types/customers'
import { formatDateTime } from '../utils/format'
import EmptyState from '../components/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { SearchField } from '../components/ui/SearchField'
import { WhatsAppButton } from '../components/ui/WhatsAppButton'

const PAGE_SIZE = 12

/** سلّم المجرّة الثابت — سبعة مستويات كما في `domain/galaxyPoints.ts`. */
const GALAXY_LEVEL_OPTIONS = [
  { value: 'beginner', label: '1 · مبتدئ المجرة' },
  { value: 'explorer', label: '2 · مستكشف المجرة' },
  { value: 'voyager', label: '3 · رحّالة المجرة' },
  { value: 'warrior', label: '4 · محارب المجرة' },
  { value: 'champion', label: '5 · بطل المجرة' },
  { value: 'star', label: '6 · نجم المجرة' },
  { value: 'legend', label: '7 · أسطورة المجرة' },
]

/** مهلة الكتابة قبل إطلاق البحث — طلب لكل حرف يُغرق الخادم بلا فائدة. */
const SEARCH_DEBOUNCE_MS = 350

type ActivityFilter = 'all' | 'active' | 'blocked'
type BirthdayFilter = 'all' | 'yes' | 'no'
type OrdersFilter = 'all' | 'yes' | 'no'

/** «الكل» تعني «بلا ترشيح» — لا تُرسَل إلى الخادم أصلاً. */
function tri(value: 'all' | 'yes' | 'no'): boolean | undefined {
  if (value === 'all') return undefined
  return value === 'yes'
}

export default function CustomersPage() {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pointsFor, setPointsFor] = useState<AdminCustomer | null>(null)
  const screens = Grid.useBreakpoint()

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [activity, setActivity] = useState<ActivityFilter>('all')
  const [birthday, setBirthday] = useState<BirthdayFilter>('all')
  const [orders, setOrders] = useState<OrdersFilter>('all')
  const [gender, setGender] = useState<CustomerGenderFilter>('all')
  const [levelKey, setLevelKey] = useState<string>('all')
  const [sort, setSort] = useState<CustomerSort>('newest')

  // البحث يُرسَل بعد سكون الكتابة، ويعود بالقائمة إلى صفحتها الأولى: البقاء
  // على الصفحة الخامسة بعد تضييق النتائج يعرض جدولاً فارغاً بلا سبب ظاهر.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  // [CRITICAL] كل المعايير تُرسَل إلى الخادم. الترشيح في المتصفح كان يعني
  // تحميل كل زبون في المتجر على كل حرف — يعمل على عشرين، وينهار على ألف.
  const filters = {
    page,
    limit: PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(activity === 'all' ? {} : { isActive: activity === 'active' }),
    ...(tri(birthday) === undefined ? {} : { hasBirthday: tri(birthday) }),
    ...(tri(orders) === undefined ? {} : { hasOrders: tri(orders) }),
    ...(gender === 'all' ? {} : { gender }),
    ...(levelKey === 'all' ? {} : { levelKey }),
    sort,
  }

  const customersQuery = useQuery({
    queryKey: ['customers', filters],
    queryFn: () => listCustomers(filters),
  })

  function resetFilters() {
    setSearchInput('')
    setSearch('')
    setActivity('all')
    setBirthday('all')
    setOrders('all')
    setGender('all')
    setLevelKey('all')
    setSort('newest')
    setPage(1)
  }

  const filtersActive =
    search !== '' ||
    activity !== 'all' ||
    birthday !== 'all' ||
    orders !== 'all' ||
    gender !== 'all' ||
    levelKey !== 'all'

  const invalidateCustomers = () => {
    queryClient.invalidateQueries({ queryKey: ['customers'] })
  }

  const toggleMutation = useMutation({
    mutationFn: setUserActive,
    onSuccess: (result) => {
      message.success(result.message)
      invalidateCustomers()
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  function confirmToggle(customer: AdminCustomer) {
    const blocking = customer.isActive
    modal.confirm({
      title: blocking ? 'حظر العميل؟' : 'تفعيل العميل؟',
      content: blocking
        ? `لن يتمكن «${customer.username}» من تسجيل الدخول أو الطلب حتى يُعاد تفعيله.`
        : `سيتمكن «${customer.username}» من تسجيل الدخول والطلب مجدداً.`,
      okText: blocking ? 'حظر' : 'تفعيل',
      okButtonProps: { danger: blocking },
      cancelText: 'إلغاء',
      onOk: () => toggleMutation.mutateAsync({ id: customer.id, isActive: !blocking }),
    })
  }

  const columns = [
    {
      title: 'المستخدم',
      key: 'user',
      render: (_: unknown, customer: AdminCustomer) => (
        <Flex align="center" gap={10}>
          <Avatar src={resolveMediaUrl(customer.avatarUrl)} size={36}>
            {customer.username.charAt(0)}
          </Avatar>
          <div>
            <Link to={`/customers/${customer.id}`}>
              <Typography.Text strong>{customer.username}</Typography.Text>
            </Link>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 11 }} copyable={{ text: customer.id }}>
                {customer.id.slice(0, 8)}
              </Typography.Text>
            </div>
          </div>
        </Flex>
      ),
    },
    {
      // الرقم كاملاً: هذه شاشةُ مسؤولٍ مصادَق، وإخفاء خاناته يجعلها بلا فائدة
      // لطاقم يتواصل مع الزبون.
      title: 'رقم الهاتف',
      dataIndex: 'phone',
      key: 'phone',
      width: 170,
      render: (phone: string) => (
        <Typography.Text copyable style={{ direction: 'ltr', display: 'inline-block' }}>
          {phone}
        </Typography.Text>
      ),
    },
    {
      title: 'الجنس',
      dataIndex: 'gender',
      key: 'gender',
      width: 110,
      // [CRITICAL] القيمة المخزَّنة وحدها: ذكر أو أنثى. لا استنتاج من الاسم،
      // و`null` (حسابٌ أقدم من حقل الجنس لم يُسأل) تُعرض «—» — غيابُ قيمة لا
      // جنسٌ ثالث، ولا تُحسب ذكراً.
      render: (value: AdminCustomer['gender']) =>
        value === 'male' ? (
          <Tag color="blue">{customerGenderLabel('male')}</Tag>
        ) : value === 'female' ? (
          <Tag color="red">{customerGenderLabel('female')}</Tag>
        ) : (
          <Typography.Text type="secondary">{customerGenderLabel(null)}</Typography.Text>
        ),
    },
    {
      title: 'الحالة',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (value: boolean) =>
        value ? <Tag color="green">نشط</Tag> : <Tag color="red">محظور</Tag>,
    },
    {
      title: 'الميلاد',
      key: 'birthday',
      width: 110,
      render: (_: unknown, customer: AdminCustomer) =>
        customer.hasBirthday ? (
          <Tag color="magenta">
            {customer.birthDay}/{customer.birthMonth}
          </Tag>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: 'الطلبات',
      key: 'orders',
      width: 120,
      render: (_: unknown, customer: AdminCustomer) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{customer.ordersTotal}</Typography.Text>
          {customer.ordersCompleted > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {customer.ordersCompleted} مكتمل
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: 'تاريخ الإنشاء',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'النقاط',
      key: 'points',
      width: 140,
      render: (_: unknown, customer: AdminCustomer) => (
        <Space size={6}>
          <Typography.Text strong>{customer.points}</Typography.Text>
          <Button size="small" icon={<StarOutlined />} onClick={() => setPointsFor(customer)}>
            السجل
          </Button>
        </Space>
      ),
    },
    {
      title: 'الإجراءات',
      key: 'actions',
      width: 210,
      render: (_: unknown, customer: AdminCustomer) => {
        return (
          <Space size={6}>
            {/*
              يفتح المحادثة فقط ولا يرسل شيئاً: التواصل يبقى فعلاً صريحاً من
              المسؤول، ولا خادم مراسلة جديد خلفه.
            */}
            <WhatsAppButton phone={customer.phone} />
            <Button
              size="small"
              danger={customer.isActive}
              loading={toggleMutation.isPending && toggleMutation.variables?.id === customer.id}
              onClick={() => confirmToggle(customer)}
            >
              {customer.isActive ? 'حظر' : 'تفعيل'}
            </Button>
          </Space>
        )
      },
    },
  ]

  const items = customersQuery.data?.items ?? []
  // العدّادات من الخادم لا من الصفحة المعروضة — انظر `CustomerGenderCounts`.
  const genderCounts = customersQuery.data?.genderCounts

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current ?? 1)
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="الزبائن"
        description="بحث وترشيح على الخادم — يعمل مهما كبرت القائمة."
        extra={
          <Space wrap>
            {filtersActive && <Button onClick={resetFilters}>مسح الترشيح</Button>}
            <Button
              icon={<ReloadOutlined />}
              loading={customersQuery.isFetching}
              onClick={() => customersQuery.refetch()}
            >
              تحديث
            </Button>
          </Space>
        }
      />

      <Card variant="outlined">
        <Flex wrap gap={12} align="center">
          <SearchField
            placeholder="ابحث بالاسم أو رقم الهاتف أو معرّف الحساب"
            aria-label="بحث الزبائن"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            style={screens.md ? undefined : { maxWidth: 'none', flexBasis: '100%' }}
          />
          <Segmented
            value={activity}
            onChange={(value) => {
              setActivity(value as ActivityFilter)
              setPage(1)
            }}
            options={[
              { label: 'الكل', value: 'all' },
              { label: 'نشط', value: 'active' },
              { label: 'محظور', value: 'blocked' },
            ]}
          />
          <Select
            value={birthday}
            onChange={(value) => {
              setBirthday(value)
              setPage(1)
            }}
            style={{ minWidth: 160 }}
            options={[
              { value: 'all', label: 'الميلاد: الكل' },
              { value: 'yes', label: 'سجّل ميلاده' },
              { value: 'no', label: 'لم يسجّل ميلاده' },
            ]}
          />
          <Select
            value={orders}
            onChange={(value) => {
              setOrders(value)
              setPage(1)
            }}
            style={{ minWidth: 150 }}
            options={[
              { value: 'all', label: 'الطلبات: الكل' },
              { value: 'yes', label: 'له طلبات' },
              { value: 'no', label: 'بلا طلبات' },
            ]}
          />
          <Segmented
            value={gender}
            onChange={(value) => {
              setGender(value as CustomerGenderFilter)
              setPage(1)
            }}
            aria-label="الجنس"
            block={!screens.md}
            style={screens.md ? undefined : { width: '100%' }}
            options={[
              { label: 'الكل', value: 'all' },
              { label: 'ذكور', value: 'male' },
              { label: 'إناث', value: 'female' },
            ]}
          />
          {/* المستوى مشتقٌّ من الرصيد على الخادم — الترشيح هناك لا هنا. */}
          <Select
            value={levelKey}
            style={{ minWidth: 170 }}
            onChange={(value) => {
              setLevelKey(value)
              setPage(1)
            }}
            options={[
              { value: 'all', label: 'كل المستويات' },
              ...GALAXY_LEVEL_OPTIONS,
            ]}
          />
          <Select
            value={sort}
            onChange={(value) => {
              setSort(value)
              setPage(1)
            }}
            style={{ minWidth: 175 }}
            options={(Object.keys(CUSTOMER_SORT_LABELS) as CustomerSort[]).map((key) => ({
              value: key,
              label: CUSTOMER_SORT_LABELS[key],
            }))}
          />
        </Flex>
      </Card>

      {genderCounts && (
        <Card variant="outlined">
          <Flex wrap gap={32}>
            <Statistic title="جميع المستخدمين" value={genderCounts.total} />
            <Statistic title="الذكور" value={genderCounts.male} />
            <Statistic title="الإناث" value={genderCounts.female} />
          </Flex>
        </Card>
      )}

      <Card>
        {customersQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message="تعذر تحميل العملاء"
            description={customersQuery.error.message}
            action={
              <Button size="small" onClick={() => customersQuery.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={items}
            loading={customersQuery.isPending || customersQuery.isFetching}
            scroll={{ x: 1400 }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: customersQuery.data?.total ?? 0,
              showSizeChanger: false,
              showTotal: (total) => `${total} زبون`,
            }}
            onChange={handleTableChange}
            locale={{
              emptyText: (
                <EmptyState
                  description={
                    filtersActive
                      ? 'لا زبون يطابق هذا الترشيح'
                      : 'لا يوجد زبائن بعد'
                  }
                  actionLabel={filtersActive ? 'مسح الترشيح' : undefined}
                  onAction={filtersActive ? resetFilters : undefined}
                />
              ),
            }}
          />
        )}
      </Card>
      <Modal
        open={Boolean(pointsFor)}
        onCancel={() => setPointsFor(null)}
        footer={null}
        width={860}
        destroyOnHidden
        title={pointsFor ? `نقاط ${pointsFor.username}` : 'النقاط'}
      >
        {pointsFor && <PointsLedger customerId={pointsFor.id} />}
      </Modal>
    </Space>
  )
}