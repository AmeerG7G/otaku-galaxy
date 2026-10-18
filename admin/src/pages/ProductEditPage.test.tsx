import { useEffect } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'

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
import { ApiError } from '../api/client'
import { createQueryClient } from '../queryClient'

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
  nameAr: 'منتج معطّل',
  descriptionAr: 'وصف عربي',
  nameCkb: 'بەرهەمی ناچالاک',
  descriptionCkb: 'وەسفی کوردی',
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
    // بقية الحقول تُرسَل كالمعتاد — عدا المخزون الذي لم يُغيَّر (انظر
    // «المخزون لا يُعاد إرساله» أدناه).
    expect(payload).toMatchObject({ nameAr: 'منتج معطّل', price: 1000, isActive: false })
    expect(payload).not.toHaveProperty('stock')
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

/**
 * [CRITICAL] التعديل يحفظ كل لغة في حقليها وحدهما.
 *
 * كانت الصفحة تقرأ `name`/`description` من المسار العام — محسومَين بلغة
 * الطلب — فمتصفّحٌ كردي كان سيضع الكردية في حقل العربية ويكتبها الحفظ في
 * العمود العربي. المسودّة الآن من الحقول الصريحة (`nameAr`…`descriptionCkb`).
 */
describe('ProductEditPage — المحتوى بلغتين', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAdminCategories).mockResolvedValue({
      items: [{ id: 'c1', name: 'قسم', imageUrl: null, sortOrder: 0, isActive: true, subcategories: [] }],
    } as never)
    vi.mocked(listFranchises).mockResolvedValue({ items: [] } as never)
    vi.mocked(updateProduct).mockResolvedValue({ product: {} as never, message: 'تم' })
  })

  it('كل لغة تُحمَّل في حقليها', async () => {
    vi.mocked(getProductForEdit).mockResolvedValue({ draft: { ...draft, isActive: true }, optionsLoaded: true })
    renderPage()
    expect(await screen.findByLabelText('اسم المنتج بالعربي')).toHaveValue('منتج معطّل')
    expect(screen.getByLabelText('وصف المنتج بالعربي')).toHaveValue('وصف عربي')
    expect(screen.getByLabelText('ناوی بەرهەم بە کوردی')).toHaveValue('بەرهەمی ناچالاک')
    expect(screen.getByLabelText('وەسفی بەرهەم بە کوردی')).toHaveValue('وەسفی کوردی')
  })

  it('[CRITICAL] تعديل الكردية وحدها يرسلها ويترك العربية كما حُمِّلت', async () => {
    vi.mocked(getProductForEdit).mockResolvedValue({ draft: { ...draft, isActive: true }, optionsLoaded: true })
    const user = userEvent.setup()
    renderPage()
    const kurdishName = await screen.findByLabelText('ناوی بەرهەم بە کوردی')
    await user.clear(kurdishName)
    await user.type(kurdishName, 'ناوی نوێ')
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateProduct).mock.calls[0]![1]).toMatchObject({
      nameAr: 'منتج معطّل',
      descriptionAr: 'وصف عربي',
      nameCkb: 'ناوی نوێ',
      descriptionCkb: 'وەسفی کوردی',
    })
  })

  it('[CRITICAL] تعديل العربية وحدها لا يمسّ الكردية', async () => {
    vi.mocked(getProductForEdit).mockResolvedValue({ draft: { ...draft, isActive: true }, optionsLoaded: true })
    const user = userEvent.setup()
    renderPage()
    const arabicName = await screen.findByLabelText('اسم المنتج بالعربي')
    await user.clear(arabicName)
    await user.type(arabicName, 'اسم عربي جديد')
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateProduct).mock.calls[0]![1]).toMatchObject({
      nameAr: 'اسم عربي جديد',
      nameCkb: 'بەرهەمی ناچالاک',
      descriptionCkb: 'وەسفی کوردی',
    })
  })

  it('منتجٌ قديم بلا كردية: الحفظ لا يرسل حقلاً كردياً فارغاً — يبقى «ناقصاً» على الخادم', async () => {
    vi.mocked(getProductForEdit).mockResolvedValue({
      draft: { ...draft, isActive: true, nameCkb: '', descriptionCkb: '' },
      optionsLoaded: true,
    })
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('الكردية ناقصة لهذا المنتج')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(updateProduct).mock.calls[0]![1]
    expect(payload).not.toHaveProperty('nameCkb')
    expect(payload).not.toHaveProperty('descriptionCkb')
    expect(payload).toMatchObject({ nameAr: 'منتج معطّل' })
  })
})

/**
 * [CRITICAL] المخزون لا يُعاد إرساله من قيمةٍ قديمة.
 *
 * كانت الصفحة ترسل `stock` في كل حفظ بالقيمة التي فُتحت عليها، والخادم
 * يكتبها قيمةً مطلقة. قبولُ طلبٍ بين فتح الصفحة وحفظها (يُنزّل المخزون) كان
 * يُمحى بحفظِ تعديلٍ لا علاقة له بالمخزون، فتعود القطع المستهلكة إلى البيع.
 * الآن: المخزون غير المعدَّل لا يُرسَل، والمعدَّل يُرسَل مع `expectedStock`
 * ليرفض الخادم بـ`STOCK_CHANGED` إن تغيّر منذ الفتح.
 */
describe('ProductEditPage — المخزون والقيمة التي فُتحت عليها الصفحة', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAdminCategories).mockResolvedValue({
      items: [{ id: 'c1', name: 'قسم', imageUrl: null, sortOrder: 0, isActive: true, subcategories: [] }],
    } as never)
    vi.mocked(listFranchises).mockResolvedValue({ items: [] } as never)
    vi.mocked(getProductForEdit).mockResolvedValue({ draft: { ...draft, isActive: true }, optionsLoaded: true })
    vi.mocked(updateProduct).mockResolvedValue({ product: {} as never, message: 'تم' })
  })

  it('حفظٌ لا يغيّر المخزون لا يرسل `stock` ولا `expectedStock`', async () => {
    const user = userEvent.setup()
    renderPage()
    const arabicName = await screen.findByLabelText('اسم المنتج بالعربي')
    await user.clear(arabicName)
    await user.type(arabicName, 'وصف مصحَّح')
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(updateProduct).mock.calls[0]![1]
    expect(payload).not.toHaveProperty('stock')
    expect(payload).not.toHaveProperty('expectedStock')
    expect(payload).toMatchObject({ nameAr: 'وصف مصحَّح' })
  })

  it('تغيير المخزون يرسل القيمة الجديدة مع المخزون الذي فُتحت عليه الصفحة', async () => {
    const user = userEvent.setup()
    renderPage()
    const stock = await screen.findByLabelText('المخزون')
    await user.clear(stock)
    await user.type(stock, '7')
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateProduct).mock.calls[0]![1]).toMatchObject({ stock: 7, expectedStock: 3 })
  })
})

/**
 * [CRITICAL] الحقل الذي يراه المسؤول و`expectedStock` الذي يُرسَل لا يفترقان.
 *
 * النموذج يقرأ قيمه مرةً عند التركيب، وكانت المقارنة تُؤخذ من الاستعلام الحيّ.
 * فتحديثٌ في الخلفية — عودة الاتصال، أو فتح المنتج من جديد على نسخةٍ مخبّأة ثم
 * جلبها — كان يقدّم `expectedStock` إلى قيمة الخادم والحقلُ على القديمة، فيقبل
 * الخادم ويكتب القديمة: قطعٌ مستهلكة تعود إلى البيع، أو تخزينٌ حفظه المسؤول
 * نفسه قبل دقيقة يُمحى. هنا بعميل التطبيق الحقيقي (`createQueryClient`).
 */
describe('ProductEditPage — حقل المخزون والمقارنة لا يفترقان (عميل التطبيق)', () => {
  let server = { ...draft, isActive: true, stock: 5 }
  let navigateTo: (path: string) => void = () => {}
  function NavigationHandle() {
    const navigate = useNavigate()
    useEffect(() => {
      navigateTo = navigate
    }, [navigate])
    return null
  }

  function mount() {
    const queryClient = createQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider direction="rtl">
          <AntApp>
            <MemoryRouter initialEntries={['/products/p1/edit']}>
              <NavigationHandle />
              <Routes>
                <Route path="/products/:id/edit" element={<ProductEditPage />} />
                <Route path="/products" element={<div>قائمة المنتجات</div>} />
              </Routes>
            </MemoryRouter>
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    )
    return queryClient
  }
  const stockField = () => screen.getByLabelText('المخزون') as HTMLInputElement
  const save = () => userEvent.setup().click(screen.getByRole('button', { name: 'حفظ التعديلات' }))
  const lastPayload = () => vi.mocked(updateProduct).mock.calls.at(-1)![1]

  beforeEach(() => {
    vi.clearAllMocks()
    server = { ...draft, isActive: true, stock: 5 }
    vi.mocked(listAdminCategories).mockResolvedValue({
      items: [{ id: 'c1', name: 'قسم', imageUrl: null, sortOrder: 0, isActive: true, subcategories: [] }],
    } as never)
    vi.mocked(listFranchises).mockResolvedValue({ items: [] } as never)
    vi.mocked(getProductForEdit).mockImplementation(async () => ({ draft: { ...server }, optionsLoaded: true }))
    vi.mocked(updateProduct).mockImplementation(async (_id, payload) => {
      if (payload.expectedStock !== undefined && payload.expectedStock !== server.stock) {
        throw new ApiError(`المخزون تغيّر منذ فتح الصفحة (الحالي: ${server.stock})`, 409, 'STOCK_CHANGED')
      }
      if (payload.stock !== undefined) server = { ...server, stock: payload.stock }
      return { product: {} as never, message: 'تم' }
    })
  })

  it('عودة الاتصال لا تقدّم المقارنة: تغييرُ مخزونٍ قديم يُرفض بـSTOCK_CHANGED', async () => {
    mount()
    await screen.findByLabelText('المخزون')
    server = { ...server, stock: 3 } // قُبل طلبٌ في تبويبٍ آخر
    await act(async () => onlineManager.setOnline(false))
    await act(async () => onlineManager.setOnline(true))
    await userEvent.setup().clear(stockField())
    await userEvent.setup().type(stockField(), '6')
    await save()

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    expect(lastPayload()).toMatchObject({ stock: 6, expectedStock: 5 })
    expect(server.stock).toBe(3)
  })

  it('بعد STOCK_CHANGED يعرض الحقل المخزون الحالي، والحفظ التالي يقارن به', async () => {
    mount()
    await screen.findByLabelText('المخزون')
    server = { ...server, stock: 3 }
    await userEvent.setup().clear(stockField())
    await userEvent.setup().type(stockField(), '8')
    await save()
    await waitFor(() => expect(stockField()).toHaveValue('3'))
    expect(server.stock).toBe(3)

    // يقرّر من جديد على القيمة التي يراها.
    await userEvent.setup().clear(stockField())
    await userEvent.setup().type(stockField(), '6')
    await save()
    await screen.findByText('قائمة المنتجات')
    expect(lastPayload()).toMatchObject({ stock: 6, expectedStock: 3 })
    expect(server.stock).toBe(6)
  })

  it('[CRITICAL] فتح المنتج من جديد بعد قبول طلب: الحقل من الخادم، والحفظ لا يُرجع القطع', async () => {
    mount()
    await screen.findByLabelText('المخزون')
    await act(async () => navigateTo('/products'))
    server = { ...server, stock: 3 }
    await act(async () => navigateTo('/products/p1/edit'))
    await waitFor(() => expect(stockField()).toHaveValue('3'))
    await save()

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    expect(lastPayload()).not.toHaveProperty('stock')
    expect(server.stock).toBe(3)
  })

  it('[CRITICAL] فتح المنتج بعد حفظه: لا يُمحى التخزين الذي حفظه المسؤول للتو', async () => {
    mount()
    await screen.findByLabelText('المخزون')
    await userEvent.setup().clear(stockField())
    await userEvent.setup().type(stockField(), '8')
    await save()
    await screen.findByText('قائمة المنتجات')
    expect(server.stock).toBe(8)

    await act(async () => navigateTo('/products/p1/edit'))
    await waitFor(() => expect(stockField()).toHaveValue('8'))
    await save()
    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(2))
    expect(lastPayload()).not.toHaveProperty('stock')
    expect(server.stock).toBe(8)
  })
})
