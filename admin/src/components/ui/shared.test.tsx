import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../api/adminAccountsApi', () => ({ fetchAdminMe: vi.fn() }))

import { fetchAdminMe } from '../../api/adminAccountsApi'
import { useAuthStore } from '../../stores/authStore'
import { DESKTOP, PHONE, setViewportWidth } from '../../test/viewport'
import { PhoneText } from './PhoneText'
import { ProductLink } from './ProductLink'
import { ResponsiveTable } from './ResponsiveTable'
import { tableScrollWidth } from './tableLayout'
import { SearchField } from './SearchField'
import { WhatsAppButton } from './WhatsAppButton'

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  )
}

type Row = { id: string; name: string }
const rows: Row[] = [
  { id: 'a', name: 'الأول' },
  { id: 'b', name: 'الثاني' },
]

/** STEP 64 — مكوّنات اللوحة المشتركة. */
describe('ResponsiveTable', () => {
  afterEach(() => setViewportWidth(PHONE))

  it('الهاتف: بطاقة لكل صفّ تحمل data-row-key، بلا جدول', () => {
    setViewportWidth(PHONE)
    const { container } = wrap(
      <ResponsiveTable<Row> rowKey="id" dataSource={rows} columns={[{ title: 'الاسم', dataIndex: 'name' }]} renderCard={(r) => <span>بطاقة {r.name}</span>} />,
    )
    expect(container.querySelector('.ant-table')).toBeNull()
    expect(container.querySelectorAll('[data-row-key]')).toHaveLength(2)
    expect(screen.getByText('بطاقة الأول').closest('[data-row-key]')).toHaveAttribute('data-row-key', 'a')
  })

  it('الشاشة العريضة: الجدول نفسه', () => {
    setViewportWidth(DESKTOP)
    const { container } = wrap(
      <ResponsiveTable<Row> rowKey="id" dataSource={rows} columns={[{ title: 'الاسم', dataIndex: 'name' }]} renderCard={(r) => <span>بطاقة {r.name}</span>} />,
    )
    expect(container.querySelector('.ant-table')).not.toBeNull()
    expect(screen.queryByText('بطاقة الأول')).toBeNull()
  })

  it('الترقيم على الهاتف يستدعي onChange نفسه الذي يستعمله الجدول', async () => {
    setViewportWidth(PHONE)
    const onChange = vi.fn()
    wrap(
      <ResponsiveTable<Row>
        rowKey="id"
        dataSource={rows}
        columns={[{ title: 'الاسم', dataIndex: 'name' }]}
        pagination={{ current: 1, pageSize: 2, total: 6, onChange }}
        renderCard={(r) => <span>{r.name}</span>}
      />,
    )
    await userEvent.click(screen.getByTitle('2'))
    expect(onChange).toHaveBeenCalledWith(2, 2)
  })
})

/**
 * [STEP 66] «لا يمكن تمرير جدول الطلبات/طلبات الحساب أفقياً».
 *
 * جدولٌ بلا `scroll.x` يُضغط في البطاقة (عمودٌ مرنٌ بـ٤٠px) ثم يفيض فيقصّه
 * المحتوى؛ وجدولٌ به يتمرّر لكن شريطه الوحيد تحت آخر صفّ خارج الشاشة. العقد:
 * الجدول حاوية تمريرٍ بعرضه الطبيعي، برأسٍ لاصق وشريطٍ أفقي لاصق، والعمود
 * المثبَّت (`fixed: 'end'`) يبقى ظاهراً. jsdom لا يرسم — التمرير الفعلي والشريط
 * اللاصق تحقّقٌ في المتصفّح (انظر تقرير STEP 66)؛ هنا الإعداد الذي يصنعهما.
 */
describe('ResponsiveTable — جدولٌ عريض لا يُقصّ (STEP 66)', () => {
  afterEach(() => setViewportWidth(PHONE))

  const wide = [
    { title: 'الاسم', dataIndex: 'name', width: 300 },
    { title: 'بلا عرض', key: 'free' },
    { title: 'الإجراءات', key: 'actions', width: 200, fixed: 'end' as const },
  ]

  it('عرض التمرير = مجموع الأعمدة (عمودٌ بلا عرض = 160، والتوسيع 48)', () => {
    expect(tableScrollWidth(wide)).toBe(660)
    expect(tableScrollWidth(wide, { expandable: true })).toBe(708)
    expect(tableScrollWidth([{ title: 'مجموعة', children: [{ title: 'أ', width: 100 }, { title: 'ب', width: 50 }] }])).toBe(150)
  })

  it('الشاشة العريضة: الجدول بعرضه الطبيعي داخل حاوية تمرير، برأسٍ لاصق، والإجراءات مثبّتة في النهاية', () => {
    setViewportWidth(DESKTOP)
    const { container } = wrap(<ResponsiveTable<Row> rowKey="id" dataSource={rows} columns={wide} renderCard={() => null} />)
    const body = container.querySelector('.ant-table-body > table') as HTMLTableElement
    expect(body.style.width).toBe('660px')
    expect(container.querySelector('.ant-table')!.classList.contains('ant-table-scroll-horizontal')).toBe(true)
    // رأسٌ لاصق ⇒ rc-table يرسم شريط التمرير الأفقي اللاصق أسفل الشاشة.
    expect(container.querySelector('.ant-table-header.ant-table-sticky-holder')).not.toBeNull()
    const pinned = container.querySelectorAll('td.ant-table-cell-fix-end')
    expect(pinned).toHaveLength(rows.length)
  })

  it('من يريد غير ذلك يقوله صراحةً — `scroll` و`sticky` الممرَّران يغلبان', () => {
    setViewportWidth(DESKTOP)
    const { container } = wrap(
      <ResponsiveTable<Row> rowKey="id" dataSource={rows} columns={wide} scroll={{ x: 900 }} sticky={false} renderCard={() => null} />,
    )
    expect(container.querySelector('.ant-table-sticky-holder')).toBeNull()
    expect((container.querySelector('.ant-table-content > table, .ant-table-body > table') as HTMLTableElement).style.width).toBe('900px')
  })
})

describe('PhoneText', () => {
  it('[STEP 66] الاتجاه في style لا في سمة dir — صنف أنتديب RTL كان يقلب «+9647…» إلى «…9647+»', () => {
    render(<PhoneText phone="+9647701234567" />)
    const el = screen.getByTestId('phone-text')
    expect(el).toHaveTextContent('+9647701234567')
    expect(el.style.direction).toBe('ltr')
    expect(el.style.unicodeBidi).toBe('isolate')
    expect(el.style.whiteSpace).toBe('nowrap')
  })
})

describe('ProductLink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('من يملك «المنتجات» يرى رابطاً إلى صفحة المنتج القائمة', async () => {
    useAuthStore.setState({ token: 't', user: null })
    vi.mocked(fetchAdminMe).mockResolvedValue({ id: 'x', username: 'م', phone: '+9647800000001', isSuperAdmin: false, permissions: ['orders', 'products'] })
    wrap(<ProductLink productId="p9" name="تيشيرت" image={null} />)
    const link = await screen.findByRole('link', { name: 'فتح المنتج تيشيرت' })
    expect(link).toHaveAttribute('href', '/products/p9/edit')
    expect(within(link).getByRole('img')).toBeInTheDocument()
  })

  it('بلا صلاحية «المنتجات» — نصٌّ لا رابط (لا صفحة «لا صلاحية»)', async () => {
    useAuthStore.setState({ token: 't', user: null })
    vi.mocked(fetchAdminMe).mockResolvedValue({ id: 'x', username: 'م', phone: '+9647800000001', isSuperAdmin: false, permissions: ['orders'] })
    wrap(<ProductLink productId="p9" name="تيشيرت" />)
    expect(await screen.findByText('تيشيرت')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('منتجٌ حُذف من الكتالوج (بلا معرّف) — نصٌّ', () => {
    useAuthStore.setState({ token: null, user: null })
    wrap(<ProductLink productId={null} name="منتج محذوف" />)
    expect(screen.getByText('منتج محذوف')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('WhatsAppButton', () => {
  it('رقم الحساب الدولي والمحلي ⇒ wa.me بالصيغة الدولية', () => {
    wrap(
      <>
        <WhatsAppButton phone="+9647701234567" label="أ" />
        <WhatsAppButton phone="07701234567" label="ب" />
      </>,
    )
    expect(screen.getByText('أ').closest('a')).toHaveAttribute('href', 'https://wa.me/9647701234567')
    expect(screen.getByText('ب').closest('a')).toHaveAttribute('href', 'https://wa.me/9647701234567')
  })

  it('رقمٌ غائب أو مقنَّع ⇒ زرٌّ معطَّل بلا رابط', () => {
    wrap(
      <>
        <WhatsAppButton phone={null} label="غائب" />
        <WhatsAppButton phone="0770****567" label="مقنّع" />
      </>,
    )
    for (const label of ['غائب', 'مقنّع']) {
      const button = screen.getByText(label).closest('button')!
      expect(button).toBeDisabled()
      expect(button.closest('a')).toBeNull()
    }
  })
})

describe('SearchField', () => {
  it('يتمدّد في صفّ الأدوات ويحمل زرّ مسح وأيقونة', () => {
    const { container } = wrap(<SearchField placeholder="بحث" aria-label="بحث" value="x" onChange={() => {}} />)
    const affix = container.querySelector('.ant-input-affix-wrapper') as HTMLElement
    expect(affix.style.flex).toBe('1 1 240px')
    expect(affix.style.maxWidth).toBe('420px')
    expect(container.querySelector('.ant-input-clear-icon')).not.toBeNull()
  })
})
