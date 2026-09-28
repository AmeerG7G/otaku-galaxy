import { describe, expect, it, vi, beforeEach } from 'vitest'

// جداول antd في jsdom بطيئة، وتزداد بطئاً حين تعمل السويتات متوازية. المهلة
// الافتراضية (٥ ثوانٍ) كانت تُفشل اختباراً يمرّ منفرداً — فشلٌ يتبع الحِمل لا
// الشيفرة.
vi.setConfig({ testTimeout: 20_000 })
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/productsApi', () => ({
  listProducts: vi.fn(),
  patchProductFlags: vi.fn(),
}))

import { listProducts, patchProductFlags } from '../api/productsApi'
import OffersPage from './OffersPage'
import { ApiError } from '../api/client'
import type { Product, ProductListResponse } from '../types/products'

/**
 * شاشة العروض والمختارة.
 *
 * [CRITICAL] كانت «العروض» و«المختارة» تُقرآن من `/catalog/products` العام،
 * وهو يستبعد المنتجات المعطّلة لأنه واجهة المتجر. النتيجة أن منتجاً معطّلاً
 * مرفوعاً كعرض يغيب عن الشاشة التي تديره فلا يمكن إزالته. هذه الاختبارات
 * تثبّت أن الأقسام الثلاثة تنادي مسار الإدارة وحده.
 */

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'منتج',
    description: '',
    nameAr: 'منتج',
    descriptionAr: '',
    nameCkb: 'بەرهەم',
    descriptionCkb: 'وەسف',
    kurdishMissing: false,
    price: 25000,
    stock: 3,
    images: [],
    categoryId: 'c1',
    subcategoryId: null,
    isActive: true,
    isOffer: false,
    isSelected: false,
    rating: null,
    reviewCount: 0,
    previousPrice: null,
    discountPercent: null,
    hasDeliveryPromo: false,
    deliveryPromoAmount: 0,
    restockAt: null,
    franchiseIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Product
}

function listOf(items: Product[]): ProductListResponse {
  return { items, page: 1, limit: 12, total: items.length, hasMore: false }
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <OffersPage />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('تحميل منتجات العروض', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listProducts).mockResolvedValue(
      listOf([product({ id: 'p1', name: 'سيف المجرّة', isOffer: true })]),
    )
    vi.mocked(patchProductFlags).mockResolvedValue({
      product: product(),
      message: 'حُفظ',
    })
  })

  it('قسم «العروض» يُحمَّل من مسار الإدارة بترشيح offer', async () => {
    renderPage()
    await waitFor(() => expect(listProducts).toHaveBeenCalled())
    expect(listProducts).toHaveBeenCalledWith({ page: 1, limit: 12, offer: 'true' })
    expect(await screen.findByText('سيف المجرّة')).toBeInTheDocument()
  })

  it('قسم «المختارة» يرسل ترشيح selected', async () => {
    renderPage()
    await waitFor(() => expect(listProducts).toHaveBeenCalled())
    await userEvent.click(screen.getByText('المختارة'))
    await waitFor(() =>
      expect(listProducts).toHaveBeenCalledWith({ page: 1, limit: 12, selected: 'true' }),
    )
  })

  it('قسم «كل المنتجات» يُحمَّل بلا ترشيح', async () => {
    renderPage()
    await waitFor(() => expect(listProducts).toHaveBeenCalled())
    await userEvent.click(screen.getByText('كل المنتجات'))
    await waitFor(() =>
      expect(listProducts).toHaveBeenCalledWith({ page: 1, limit: 12 }),
    )
  })

  it('[CRITICAL] لا نداء لمسار المتجر العام من شاشة إدارية', async () => {
    renderPage()
    await waitFor(() => expect(listProducts).toHaveBeenCalled())
    await userEvent.click(screen.getByText('المختارة'))
    await waitFor(() => expect(listProducts).toHaveBeenCalledTimes(2))
    for (const call of vi.mocked(listProducts).mock.calls) {
      expect(JSON.stringify(call)).not.toContain('catalog')
    }
  })

  it('القائمة الفارغة تعرض حالة فراغ لا خطأ', async () => {
    vi.mocked(listProducts).mockResolvedValue(listOf([]))
    renderPage()
    expect(
      await screen.findByText(/لا توجد منتجات في هذا القسم/),
    ).toBeInTheDocument()
    expect(screen.queryByText('تعذر تحميل المنتجات')).not.toBeInTheDocument()
  })

  it('[CRITICAL] خطأ الصلاحية يظهر برسالته لا برسالة الشبكة', async () => {
    vi.mocked(listProducts).mockRejectedValue(
      new ApiError('لا تملك صلاحية', 403, 'FORBIDDEN'),
    )
    renderPage()
    expect(await screen.findByText('تعذر تحميل المنتجات')).toBeInTheDocument()
    expect(screen.getByText('لا تملك صلاحية')).toBeInTheDocument()
    expect(screen.queryByText(/تحقق من الشبكة/)).not.toBeInTheDocument()
  })

  it('انقطاع الشبكة وحده يعرض رسالة الشبكة', async () => {
    vi.mocked(listProducts).mockRejectedValue(
      new ApiError('تعذر الاتصال بالخادم — تحقق من الشبكة ثم أعد المحاولة', 0, 'NETWORK'),
    )
    renderPage()
    expect(await screen.findByText(/تحقق من الشبكة/)).toBeInTheDocument()
  })

  it('تكرار التحميل لا يترك القائمة معلّقة', async () => {
    renderPage()
    await waitFor(() => expect(listProducts).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('button', { name: /تحديث/ }))
    await waitFor(() => expect(listProducts).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('سيف المجرّة')).toBeInTheDocument()
  })
})

describe('تبديل العَلَم', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(patchProductFlags).mockResolvedValue({
      product: product(),
      message: 'حُفظ',
    })
  })

  it('[CRITICAL] المنتج المعطّل قابل للتبديل — القيد القديم لم يكن قيداً على الخادم', async () => {
    vi.mocked(listProducts).mockResolvedValue(
      listOf([product({ id: 'p9', name: 'منتج معطّل', isActive: false, isOffer: true })]),
    )
    renderPage()
    await screen.findByText('منتج معطّل')
    await userEvent.click(screen.getByText('كل المنتجات'))

    const switches = await screen.findAllByRole('switch')
    expect(switches[0]).not.toBeDisabled()
    await userEvent.click(switches[0]!)
    await waitFor(() =>
      expect(patchProductFlags).toHaveBeenCalledWith('p9', { isOffer: false }),
    )
  })

  it('[CRITICAL] التبديل يرسل العَلَم وحده بلا صور ولا خيارات', async () => {
    vi.mocked(listProducts).mockResolvedValue(
      listOf([product({ id: 'p3', name: 'منتج', isOffer: true })]),
    )
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /إزالة من العروض/ }))
    await waitFor(() => expect(patchProductFlags).toHaveBeenCalledWith('p3', { isOffer: false }))
    const [, flags] = vi.mocked(patchProductFlags).mock.calls[0]!
    expect(flags).not.toHaveProperty('images')
    expect(flags).not.toHaveProperty('options')
  })
})
