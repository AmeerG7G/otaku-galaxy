import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/communityApi', () => ({
  listFranchises: vi.fn(),
  createFranchise: vi.fn(),
  updateFranchise: vi.fn(),
  deleteFranchise: vi.fn(),
  franchiseUsage: vi.fn(),
}))

import { deleteFranchise, franchiseUsage, listFranchises } from '../api/communityApi'
import FranchisesPage from './FranchisesPage'
import type { Franchise } from '../types/community'

const demon: Franchise = {
  id: 'f1',
  name: 'قاتل الشياطين',
  altNames: ['Demon Slayer'],
  imageUrl: '/uploads/franchise/old.png',
  sortOrder: 0,
  isActive: true,
  productCount: 3,
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <FranchisesPage />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

/** الأنمي (STEP 64 §6) — بلا صور، والحذف متاحٌ ولو ارتبط بمنتجات. */
describe('الأنمي', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listFranchises).mockResolvedValue({ items: [demon] })
    vi.mocked(franchiseUsage).mockResolvedValue({ id: 'f1', productCount: 4 })
    vi.mocked(deleteFranchise).mockResolvedValue({ id: 'f1', unlinkedProducts: 4 })
  })

  it('لا عمود صورة ولا حقل صورة في النموذج', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await screen.findAllByText('قاتل الشياطين')
    expect(container.querySelector('img')).toBeNull()
    expect(screen.queryByText('الصورة')).toBeNull()
    await user.click(screen.getAllByText('تعديل')[0]!)
    expect(await screen.findByText('أسماء بديلة للبحث')).toBeInTheDocument()
    expect(screen.queryByText(/صورة الأنمي/)).toBeNull()
  })

  it('[CRITICAL] أنمي مرتبط بمنتجات يُحذف بعد تأكيدٍ يقول العدد الفعلي وأن المنتجات وصورها باقية', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByText('قاتل الشياطين')
    const button = screen.getByText('حذف').closest('button')!
    expect(button).toBeEnabled()
    await user.click(button)
    expect(await screen.findByText(/سيُزال هذا الأنمي من 4 منتج/)).toBeInTheDocument()
    expect(screen.getByText(/المنتجات وصورها وبياناتها الأخرى لن تُحذف/)).toBeInTheDocument()
    expect(franchiseUsage).toHaveBeenCalledWith('f1')
    const confirm = screen.getAllByText('حذف').at(-1)!
    await user.click(confirm)
    await waitFor(() => expect(deleteFranchise).toHaveBeenCalledWith('f1'))
    expect(await screen.findByText(/أُزيل من 4 منتج — المنتجات باقية/)).toBeInTheDocument()
  })

  it('إلغاء التأكيد لا يحذف شيئاً', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByText('قاتل الشياطين')
    await user.click(screen.getByText('حذف').closest('button')!)
    await user.click(await screen.findByText('إلغاء'))
    expect(deleteFranchise).not.toHaveBeenCalled()
  })
})
