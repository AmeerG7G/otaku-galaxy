import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.setConfig({ testTimeout: 40_000 })

vi.mock('../api/productsApi', () => ({
  createProduct: vi.fn(),
  getProductForEdit: vi.fn(),
  updateProduct: vi.fn(),
}))
vi.mock('../api/categoriesApi', () => ({ listAdminCategories: vi.fn() }))
vi.mock('../api/communityApi', () => ({ listFranchises: vi.fn() }))
vi.mock('../api/uploadsApi', () => ({ uploadImage: vi.fn() }))

import { createProduct, getProductForEdit, updateProduct } from '../api/productsApi'
import { listAdminCategories } from '../api/categoriesApi'
import { listFranchises } from '../api/communityApi'
import { uploadImage } from '../api/uploadsApi'
import { ApiError } from '../api/client'
import ProductNewPage from './ProductNewPage'
import ProductEditPage from './ProductEditPage'
import type { ProductFormDraft } from '../types/products'

/**
 * ألوان المنتج في اللوحة (STEP 74، العقد §5).
 *
 * [CRITICAL] لكل لونٍ صورته ومخزونه؛ المنتج الملوَّن لا يُرسَل مخزونه
 * (`STOCK_PER_VARIANT`)، والتعديل يرسل الألوان فقط إن تغيّرت — كاملةً مع
 * `id` و`expectedStock` لكل لونٍ قائم.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const pick = (name = 'c.png') => new File([PNG], name, { type: 'image/png' })

function shell(path: string, element: React.ReactNode, route: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider direction="rtl" theme={{ token: { motion: false } }}>
        <AntApp>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path={route} element={element} />
              <Route path="/products" element={<div>قائمة المنتجات</div>} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

const rows = () => screen.getAllByTestId('variant-row')
const row = (index: number) => within(rows()[index]!)
const fileInputOf = (index: number) =>
  rows()[index]!.querySelector('input[type="file"]') as HTMLInputElement

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listAdminCategories).mockResolvedValue({
    items: [{ id: 'c1', name: 'قسم', imageUrl: null, sortOrder: 0, isActive: true, subcategories: [] }],
  } as never)
  vi.mocked(listFranchises).mockResolvedValue({ items: [] } as never)
  vi.mocked(createProduct).mockResolvedValue({ product: {} as never, message: 'أُضيف المنتج' })
  vi.mocked(updateProduct).mockResolvedValue({ product: {} as never, message: 'تم' })
})

/** لصقٌ بدل الكتابة حرفاً حرفاً — الكتابة تحت حمل المجموعة كاملة تتجاوز المهلة. */
async function put(user: ReturnType<typeof userEvent.setup>, input: HTMLElement, text: string) {
  await user.click(input)
  await user.paste(text)
}

async function fillColor(
  user: ReturnType<typeof userEvent.setup>,
  index: number,
  { name, hex, image, stock }: { name: string; hex?: string; image?: string; stock: string },
) {
  await put(user, row(index).getByLabelText('اسم اللون بالعربي'), name)
  if (hex) await put(user, row(index).getByLabelText(`رمز اللون ${index + 1}`), hex)
  if (image) await put(user, row(index).getByLabelText(`رابط صورة اللون ${index + 1}`), image)
  await put(user, row(index).getByLabelText('مخزون اللون'), stock)
}

describe('ProductNewPage — إنشاء منتجٍ بألوان', () => {
  const renderNew = () => shell('/products/new?categoryId=c1', <ProductNewPage />, '/products/new')

  async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
    await put(user, await screen.findByLabelText('اسم المنتج بالعربي'), 'تيشيرت ناروتو')
    await put(user, screen.getByLabelText('وصف المنتج بالعربي'), 'قطن')
    await put(user, screen.getByLabelText('السعر'), '15000')
  }

  it('[CRITICAL] يرسل الألوان بترتيبها ولا يرسل `stock` — والمخزون الكلّي مجموع الألوان', async () => {
    vi.mocked(uploadImage).mockResolvedValue('/uploads/product/2026/10/blue.png')
    const user = userEvent.setup()
    renderNew()
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: /إضافة لون/ }))
    await user.click(screen.getByRole('button', { name: /إضافة لون/ }))
    expect(rows()).toHaveLength(2)
    // حقل مخزون المنتج يختفي ويظهر المجموع للقراءة.
    expect(screen.queryByLabelText('المخزون')).not.toBeVisible()

    await fillColor(user, 0, { name: 'أحمر', hex: '#ff0000', image: '/uploads/product/2026/10/red.png', stock: '3' })
    await fillColor(user, 1, { name: 'أزرق', stock: '4' })
    await put(user, row(1).getByLabelText('اسم اللون بالكردية (اختياري)'), 'شین')
    await user.upload(fileInputOf(1), pick())
    await waitFor(() =>
      expect(row(1).getByLabelText('رابط صورة اللون 2')).toHaveValue('/uploads/product/2026/10/blue.png'),
    )
    expect(uploadImage).toHaveBeenCalledWith(expect.any(File), 'product')
    expect(screen.getByLabelText('المخزون الكلّي')).toHaveValue('7')

    await user.click(screen.getByRole('button', { name: 'إضافة المنتج' }))
    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(createProduct).mock.calls[0]![0]
    expect(payload).not.toHaveProperty('stock')
    expect(payload.variants).toEqual([
      { colorName: 'أحمر', colorNameCkb: null, colorHex: '#FF0000', imageUrl: '/uploads/product/2026/10/red.png', stock: 3, isActive: true },
      { colorName: 'أزرق', colorNameCkb: 'شین', colorHex: null, imageUrl: '/uploads/product/2026/10/blue.png', stock: 4, isActive: true },
    ])
  })

  it('نوع الخيارات (090): الافتراضي لون، و«تصميم» يُرسَل ويسمّي البطاقة', async () => {
    const user = userEvent.setup()
    renderNew()
    await fillBasics(user)
    expect(within(screen.getByTestId('variants-card')).getByText('الألوان')).toBeTruthy()

    await user.click(screen.getByLabelText('ماذا تمثّل هذه الخيارات للزبون؟'))
    await user.click(await screen.findByTitle('تصميم'))
    await waitFor(() =>
      expect(within(screen.getByTestId('variants-card')).getByText('التصميمات')).toBeTruthy(),
    )

    await user.click(screen.getByRole('button', { name: /إضافة لون/ }))
    await fillColor(user, 0, { name: 'سوكونا', image: '/uploads/product/2026/10/sukuna.png', stock: '2' })
    await user.click(screen.getByRole('button', { name: 'إضافة المنتج' }))
    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createProduct).mock.calls[0]![0]).toMatchObject({ variantKind: 'design' })
  })

  it('منتجٌ بلا ألوان يرسل `stock` كما كان ولا يرسل `variants`', async () => {
    const user = userEvent.setup()
    renderNew()
    await fillBasics(user)
    await user.type(screen.getByLabelText('المخزون'), '5')
    await user.click(screen.getByRole('button', { name: 'إضافة المنتج' }))
    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(createProduct).mock.calls[0]![0]
    expect(payload).toMatchObject({ stock: 5, variantKind: 'color' })
    expect(payload).not.toHaveProperty('variants')
  })

  it('التحقّق في النموذج: اسمٌ مكرّر، رمزٌ غير صالح، صورةٌ ناقصة — لا يُرسَل شيء', async () => {
    const user = userEvent.setup()
    renderNew()
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: /إضافة لون/ }))
    await user.click(screen.getByRole('button', { name: /إضافة لون/ }))
    await fillColor(user, 0, { name: 'أحمر', hex: 'red', image: '/uploads/product/a.png', stock: '1' })
    await fillColor(user, 1, { name: ' أحمر ', stock: '1' })
    await user.click(screen.getByRole('button', { name: 'إضافة المنتج' }))

    const visible = (text: string) =>
      screen.queryAllByText(text).filter((el) => !el.closest('.ant-form-show-help-item-leave'))
    await waitFor(() => expect(visible('اسم اللون مكرّر في هذا المنتج').length).toBeGreaterThan(0))
    expect(visible('رمز اللون بالصيغة ‎#RRGGBB‎ (مثال: ‎#FF0000‎)').length).toBeGreaterThan(0)
    expect(visible('صورة اللون مطلوبة').length).toBeGreaterThan(0)
    expect(createProduct).not.toHaveBeenCalled()
  })

  it('اسم اللون مطلوب', async () => {
    const user = userEvent.setup()
    renderNew()
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: /إضافة لون/ }))
    await put(user, row(0).getByLabelText(`رابط صورة اللون 1`), '/uploads/product/a.png')
    await user.type(row(0).getByLabelText('مخزون اللون'), '1')
    await user.click(screen.getByRole('button', { name: 'إضافة المنتج' }))
    expect((await screen.findAllByText('اسم اللون مطلوب')).length).toBeGreaterThan(0)
    expect(createProduct).not.toHaveBeenCalled()
  })

  it('PRODUCT_HAS_OPEN_ORDERS / رموز الألوان تظهر شرحاً ثابتاً فوق زرّ الحفظ', async () => {
    vi.mocked(createProduct).mockRejectedValue(
      new ApiError('اسم اللون مكرّر', 400, 'DUPLICATE_VARIANT_COLOR'),
    )
    const user = userEvent.setup()
    renderNew()
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: /إضافة لون/ }))
    await fillColor(user, 0, { name: 'أحمر', image: '/uploads/product/a.png', stock: '1' })
    await user.click(screen.getByRole('button', { name: 'إضافة المنتج' }))
    const alert = await screen.findByTestId('product-submit-error')
    expect(alert).toHaveTextContent('اسم لونٍ مكرّر')
  })
})

const variantDraft: ProductFormDraft = {
  nameAr: 'تيشيرت',
  descriptionAr: 'قطن',
  nameCkb: '',
  descriptionCkb: '',
  price: 15000,
  pairPrice: null,
  stock: 7,
  categoryId: 'c1',
  subcategoryId: null,
  images: [],
  options: [],
  variants: [
    { id: 'v-red', colorName: 'أحمر', colorNameCkb: 'سوور', colorHex: '#FF0000', imageUrl: '/uploads/product/red.png', stock: 3, isActive: true },
    { id: 'v-blue', colorName: 'أزرق', colorNameCkb: null, colorHex: null, imageUrl: '/uploads/product/blue.png', stock: 4, isActive: true },
  ],
  isActive: true,
  isOffer: false,
  isSelected: false,
  rating: null,
  reviewCount: 0,
  previousPrice: null,
  hasDeliveryPromo: false,
  deliveryPromoAmount: 0,
  franchiseIds: [],
  restockAt: null,
}

describe('ProductEditPage — تعديل الألوان', () => {
  const renderEdit = () => shell('/products/p1/edit', <ProductEditPage />, '/products/:id/edit')
  const save = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))
  const lastPayload = () => vi.mocked(updateProduct).mock.calls.at(-1)![1]

  beforeEach(() => {
    vi.mocked(getProductForEdit).mockResolvedValue({ draft: structuredClone(variantDraft), optionsLoaded: true })
  })

  it('يعرض الألوان بمخزونها الحالي، ومخزون المنتج مجموعها للقراءة فقط', async () => {
    renderEdit()
    await screen.findByRole('button', { name: 'حفظ التعديلات' })
    expect(rows()).toHaveLength(2)
    expect(row(0).getByText('المخزون الحالي: 3')).toBeInTheDocument()
    expect(row(1).getByText('المخزون الحالي: 4')).toBeInTheDocument()
    expect(row(0).getByLabelText('اسم اللون بالعربي')).toHaveValue('أحمر')
    expect(row(0).getByLabelText('اسم اللون بالكردية (اختياري)')).toHaveValue('سوور')
    expect(screen.getByLabelText('المخزون الكلّي')).toHaveValue('7')
  })

  it('معاينة المعرض: صور الألوان ثم العامة، والمكرّرة تُذكر ولا تُحذف', async () => {
    vi.mocked(getProductForEdit).mockResolvedValue({
      draft: { ...structuredClone(variantDraft), images: ['/uploads/product/front.png', '/uploads/product/blue.png'] },
      optionsLoaded: true,
    })
    renderEdit()
    await screen.findByRole('button', { name: 'حفظ التعديلات' })
    const preview = within(screen.getByTestId('gallery-preview'))
    const items = preview.getAllByTestId('gallery-preview-item')
    expect(items.map((item) => item.textContent)).toEqual(['1اللون: أحمر', '2اللون: أزرق', '3صورة عامة'])
    expect(preview.getByTestId('gallery-preview-duplicate')).toHaveTextContent('الصورة العامة 2 هي نفسها صورة اللون «أزرق»')
  })

  it('[CRITICAL] الحفظ يحفظ الصور العامة كما هي — المكرّرة لا تُحذف تلقائياً، والألوان لا تُرسَل', async () => {
    vi.mocked(getProductForEdit).mockResolvedValue({
      draft: { ...structuredClone(variantDraft), images: ['/uploads/product/front.png', '/uploads/product/blue.png'] },
      optionsLoaded: true,
    })
    const user = userEvent.setup()
    renderEdit()
    await screen.findByRole('button', { name: 'حفظ التعديلات' })
    await save(user)
    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    expect(lastPayload().images).toEqual(['/uploads/product/front.png', '/uploads/product/blue.png'])
    expect(lastPayload()).not.toHaveProperty('variants')
  })

  it('معاينة المعرض تتبع الألوان: إيقاف لونٍ يخرج صورته، وإعادة الترتيب ترتّبها', async () => {
    const user = userEvent.setup()
    renderEdit()
    await screen.findByRole('button', { name: 'حفظ التعديلات' })
    const preview = () => within(screen.getByTestId('gallery-preview'))
    await user.click(row(1).getByRole('button', { name: 'نقل اللون للأعلى' }))
    expect(preview().getAllByTestId('gallery-preview-item').map((item) => item.textContent)).toEqual(['1اللون: أزرق', '2اللون: أحمر'])
    await user.click(row(1).getByRole('switch'))
    expect(preview().getAllByTestId('gallery-preview-item').map((item) => item.textContent)).toEqual(['1اللون: أزرق'])
    expect(preview().getByTestId('gallery-preview-inactive')).toHaveTextContent('(1)')
  })

  it('[CRITICAL] حفظٌ لا يمسّ الألوان لا يرسل `variants` ولا `stock`', async () => {
    const user = userEvent.setup()
    renderEdit()
    const name = await screen.findByLabelText('اسم المنتج بالعربي')
    await user.clear(name)
    await put(user, name, 'تيشيرت جديد')
    await save(user)
    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    expect(lastPayload()).not.toHaveProperty('variants')
    expect(lastPayload()).not.toHaveProperty('stock')
    expect(lastPayload()).toMatchObject({ nameAr: 'تيشيرت جديد' })
  })

  it('[CRITICAL] تعديل لونٍ واحد يرسل القائمة كاملة — الآخر كما هو، ولكلٍّ `id` و`expectedStock`', async () => {
    const user = userEvent.setup()
    renderEdit()
    await screen.findByRole('button', { name: 'حفظ التعديلات' })
    const blueStock = row(1).getByLabelText('مخزون اللون')
    await user.clear(blueStock)
    await user.type(blueStock, '9')
    expect(screen.getByLabelText('المخزون الكلّي')).toHaveValue('12')
    await save(user)

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    expect(lastPayload()).not.toHaveProperty('stock')
    expect(lastPayload().variants).toEqual([
      { id: 'v-red', colorName: 'أحمر', colorNameCkb: 'سوور', colorHex: '#FF0000', imageUrl: '/uploads/product/red.png', stock: 3, expectedStock: 3, isActive: true },
      { id: 'v-blue', colorName: 'أزرق', colorNameCkb: null, colorHex: null, imageUrl: '/uploads/product/blue.png', stock: 9, expectedStock: 4, isActive: true },
    ])
  })

  it('إعادة الترتيب وحذف لونٍ وإضافة لون: الترتيب الظاهر هو المرسَل، والجديد بلا `id`', async () => {
    const user = userEvent.setup()
    renderEdit()
    await screen.findByRole('button', { name: 'حفظ التعديلات' })
    await user.click(row(1).getByRole('button', { name: 'نقل اللون للأعلى' }))
    expect(row(0).getByLabelText('اسم اللون بالعربي')).toHaveValue('أزرق')
    await user.click(row(1).getByRole('button', { name: 'حذف اللون' }))
    await user.click(screen.getByRole('button', { name: /إضافة لون/ }))
    await fillColor(user, 1, { name: 'أخضر', image: '/uploads/product/green.png', stock: '2' })
    await save(user)

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    expect(lastPayload().variants).toEqual([
      expect.objectContaining({ id: 'v-blue', colorName: 'أزرق', expectedStock: 4 }),
      { colorName: 'أخضر', colorNameCkb: null, colorHex: null, imageUrl: '/uploads/product/green.png', stock: 2, isActive: true },
    ])
  })

  it('[CRITICAL] رفع صورة لونٍ يصل ذلك اللون وحده — حتى لو نُقل أثناء الرفع', async () => {
    const pending: Array<(url: string) => void> = []
    vi.mocked(uploadImage).mockImplementation(
      () => new Promise<string>((resolve) => pending.push(resolve)),
    )
    const user = userEvent.setup()
    renderEdit()
    await screen.findByRole('button', { name: 'حفظ التعديلات' })

    // رفعان متزامنان: الأزرق أولاً ثم الأحمر، والأزرق يُنقل للأعلى أثناءهما.
    await user.upload(fileInputOf(1), pick('blue.png'))
    await user.upload(fileInputOf(0), pick('red.png'))
    expect(pending).toHaveLength(2)
    await user.click(row(1).getByRole('button', { name: 'نقل اللون للأعلى' }))
    // ينتهي الأحمر قبل الأزرق.
    await act(async () => pending[1]!('/uploads/product/red-new.png'))
    await act(async () => pending[0]!('/uploads/product/blue-new.png'))

    await waitFor(() =>
      expect(row(0).getByLabelText('رابط صورة اللون 1')).toHaveValue('/uploads/product/blue-new.png'),
    )
    expect(row(0).getByLabelText('اسم اللون بالعربي')).toHaveValue('أزرق')
    expect(row(1).getByLabelText('اسم اللون بالعربي')).toHaveValue('أحمر')
    expect(row(1).getByLabelText('رابط صورة اللون 2')).toHaveValue('/uploads/product/red-new.png')

    await save(user)
    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    expect(lastPayload().variants!.map((v) => [v.id, v.imageUrl])).toEqual([
      ['v-blue', '/uploads/product/blue-new.png'],
      ['v-red', '/uploads/product/red-new.png'],
    ])
  })

  it('رفعٌ ينتهي بعد حذف لونه لا يكتب صورته على لونٍ آخر', async () => {
    let finish: (url: string) => void = () => {}
    vi.mocked(uploadImage).mockImplementation(() => new Promise<string>((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    renderEdit()
    await screen.findByRole('button', { name: 'حفظ التعديلات' })
    await user.upload(fileInputOf(0), pick())
    await user.click(row(0).getByRole('button', { name: 'حذف اللون' }))
    await act(async () => finish('/uploads/product/orphan.png'))
    expect(rows()).toHaveLength(1)
    expect(row(0).getByLabelText('رابط صورة اللون 1')).toHaveValue('/uploads/product/blue.png')
  })

  it('[CRITICAL] STOCK_CHANGED: شرحٌ ثابت، والمخزون الحالي للّون في الحقل والأساس', async () => {
    const user = userEvent.setup()
    vi.mocked(updateProduct).mockRejectedValueOnce(
      new ApiError('المخزون تغيّر منذ فتح الصفحة', 409, 'STOCK_CHANGED'),
    )
    renderEdit()
    await screen.findByRole('button', { name: 'حفظ التعديلات' })
    // قُبل طلبٌ على الأحمر في تبويبٍ آخر: ٣ ← ١.
    vi.mocked(getProductForEdit).mockResolvedValue({
      draft: {
        ...structuredClone(variantDraft),
        stock: 5,
        variants: variantDraft.variants.map((v) => (v.id === 'v-red' ? { ...v, stock: 1 } : { ...v })),
      },
      optionsLoaded: true,
    })
    const redName = row(0).getByLabelText('اسم اللون بالعربي')
    await user.clear(redName)
    await put(user, redName, 'أحمر غامق')
    await save(user)

    expect(await screen.findByTestId('product-submit-error')).toHaveTextContent('تغيّر مخزون لونٍ أو أكثر')
    await waitFor(() => expect(row(0).getByLabelText('مخزون اللون')).toHaveValue('1'))
    expect(row(0).getByText('المخزون الحالي: 1')).toBeInTheDocument()

    await save(user)
    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(2))
    expect(lastPayload().variants![0]).toMatchObject({ id: 'v-red', colorName: 'أحمر غامق', stock: 1, expectedStock: 1 })
  })

  it('السقف ٢٠ لوناً: زرّ الإضافة يتعطّل', async () => {
    vi.mocked(getProductForEdit).mockResolvedValue({
      draft: {
        ...structuredClone(variantDraft),
        variants: Array.from({ length: 20 }, (_, i) => ({
          ...variantDraft.variants[0]!,
          id: `v${i}`,
          colorName: `لون ${i}`,
        })),
      },
      optionsLoaded: true,
    })
    renderEdit()
    expect(await screen.findByRole('button', { name: /إضافة لون \(20\/20\)/ })).toBeDisabled()
  })

  it('إزالة كل الألوان: لا يُرسَل `stock`، ويُرسَل `variants: []`', async () => {
    const user = userEvent.setup()
    renderEdit()
    await screen.findByRole('button', { name: 'حفظ التعديلات' })
    await user.click(row(1).getByRole('button', { name: 'حذف اللون' }))
    await user.click(row(0).getByRole('button', { name: 'حذف اللون' }))
    expect(screen.getByLabelText('المخزون')).toBeDisabled()
    await save(user)
    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    expect(lastPayload().variants).toEqual([])
    expect(lastPayload()).not.toHaveProperty('stock')
  })

  it('منتجٌ بلا ألوان تُضاف له ألوان: لا `stock`، والألوان بلا `id`', async () => {
    vi.mocked(getProductForEdit).mockResolvedValue({
      draft: { ...structuredClone(variantDraft), variants: [], stock: 5 },
      optionsLoaded: true,
    })
    const user = userEvent.setup()
    renderEdit()
    const stock = await screen.findByLabelText('المخزون')
    await user.clear(stock)
    await user.type(stock, '8')
    await user.click(screen.getByRole('button', { name: /إضافة لون/ }))
    await fillColor(user, 0, { name: 'أسود', image: '/uploads/product/black.png', stock: '2' })
    await save(user)
    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    expect(lastPayload()).not.toHaveProperty('stock')
    expect(lastPayload()).not.toHaveProperty('expectedStock')
    expect(lastPayload().variants).toEqual([
      { colorName: 'أسود', colorNameCkb: null, colorHex: null, imageUrl: '/uploads/product/black.png', stock: 2, isActive: true },
    ])
  })
})
