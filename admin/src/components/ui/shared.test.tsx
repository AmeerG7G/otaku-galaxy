import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../api/adminAccountsApi', () => ({ fetchAdminMe: vi.fn() }))

import { fetchAdminMe } from '../../api/adminAccountsApi'
import { useAuthStore } from '../../stores/authStore'
import { DESKTOP, PHONE, setViewportWidth } from '../../test/viewport'
import { ProductLink } from './ProductLink'
import { ResponsiveTable } from './ResponsiveTable'
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
