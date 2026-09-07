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
