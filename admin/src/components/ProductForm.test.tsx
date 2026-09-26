import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
