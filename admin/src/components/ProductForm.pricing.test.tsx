import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.setConfig({ testTimeout: 20_000 })

vi.mock('../api/categoriesApi', () => ({ listAdminCategories: vi.fn() }))
vi.mock('../api/communityApi', () => ({ listFranchises: vi.fn() }))

import { listAdminCategories } from '../api/categoriesApi'
import { listFranchises } from '../api/communityApi'
import ProductForm, { type ProductFormValues } from './ProductForm'
import ProductPriceText from './ProductPriceText'

/**
 * [CRITICAL] تسعير المنتج في النموذج — «يُعلن لاحقاً» (084) و«سعر قطعتين» (085).
 *
 * النموذج يجمع القيم ويُرسلها صريحة: `null` لا صفر ولا حقلاً غائباً. الحكم على
 * الخادم (القيدان وحساب الأسطر)؛ هنا رفضٌ مبكّر وتوضيحٌ لما سيدفعه الزبون.
 */

const CONTENT = { nameAr: 'حقيبة', descriptionAr: 'وصف', nameCkb: 'جانتا', descriptionCkb: 'وەسف' }

function renderForm(mode: 'create' | 'edit', initialValues: Partial<ProductFormValues> = {}) {
  const onSubmit = vi.fn<(values: ProductFormValues) => void>()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <ProductForm
            mode={mode}
            optionsAvailable
            submitting={false}
            onSubmit={onSubmit}
            onCancel={() => {}}
            initialValues={{ ...CONTENT, price: 4000, stock: 5, categoryId: 'c1', images: [], options: [], ...initialValues }}
          />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
  return { onSubmit, submit: () => userEvent.click(screen.getByRole('button', { name: mode === 'create' ? 'إضافة المنتج' : 'حفظ التعديلات' })) }
}

// المفتاح بمعرّف حقله: اسم الوصول يضمّ أيقونة التلميح.
const priceLaterSwitch = () => document.querySelector<HTMLButtonElement>('#priceLater')!
const pairInput = () => document.querySelector<HTMLInputElement>('#pairPrice')!

describe('[CRITICAL] «السعر يُعلن لاحقاً» في نموذج المنتج (084)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAdminCategories).mockResolvedValue({ items: [{ id: 'c1', name: 'قسم', subcategories: [] }] } as never)
    vi.mocked(listFranchises).mockResolvedValue({ items: [] } as never)
  })

  it('منتجٌ محفوظ بلا سعر يُفتح والمفتاح مُفعَّل، والحفظ يرسل null صريحةً للأسعار الثلاثة', async () => {
    const { onSubmit, submit } = renderForm('edit', { price: null, previousPrice: null, pairPrice: null })
    await screen.findByText('قريباً — السعر يُعلن لاحقاً')
    expect(priceLaterSwitch()).toBeChecked()
    expect(pairInput()).toBeDisabled()
    await submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const values = onSubmit.mock.calls[0]![0]
    expect(values).toMatchObject({ price: null, previousPrice: null, pairPrice: null })
    // المفتاح للنموذج وحده — لا يصل الخادم.
    expect(values).not.toHaveProperty('priceLater')
  })

  it('تفعيل المفتاح في منتجٍ مسعَّر يُفرغ السعر وعرضيه — لا صفر', async () => {
    const { onSubmit, submit } = renderForm('edit', { price: 4000, previousPrice: 5000, pairPrice: 7000 })
    await screen.findByText('السعر يُعلن لاحقاً')
    await userEvent.click(priceLaterSwitch())
    await submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ price: null, previousPrice: null, pairPrice: null })
  })

  it('الإنشاء يبدأ مسعَّراً: السعر مطلوب ما دام المفتاح مطفأً', async () => {
    const { onSubmit, submit } = renderForm('create', { price: undefined })
    await screen.findByText('السعر والمخزون')
    expect(priceLaterSwitch()).not.toBeChecked()
    await submit()
    expect(await screen.findByText('السعر مطلوب')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    await userEvent.click(priceLaterSwitch())
    await submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]![0].price).toBeNull()
  })

  it('إطفاء المفتاح في منتجٍ بلا سعر يطلب السعر قبل الحفظ', async () => {
    const { onSubmit, submit } = renderForm('edit', { price: null })
    await screen.findByText('السعر يُعلن لاحقاً')
    await userEvent.click(priceLaterSwitch())
    await submit()
    expect(await screen.findByText('السعر مطلوب')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('[CRITICAL] «سعر قطعتين» في نموذج المنتج (085)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAdminCategories).mockResolvedValue({ items: [{ id: 'c1', name: 'قسم', subcategories: [] }] } as never)
    vi.mocked(listFranchises).mockResolvedValue({ items: [] } as never)
  })

  it('اختياري: الفارغ يُرسَل null — لا عرض', async () => {
    const { onSubmit, submit } = renderForm('create')
    await screen.findByText('سعر قطعتين')
    await submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ price: 4000, pairPrice: null })
  })

  it('قطعة ٤٠٠٠ وقطعتان ٧٠٠٠: يُقبل ويُعرض للمسؤول ما سيدفعه الزبون', async () => {
    const { onSubmit, submit } = renderForm('create')
    await userEvent.type(await screen.findByLabelText('سعر قطعتين'), '7000')
    expect(await screen.findByText(/توفير/)).toHaveTextContent(/قطعتان .*7.?000/)
    await submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ price: 4000, pairPrice: 7000 })
  })

  it('ضعف السعر أو أكثر ليس عرضاً، وأقلّ من سعر القطعة مرفوض — لا يصل الخادم', async () => {
    const { onSubmit, submit } = renderForm('create')
    const input = await screen.findByLabelText('سعر قطعتين')
    await userEvent.type(input, '8000')
    await submit()
    expect(await screen.findByText('يجب أن يكون أقل من ضعف سعر القطعة — وإلا فلا توفير')).toBeInTheDocument()

    await userEvent.clear(input)
    await userEvent.type(input, '3999')
    await submit()
    expect(await screen.findByText('لا يقلّ عن سعر القطعة الواحدة')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('مسح سعر القطعتين في منتجٍ له عرض يرسل null فيزيله', async () => {
    const { onSubmit, submit } = renderForm('edit', { pairPrice: 7000 })
    const input = await screen.findByLabelText('سعر قطعتين')
    expect(input).toHaveValue('7000')
    await userEvent.clear(input)
    await submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]![0].pairPrice).toBeNull()
  })
})

describe('ProductPriceText — السعر في جداول اللوحة', () => {
  it('بلا سعر: «يُعلن لاحقاً» لا «٠ د.ع»', () => {
    render(<ProductPriceText price={null} pairPrice={null} />)
    expect(screen.getByText('يُعلن لاحقاً')).toBeInTheDocument()
    expect(screen.queryByText(/د\.ع/)).not.toBeInTheDocument()
  })

  it('بعرض قطعتين: سطرٌ ثانٍ تحت سعر القطعة، وبلا عرض لا سطر', () => {
    const { rerender } = render(<ProductPriceText price={4000} pairPrice={7000} />)
    expect(screen.getByText(/قطعتان بـ/)).toBeInTheDocument()
    rerender(<ProductPriceText price={4000} pairPrice={null} />)
    expect(screen.queryByText(/قطعتان/)).not.toBeInTheDocument()
  })
})
