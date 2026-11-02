import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.setConfig({ testTimeout: 30_000 })

vi.mock('../api/productCostsApi', () => ({ getProductCosts: vi.fn(), addProductCost: vi.fn() }))

import { addProductCost, getProductCosts } from '../api/productCostsApi'
import ProductCostCard from './ProductCostCard'

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <ProductCostCard productId="p1" />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.clearAllMocks())

describe('تكلفة الشراء (D1)', () => {
  it('تعرض الساري والسجلّ، و«غير مسجّلة» حين لا تكلفة', async () => {
    vi.mocked(getProductCosts).mockResolvedValue({ productId: 'p1', productName: 'قبعة', current: null, entries: [] })
    renderCard()
    expect(await screen.findByText('غير مسجّلة')).toBeInTheDocument()
    expect(screen.getByText('لا تكاليف مسجّلة')).toBeInTheDocument()
  })

  it('[CRITICAL] الإضافة إلحاقٌ بتأكيدٍ صريح، ولا تحرير ولا حذف لسطرٍ سابق', async () => {
    const entry = { id: 'e1', productId: 'p1', unitCost: 4000, effectiveFrom: '2026-10-01T10:00:00Z', enteredBy: null, enteredByName: 'المالك', note: null }
    vi.mocked(getProductCosts).mockResolvedValue({ productId: 'p1', productName: 'قبعة', current: entry, entries: [entry] })
    vi.mocked(addProductCost).mockResolvedValue({ ...entry, id: 'e2', unitCost: 4500 })
    renderCard()
    expect((await screen.findAllByText(/4,000 د\.ع/)).length).toBeGreaterThan(0)
    // لا أزرار تعديل أو حذف للسجلّ.
    expect(screen.queryByRole('button', { name: /تعديل|حذف/ })).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('تكلفة القطعة'), '4500')
    await userEvent.click(screen.getByRole('button', { name: 'إضافة تكلفة' }))
    await userEvent.click(await screen.findByRole('button', { name: 'تسجيل' }))
    await waitFor(() => expect(addProductCost).toHaveBeenCalledWith('p1', { unitCost: 4500 }))
  })
})
