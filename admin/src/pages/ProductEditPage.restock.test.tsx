import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.setConfig({ testTimeout: 20_000 })

// الشبكة وحدها مُحاكاة: `getProductForEdit` و`adminProductToDraft` والنموذج
// و`handleSubmit` تعمل كما هي — المسار الذي فقد التاريخ بعينه.
vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  client: { get: vi.fn(), patch: vi.fn() },
  get: vi.fn(),
}))
vi.mock('../api/categoriesApi', () => ({ listAdminCategories: vi.fn() }))
vi.mock('../api/communityApi', () => ({ listFranchises: vi.fn() }))

import { ApiError, client, get } from '../api/client'
import { listAdminCategories } from '../api/categoriesApi'
import { listFranchises } from '../api/communityApi'
import ProductEditPage from './ProductEditPage'

/**
 * منتجٌ معطّل وموعد توفّره.
 *
 * [CRITICAL] المسار العام يعيد 404 للمنتج المعطّل، فتبني الصفحة مسوّدتها من
 * قائمة الإدارة (`adminProductToDraft`). كانت تلك المسوّدة تُسقط `restockAt`،
 * و`handleSubmit` يرسل `restockAt: values.restockAt ?? null` — فحفظُ أي تعديل
 * على منتجٍ معطّل كان يمسح موعده المحفوظ بصمت. «الأخير يفوز» (CA-15) يعني أن
 * ما **أرسله** المسؤول يُكتب، لا أن يُرسَل `null` عن حقلٍ لم يُحمَّل أصلاً.
 */

const STORED_DATE = '2026-10-15T09:00:00.000Z'

function adminListProduct(restockAt: string | null) {
  return {
    id: 'p1',
    name: 'منتج معطّل',
    description: '',
    price: 1000,
    stock: 0,
    restockAt,
    categoryId: 'c1',
    subcategoryId: null,
    images: [],
    options: [],
    isActive: false,
    isOffer: false,
    isSelected: false,
    rating: null,
    reviewCount: 0,
    previousPrice: null,
    discountPercent: null,
    hasDeliveryPromo: false,
    deliveryPromoAmount: 0,
    franchiseIds: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <MemoryRouter initialEntries={['/products/p1/edit']}>
            <Routes>
              <Route path="/products/:id/edit" element={<ProductEditPage />} />
              <Route path="/products" element={<div>قائمة المنتجات</div>} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

async function saveUnchanged() {
  const user = userEvent.setup()
  renderPage()
  await screen.findByRole('button', { name: 'حفظ التعديلات' })
  await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))
  await waitFor(() => expect(client.patch).toHaveBeenCalledTimes(1))
  const [url, payload] = vi.mocked(client.patch).mock.calls[0]!
  return { url, payload: payload as Record<string, unknown> }
}

describe('ProductEditPage — منتج معطّل: الحفظ لا يمسح موعد التوفر', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAdminCategories).mockResolvedValue({
      items: [{ id: 'c1', name: 'قسم', imageUrl: null, sortOrder: 0, isActive: true, subcategories: [] }],
    } as never)
    vi.mocked(listFranchises).mockResolvedValue({ items: [] } as never)
    // المسار العام لا يعرف المنتج المعطّل.
    vi.mocked(client.get).mockRejectedValue(new ApiError('العنصر المطلوب غير موجود', 404, 'NOT_FOUND'))
    vi.mocked(client.patch).mockResolvedValue({
      data: { success: true, data: {}, message: 'تم' },
    } as never)
  })

  it('[CRITICAL] يرسل الموعد المحفوظ كما هو — لا `null` لم يقصده المسؤول', async () => {
    vi.mocked(get).mockResolvedValue({
      items: [adminListProduct(STORED_DATE)],
      page: 1,
      limit: 50,
      total: 1,
      hasMore: false,
    } as never)

    const { url, payload } = await saveUnchanged()

    expect(url).toBe('/admin/products/p1')
    expect(payload.restockAt).toBe(STORED_DATE)
    // سابقة الخيارات باقية: المعطّل لا تُحمَّل خياراته فلا تُرسَل.
    expect(payload).not.toHaveProperty('options')
  })

  it('منتج معطّل بلا موعد يبقى بلا موعد', async () => {
    vi.mocked(get).mockResolvedValue({
      items: [adminListProduct(null)],
      page: 1,
      limit: 50,
      total: 1,
      hasMore: false,
    } as never)

    const { payload } = await saveUnchanged()

    expect(payload.restockAt).toBeNull()
  })
})
