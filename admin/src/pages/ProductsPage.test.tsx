import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useEffect } from 'react'

// مهلة أوسع لجداول antd في jsdom — انظر `OffersPage.test.tsx`.
vi.setConfig({ testTimeout: 20_000 })
import { act, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/productsApi', () => ({
  listProducts: vi.fn(),
  deleteProduct: vi.fn(),
}))
vi.mock('../api/categoriesApi', () => ({
  listAdminCategories: vi.fn(async () => ({ items: [] })),
}))

import { listProducts } from '../api/productsApi'
import { listAdminCategories } from '../api/categoriesApi'
import ProductsPage from './ProductsPage'
import type { Product, ProductListResponse } from '../types/products'

/**
 * بحث المنتجات بالاسم من اللوحة.
 *
 * ما يُحرس: البحث يذهب إلى الخادم (`q` في المعاملات) بعد سكون الكتابة، ويعيد
 * القائمة إلى الصفحة الأولى، والمخزون يُعرض رقماً لكل منتج.
 */

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'دفتر ناروتو',
    description: '',
    price: 5000,
    stock: 7,
    restockAt: null,
    categoryId: 'c1',
    subcategoryId: null,
    images: [],
    options: [],
    isActive: true,
    isOffer: false,
    isSelected: false,
    rating: null,
    reviewCount: 0,
    previousPrice: null,
    discountPercent: null,
    hasDeliveryPromo: false,
    deliveryPromoAmount: 0,
    franchiseIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function listOf(items: Product[]): ProductListResponse {
  return { items, page: 1, limit: 12, total: items.length, hasMore: false }
}

/**
 * مِجسّ الموقع: يعرض `search` الحالي ويتيح الرجوع/التقدّم ورابط قسمٍ بلا `q`
 * — أي كل ما يغيّر الرابط من **خارج** حقل البحث.
 */
let navigateRef: ReturnType<typeof useNavigate> | null = null
function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  // التقاط `navigate` في أثر لا أثناء العرض — الاختبار يستدعيه من الخارج.
  useEffect(() => {
    navigateRef = navigate
  }, [navigate])
  return (
    <>
      <output data-testid="search">{location.search}</output>
      <Link to="/products?categoryId=c9">قسم</Link>
    </>
  )
}

function renderPage(initialEntry = '/products') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <MemoryRouter initialEntries={[initialEntry]}>
            <ProductsPage />
            <LocationProbe />
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

const searchBox = () => screen.getByLabelText('بحث المنتجات بالاسم')
const urlSearch = () => screen.getByTestId('search').textContent

/** ينتظر أكثر من مهلة السكون (350ms) ليثبت أن **لا** دفعةً متأخّرة تقع. */
const beyondDebounce = () => new Promise((resolve) => setTimeout(resolve, 600))

/** آخر `q` وصل إلى الخادم فعلاً. */
const lastQ = () => vi.mocked(listProducts).mock.calls.at(-1)![0].q

describe('بحث المنتجات', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listProducts).mockResolvedValue(listOf([product()]))
  })

  it('[CRITICAL] الكتابة في حقل البحث تصل الخادم كمعامل q بعد السكون', async () => {
    renderPage()
    await screen.findByText('دفتر ناروتو')
    expect(vi.mocked(listProducts).mock.calls[0][0]).not.toHaveProperty('q')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('بحث المنتجات بالاسم'), 'ناروتو')

    await waitFor(() => {
      const last = vi.mocked(listProducts).mock.calls.at(-1)![0]
      expect(last.q).toBe('ناروتو')
      expect(last.page).toBe(1)
    })
  })

  it('البحث في الرابط يُملأ في الحقل ويُرسل مع أول جلب', async () => {
    renderPage('/products?q=لوفي&page=3')
    await waitFor(() => {
      expect(vi.mocked(listProducts).mock.calls[0][0]).toMatchObject({ q: 'لوفي', page: 3 })
    })
    expect(screen.getByLabelText('بحث المنتجات بالاسم')).toHaveValue('لوفي')
  })

  it('المخزون يُعرض رقماً لكل منتج، ونفاده حالةٌ مميَّزة', async () => {
    vi.mocked(listProducts).mockResolvedValue(
      listOf([product({ id: 'p1', stock: 7 }), product({ id: 'p2', name: 'قلم لوفي', stock: 0 })]),
    )
    renderPage()
    expect(await screen.findByText('متوفر (7)')).toBeInTheDocument()
    expect(screen.getByText('نفدت الكمية')).toBeInTheDocument()
  })

  it('لا نتائج تقول ما بُحث عنه لا «لا منتجات»', async () => {
    vi.mocked(listProducts).mockResolvedValue(listOf([]))
    renderPage('/products?q=غائب')
    expect(await screen.findByText('لا منتج يطابق «غائب»')).toBeInTheDocument()
  })
})

/**
 * الرابط مصدرُ الحقيقة للبحث المُثبَت.
 *
 * [CRITICAL] كان الحقل يحتفظ بقيمته المحلية حين يتغيّر `q` من خارجه (رجوع
 * المتصفّح، رابط قسم، «عرض كل المنتجات»)، ثم تدفعها مهلةُ السكون إلى الرابط
 * من جديد — فيعود بحثٌ قديم ليطمس ما اختاره المستخدم للتوّ. المطلوب: كل
 * تغيّرٍ خارجي في `q` ينعكس على الحقل، ولا دفعةٌ متأخّرة تطمس رابطاً أحدث،
 * ولا يُقاطَع المستخدم أثناء الكتابة.
 */
describe('تزامن حقل البحث مع الرابط', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listProducts).mockResolvedValue(listOf([product()]))
  })

  it('[CRITICAL] رجوع المتصفّح بعد بحثٍ يفرّغ الحقل ولا يُعيد البحث القديم', async () => {
    renderPage()
    await screen.findByText('دفتر ناروتو')
    const user = userEvent.setup()

    await user.type(searchBox(), 'ناروتو')
    await waitFor(() => expect(decodeURIComponent(urlSearch() ?? '')).toContain('q=ناروتو'))
    await waitFor(() => expect(lastQ()).toBe('ناروتو'))

    act(() => navigateRef!(-1))
    await waitFor(() => expect(urlSearch()).toBe(''))
    await waitFor(() => expect(searchBox()).toHaveValue(''))

    // ولا دفعة متأخّرة تُرجع «ناروتو» إلى الرابط أو إلى الخادم.
    await beyondDebounce()
    expect(urlSearch()).toBe('')
    expect(lastQ()).toBeUndefined()
  })

  it('التقدّم بعد الرجوع يعيد البحث إلى الحقل', async () => {
    renderPage()
    await screen.findByText('دفتر ناروتو')
    const user = userEvent.setup()
    await user.type(searchBox(), 'لوفي')
    await waitFor(() => expect(lastQ()).toBe('لوفي'))

    act(() => navigateRef!(-1))
    await waitFor(() => expect(searchBox()).toHaveValue(''))
    act(() => navigateRef!(1))
    await waitFor(() => expect(searchBox()).toHaveValue('لوفي'))
    await waitFor(() => expect(lastQ()).toBe('لوفي'))
  })

  it('[CRITICAL] رابط قسمٍ بلا q يفرّغ الحقل ولا يُنعش البحث القديم', async () => {
    renderPage('/products?q=زورو')
    await waitFor(() => expect(lastQ()).toBe('زورو'))
    expect(searchBox()).toHaveValue('زورو')

    const user = userEvent.setup()
    await user.click(screen.getByText('قسم'))
    await waitFor(() => expect(urlSearch()).toBe('?categoryId=c9'))
    await waitFor(() => expect(searchBox()).toHaveValue(''))

    await beyondDebounce()
    expect(urlSearch()).toBe('?categoryId=c9')
    expect(lastQ()).toBeUndefined()
    expect(vi.mocked(listProducts).mock.calls.at(-1)![0].categoryId).toBe('c9')
  })

  it('«عرض كل المنتجات» يمسح q من الرابط ومن الحقل معاً', async () => {
    // الزرّ يظهر حين يُعرف اسم القسم المُرشَّح.
    vi.mocked(listAdminCategories).mockResolvedValue({
      items: [{ id: 'c9', name: 'أقلام', subcategories: [] }],
    } as never)
    renderPage('/products?q=سانجي&categoryId=c9')
    await waitFor(() => expect(lastQ()).toBe('سانجي'))
    const user = userEvent.setup()
    await user.click(await screen.findByText('عرض كل المنتجات'))
    await waitFor(() => expect(urlSearch()).toBe(''))
    await waitFor(() => expect(searchBox()).toHaveValue(''))
    await beyondDebounce()
    expect(urlSearch()).toBe('')
  })

  it('[CRITICAL] دفعةٌ عالقة لا تطمس رابطاً تغيّر من خارجها أثناء السكون', async () => {
    renderPage()
    await screen.findByText('دفتر ناروتو')
    const user = userEvent.setup()

    // كتابةٌ جزئية ثم تغيّرٌ خارجي قبل انقضاء مهلة السكون.
    await user.type(searchBox(), 'نار')
    act(() => navigateRef!('/products?q=روبين'))

    await waitFor(() => expect(searchBox()).toHaveValue('روبين'))
    await beyondDebounce()
    expect(decodeURIComponent(urlSearch() ?? '')).toBe('?q=روبين')
    await waitFor(() => expect(lastQ()).toBe('روبين'))
    // «نار» لم يصل الخادم قطّ.
    expect(vi.mocked(listProducts).mock.calls.some((c) => c[0].q === 'نار')).toBe(false)
  })

  it('الكتابة لا تُقاطَع: دفعة الحقل نفسها لا تُعيد ضبطه', async () => {
    renderPage()
    await screen.findByText('دفتر ناروتو')
    const user = userEvent.setup()
    await user.type(searchBox(), 'ناروتو')
    await waitFor(() => expect(lastQ()).toBe('ناروتو'))
    // بعد أن عاد صدى الدفعة من الرابط، يواصل المستخدم الكتابة بلا فقدان.
    await user.type(searchBox(), ' شيبودن')
    expect(searchBox()).toHaveValue('ناروتو شيبودن')
    await waitFor(() => expect(lastQ()).toBe('ناروتو شيبودن'))
    expect(searchBox()).toHaveValue('ناروتو شيبودن')
  })
})
