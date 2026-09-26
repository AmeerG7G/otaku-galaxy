import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.setConfig({ testTimeout: 20_000 })

vi.mock('../api/productsApi', () => ({
  getProductForEdit: vi.fn(),
  updateProduct: vi.fn(),
}))
vi.mock('../api/categoriesApi', () => ({ listAdminCategories: vi.fn() }))
vi.mock('../api/communityApi', () => ({ listFranchises: vi.fn() }))

import { getProductForEdit, updateProduct } from '../api/productsApi'
import { listAdminCategories } from '../api/categoriesApi'
import { listFranchises } from '../api/communityApi'
import ProductEditPage from './ProductEditPage'

/**
 * صفحة تعديل المنتج — عقد `PATCH /admin/products/:id`.
 *
 * [CRITICAL] الحقل الغائب عن الطلب **لا يُمسّ** على الخادم
 * (`adminProductUpdateSchema`: كل حقل اختياري بلا افتراضي). المنتج المعطّل
 * لا يوفّر الخادمُ خياراته للوحة (المسار العام يعيد 404 والقائمة الإدارية
 * بلا خيارات)، وكانت الصفحة ترسل `options: []` صراحةً — فتمسح الخيارات
 * المحفوظة عن منتجٍ أراد المسؤول تفعيله فقط، خلف نافذة تأكيد تبرّر المسح
 * بخللٍ في الخادم زال منذ زمن. الصحيح: لا يُرسَل الحقل أصلاً فيبقى ما في
 * القاعدة كما هو.
 */

const draft = {
  name: 'منتج معطّل',
  description: '',
  price: 1000,
  stock: 3,
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
  hasDeliveryPromo: false,
  deliveryPromoAmount: 0,
  franchiseIds: [],
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

describe('ProductEditPage — منتج معطّل بلا خيارات محمَّلة', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAdminCategories).mockResolvedValue({
      items: [{ id: 'c1', name: 'قسم', imageUrl: null, sortOrder: 0, isActive: true, subcategories: [] }],
    } as never)
    vi.mocked(listFranchises).mockResolvedValue({ items: [] } as never)
    vi.mocked(getProductForEdit).mockResolvedValue({ draft, optionsLoaded: false })
    vi.mocked(updateProduct).mockResolvedValue({ product: {} as never, message: 'تم' })
  })

  it('[CRITICAL] الحفظ لا يرسل `options` إطلاقاً — فتبقى الخيارات المحفوظة كما هي', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('button', { name: 'حفظ التعديلات' })
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(updateProduct).mock.calls[0]![1]
    expect(payload).not.toHaveProperty('options')
    // بقية الحقول تُرسَل كالمعتاد.
    expect(payload).toMatchObject({ name: 'منتج معطّل', price: 1000, stock: 3, isActive: false })
    // ولا نافذة تأكيدٍ تصف مسحاً لن يحدث.
    expect(screen.queryByText(/سيُمسح/)).not.toBeInTheDocument()
  })

  it('المنتج النشط (خياراته محمَّلة) يرسل `options` كما هي في النموذج', async () => {
    vi.mocked(getProductForEdit).mockResolvedValue({
      draft: { ...draft, isActive: true, options: [{ name: 'اللون', values: ['أحمر'] }] },
      optionsLoaded: true,
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('button', { name: 'حفظ التعديلات' })
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(updateProduct).mock.calls[0]![1]
    expect(payload.options).toEqual([{ name: 'اللون', values: ['أحمر'] }])
  })
})
