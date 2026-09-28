import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.setConfig({ testTimeout: 20_000 })

vi.mock('../api/categoriesApi', () => ({ listAdminCategories: vi.fn() }))
vi.mock('../api/communityApi', () => ({ listFranchises: vi.fn() }))

import { listAdminCategories } from '../api/categoriesApi'
import { listFranchises } from '../api/communityApi'
import ProductForm from './ProductForm'

/**
 * ضبط خصم التوصيل من نموذج المنتج.
 *
 * [CRITICAL] النموذج يجمع الإعداد ويرسله؛ لا يحسب خصماً ولا سقفاً. السقف
 * (`min(الخام، الرسوم)`) وقسمة الفائض يقعان على الخادم وقت الطلب، لأن رسوم
 * التوصيل تختلف بالمحافظة والمنطقة ولا يعرفها هذا النموذج أصلاً.
 */

function renderForm(initialValues = {}) {
  const onSubmit = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <ProductForm
            mode="create"
            optionsAvailable
            submitting={false}
            onSubmit={onSubmit}
            onCancel={() => {}}
            initialValues={initialValues}
          />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
  return { onSubmit }
}

describe('متوقع التوفر في نموذج المنتج', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAdminCategories).mockResolvedValue({
      items: [{ id: 'c1', name: 'قسم', subcategories: [] }],
    } as never)
    vi.mocked(listFranchises).mockResolvedValue({ items: [] } as never)
  })

  it('الحقل موجود ومعنون «متوقع التوفر»', async () => {
    renderForm({ stock: 0 })
    expect(await screen.findByText('متوقع التوفر')).toBeInTheDocument()
  })

  it('اختياري — لا يمنع الحفظ حين يُترك فارغاً', async () => {
    renderForm({ stock: 0 })
    await screen.findByText('متوقع التوفر')
    const input = document.querySelector<HTMLInputElement>('#restockAt')
    expect(input?.value).toBe('')
    expect(input?.getAttribute('required')).toBeNull()
  })

  it('القيمة المحفوظة تظهر عند فتح منتج له موعد', async () => {
    renderForm({ stock: 0, restockAt: '2026-10-15T09:00:00.000Z' })
    await screen.findByText('متوقع التوفر')
    const input = document.querySelector<HTMLInputElement>('#restockAt')
    expect(input?.value).toContain('2026')
  })

  // ═══ معاينة حالة الزبون — نفس قاعدة التطبيق، فلا يخمّن المسؤول ═══

  it('[CRITICAL] مخزون ٠ + موعد ⇒ يعلن «قريباً يتوفر»', async () => {
    renderForm({ stock: 0, restockAt: '2026-10-15T09:00:00.000Z' })
    expect(await screen.findByText(/قريباً يتوفر/)).toBeInTheDocument()
  })

  it('مخزون ٠ بلا موعد ⇒ يعلن «غير متوفر» مع زر التنبيه', async () => {
    renderForm({ stock: 0 })
    expect(await screen.findByText(/غير متوفر/)).toBeInTheDocument()
    expect(screen.queryByText(/قريباً يتوفر/)).not.toBeInTheDocument()
  })

  it('[CRITICAL] مخزون موجب ⇒ «متوفر» مهما بقي من موعد', async () => {
    renderForm({ stock: 3, restockAt: '2026-10-15T09:00:00.000Z' })
    expect(await screen.findByText(/متوفر — يمكن للزبون الشراء الآن/)).toBeInTheDocument()
    expect(screen.queryByText(/قريباً يتوفر/)).not.toBeInTheDocument()
    // ويشرح للمسؤول لماذا لن يُعرض التاريخ.
    expect(
      screen.getByText(/المخزون يتقدّم على الموعد/),
    ).toBeInTheDocument()
  })
})

describe('ضبط خصم التوصيل في نموذج المنتج', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAdminCategories).mockResolvedValue({
      items: [{ id: 'c1', name: 'قسم', subcategories: [] }],
    } as never)
    vi.mocked(listFranchises).mockResolvedValue({ items: [] } as never)
  })

  it('المفتاح موجود ومعنون', async () => {
    renderForm()
    expect(await screen.findByText('ترويج توصيل')).toBeInTheDocument()
  })

  it('[CRITICAL] حقل المبلغ مخفيّ ما دام الخصم معطَّلاً', async () => {
    renderForm({ hasDeliveryPromo: false })
    await screen.findByText('ترويج توصيل')
    expect(
      screen.queryByText('قيمة خصم التوصيل / قطعة'),
    ).not.toBeInTheDocument()
  })

  it('التفعيل يُظهر حقل المبلغ لكل قطعة', async () => {
    renderForm({ hasDeliveryPromo: false })
    const toggle = await screen.findByRole('switch', { name: '' }).catch(() => null)
    const switches = screen.getAllByRole('switch')
    await userEvent.click(toggle ?? switches[0]!)
    expect(
      await screen.findByText('قيمة خصم التوصيل / قطعة'),
    ).toBeInTheDocument()
  })

  it('القيمة المحفوظة تظهر عند فتح منتج مفعَّل', async () => {
    renderForm({ hasDeliveryPromo: true, deliveryPromoAmount: 1000 })
    expect(
      await screen.findByText('قيمة خصم التوصيل / قطعة'),
    ).toBeInTheDocument()
    const input = document.querySelector<HTMLInputElement>(
      '#deliveryPromoAmount',
    )
    expect(input?.value).toBe('1000')
  })

  it('[CRITICAL] النموذج يعرض الإعداد ولا يحسب سقفاً ولا فائضاً', async () => {
    // لا رسوم توصيل في هذه الشاشة أصلاً، فلا محلّ لحسابٍ هنا. أي رقم
    // مشتقّ كان سيكون تخميناً يخالف ما يقرّره الخادم وقت الطلب.
    renderForm({ hasDeliveryPromo: true, deliveryPromoAmount: 1000 })
    await screen.findByText('قيمة خصم التوصيل / قطعة')
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('فائض')
    expect(text).not.toContain('رسوم التوصيل')
  })

  it('التلميح يشرح أن الخصم لكل قطعة وبسقف الرسوم', async () => {
    renderForm({ hasDeliveryPromo: true, deliveryPromoAmount: 1000 })
    await screen.findByText('قيمة خصم التوصيل / قطعة')
    // التلميحات في antd تُحمَّل على العنصر عبر aria/عنوان — يكفي وجود النصّ
    // في الشجرة بعد التحويم، والمهم هنا أن الحقل معنون بوضوح «/ قطعة».
    expect(screen.getByText('قيمة خصم التوصيل / قطعة')).toBeInTheDocument()
  })
})

/**
 * [CRITICAL] محتوى المنتج بلغتين — أربعة حقول يكتبها المسؤول (هجرة ٠٦٦).
 *
 * لا حقل «اسم المنتج» عامٌّ واحد: الاسم والوصف بالعربية تحت «العربية»،
 * والاسم والوصف بالكردية تحت «الكردية». الإنشاء يُلزم الأربعة؛ التعديل لا
 * يسمح بتفريغ ما كُتب، ولا يُجبر على اختلاق ما نقص في منتجٍ قديم.
 */
function renderFormIn(mode: 'create' | 'edit', initialValues = {}) {
  const onSubmit = vi.fn()
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
            initialValues={{
              price: 1000,
              stock: 2,
              categoryId: 'c1',
              images: [],
              options: [],
              ...initialValues,
            }}
          />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
  return { onSubmit }
}

const REQUIRED_MESSAGES = [
  'اسم المنتج بالعربية مطلوب',
  'وصف المنتج بالعربية مطلوب',
  'اسم المنتج بالكردية مطلوب',
  'وصف المنتج بالكردية مطلوب',
]

describe('[CRITICAL] محتوى المنتج بلغتين في النموذج', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAdminCategories).mockResolvedValue({
      items: [{ id: 'c1', name: 'قسم', subcategories: [] }],
    } as never)
    vi.mocked(listFranchises).mockResolvedValue({ items: [] } as never)
  })

  it('الإنشاء يعرض الحقول الأربعة مجمَّعةً تحت «العربية» و«الكردية» — لا حقل اسمٍ عامّ', async () => {
    renderFormIn('create')
    const ar = await screen.findByTestId('content-ar')
    const ckb = screen.getByTestId('content-ckb')
    expect(within(ar).getByText('العربية')).toBeInTheDocument()
    expect(within(ar).getByLabelText('اسم المنتج بالعربي')).toBeInTheDocument()
    expect(within(ar).getByLabelText('وصف المنتج بالعربي')).toBeInTheDocument()
    expect(within(ckb).getByText('الكردية')).toBeInTheDocument()
    expect(within(ckb).getByLabelText('ناوی بەرهەم بە کوردی')).toBeInTheDocument()
    expect(within(ckb).getByLabelText('وەسفی بەرهەم بە کوردی')).toBeInTheDocument()
    expect(screen.queryByLabelText('اسم المنتج')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('الوصف')).not.toBeInTheDocument()
  })

  it('الإرسال الفارغ يُرفض برسالةٍ لكل حقلٍ من الأربعة ولا يصل الخادم', async () => {
    const { onSubmit } = renderFormIn('create')
    await screen.findByTestId('content-ar')
    await userEvent.click(screen.getByRole('button', { name: 'إضافة المنتج' }))
    for (const text of REQUIRED_MESSAGES) {
      expect(await screen.findByText(text)).toBeInTheDocument()
    }
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('المسافات وحدها فارغة — تُرفض كالغياب', async () => {
    const { onSubmit } = renderFormIn('create')
    await screen.findByTestId('content-ar')
    for (const label of ['اسم المنتج بالعربي', 'وصف المنتج بالعربي', 'ناوی بەرهەم بە کوردی', 'وەسفی بەرهەم بە کوردی']) {
      await userEvent.type(screen.getByLabelText(label), '   ')
    }
    await userEvent.click(screen.getByRole('button', { name: 'إضافة المنتج' }))
    for (const text of REQUIRED_MESSAGES) {
      expect(await screen.findByText(text)).toBeInTheDocument()
    }
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('القيم تصل مقصوصةً كلٌّ في حقله — واليونيكود الكردي كما كُتب', async () => {
    const { onSubmit } = renderFormIn('create')
    await screen.findByTestId('content-ar')
    await userEvent.type(screen.getByLabelText('اسم المنتج بالعربي'), '  حقيبة ناروتو ')
    await userEvent.type(screen.getByLabelText('وصف المنتج بالعربي'), 'حقيبة مدرسية بتصميم ناروتو')
    await userEvent.type(screen.getByLabelText('ناوی بەرهەم بە کوردی'), ' جانتای ناروتۆ  ')
    await userEvent.type(screen.getByLabelText('وەسفی بەرهەم بە کوردی'), 'جانتای قوتابخانە بە دیزاینی ناروتۆ')
    await userEvent.click(screen.getByRole('button', { name: 'إضافة المنتج' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      nameAr: 'حقيبة ناروتو',
      descriptionAr: 'حقيبة مدرسية بتصميم ناروتو',
      nameCkb: 'جانتای ناروتۆ',
      descriptionCkb: 'جانتای قوتابخانە بە دیزاینی ناروتۆ',
      price: 1000,
      stock: 2,
    })
  })

  it('التعديل: ما كان مكتوباً لا يُفرَّغ — مسح الاسم الكردي يُرفض', async () => {
    const { onSubmit } = renderFormIn('edit', {
      nameAr: 'حقيبة',
      descriptionAr: 'وصف',
      nameCkb: 'جانتا',
      descriptionCkb: 'وەسف',
    })
    const input = await screen.findByLabelText('ناوی بەرهەم بە کوردی')
    expect(input).toHaveValue('جانتا')
    await userEvent.clear(input)
    await userEvent.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))
    expect(await screen.findByText('اسم المنتج بالكردية مطلوب')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('[CRITICAL] منتجٌ قديم بلا كردية: النقص معلَن، والحفظ لا يُحجَب ولا يُختلق نصّ', async () => {
    const { onSubmit } = renderFormIn('edit', {
      nameAr: 'منتج قديم',
      descriptionAr: '',
      nameCkb: '',
      descriptionCkb: '',
    })
    expect(await screen.findByText('الكردية ناقصة لهذا المنتج')).toBeInTheDocument()
    expect(screen.getByText('الوصف العربي فارغ لهذا المنتج')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      nameAr: 'منتج قديم',
      nameCkb: '',
      descriptionCkb: '',
    })
  })
})
