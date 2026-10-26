import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.setConfig({ testTimeout: 30_000 })

vi.mock('../api/productsApi', () => ({ createProduct: vi.fn() }))
vi.mock('../api/categoriesApi', () => ({ listAdminCategories: vi.fn() }))
vi.mock('../api/communityApi', () => ({ listFranchises: vi.fn() }))

import { createProduct } from '../api/productsApi'
import { listAdminCategories } from '../api/categoriesApi'
import { listFranchises } from '../api/communityApi'
import ProductNewPage from './ProductNewPage'

/**
 * [CRITICAL] «إضافة منتج» يرسل المحتوى بأربعة حقول صريحة (هجرة ٠٦٦).
 *
 * لا `name`/`description`: الخادم يرفضهما صراحةً، والنموذج لا يعرف إلا
 * `nameAr`/`descriptionAr`/`nameCkb`/`descriptionCkb` — كلٌّ من حقله.
 */
function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <MemoryRouter initialEntries={['/products/new?categoryId=c1']}>
            <Routes>
              <Route path="/products/new" element={<ProductNewPage />} />
              <Route path="/products" element={<div>قائمة المنتجات</div>} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('ProductNewPage — المحتوى بلغتين', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAdminCategories).mockResolvedValue({
      items: [{ id: 'c1', name: 'حقائب', imageUrl: null, sortOrder: 0, isActive: true, subcategories: [] }],
    } as never)
    vi.mocked(listFranchises).mockResolvedValue({ items: [] } as never)
    vi.mocked(createProduct).mockResolvedValue({ product: {} as never, message: 'أُضيف المنتج' })
  })

  it('يرسل الحقول الأربعة كلٌّ باسمه — ولا مفتاح `name`/`description`', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('اسم المنتج بالعربي'), 'حقيبة ناروتو')
    await user.type(screen.getByLabelText('وصف المنتج بالعربي'), 'حقيبة أنمي بتصميم ناروتو')
    await user.type(screen.getByLabelText('ناوی بەرهەم بە کوردی'), 'جانتای ناروتۆ')
    await user.type(screen.getByLabelText('وەسفی بەرهەم بە کوردی'), 'جانتایەکی ئەنیمە بە دیزاینی ناروتۆ')
    await user.type(screen.getByLabelText('السعر'), '25000')
    await user.type(screen.getByLabelText('المخزون'), '4')
    await user.click(screen.getByRole('button', { name: 'إضافة المنتج' }))

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(createProduct).mock.calls[0]![0]
    expect(payload).toMatchObject({
      nameAr: 'حقيبة ناروتو',
      descriptionAr: 'حقيبة أنمي بتصميم ناروتو',
      nameCkb: 'جانتای ناروتۆ',
      descriptionCkb: 'جانتایەکی ئەنیمە بە دیزاینی ناروتۆ',
      price: 25000,
      stock: 4,
      categoryId: 'c1',
    })
    expect(payload).not.toHaveProperty('name')
    expect(payload).not.toHaveProperty('description')
  })

  it('لا يُرسَل شيء ما دام حقلٌ من الأربعة فارغاً', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('اسم المنتج بالعربي'), 'حقيبة')
    await user.type(screen.getByLabelText('وصف المنتج بالعربي'), 'وصف')
    await user.type(screen.getByLabelText('ناوی بەرهەم بە کوردی'), 'جانتا')
    await user.type(screen.getByLabelText('السعر'), '1000')
    await user.type(screen.getByLabelText('المخزون'), '1')
    await user.click(screen.getByRole('button', { name: 'إضافة المنتج' }))
    expect(await screen.findByText('وصف المنتج بالكردية مطلوب')).toBeInTheDocument()
    expect(createProduct).not.toHaveBeenCalled()
  })
})
