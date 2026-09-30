import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/pointsApi', () => ({ getCustomerPoints: vi.fn() }))
vi.mock('../api/adminAccountsApi', () => ({ fetchAdminMe: vi.fn() }))

import { getCustomerPoints } from '../api/pointsApi'
import { fetchAdminMe } from '../api/adminAccountsApi'
import { ApiError } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { DESKTOP, PHONE, setViewportWidth } from '../test/viewport'
import type { CustomerPoints } from '../types/points'
import { PointsLedger } from './PointsLedger'

/**
 * سجلّ نقاط الزبون — «رصيده ٣٥ والسجلّ فارغ» (STEP 66).
 *
 * الرصيد مجموع الدفتر؛ السجلّ يشرحه سطراً سطراً: التاريخ، الحركة، السبب،
 * المقدار، **الرصيد بعدها**، والطلب مرجعاً. وفشلُ الطلب يُعرض خطأً لا دفتراً
 * فارغاً برصيد صفر — ذاك ما كان يبدو «سجلاً فارغاً».
 */

const points35: CustomerPoints = {
  customer: { id: 'u1', username: 'أمير', phone: '+9647701234567', isActive: true, createdAt: '2026-09-01T00:00:00Z' },
  balance: 35,
  ledger: [
    { id: 'l3', label: 'تقييم منشور', amount: 1, reason: 'review_approved', orderId: 'o1', orderNumber: '10421', reviewId: 'r2', balanceAfter: 35, createdAt: '2026-09-22T09:30:00Z' },
    { id: 'l2', label: 'تقييم مصوّر منشور', amount: 5, reason: 'review_with_photo', orderId: 'o1', orderNumber: '10421', reviewId: 'r1', balanceAfter: 34, createdAt: '2026-09-21T09:30:00Z' },
    { id: 'l1', label: 'نقاط شراء', amount: 29, reason: 'order_received', orderId: 'o1', orderNumber: '10421', reviewId: null, balanceAfter: 29, createdAt: '2026-09-19T09:30:00Z' },
  ],
}

function renderLedger() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <MemoryRouter>
            <PointsLedger customerId="u1" />
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

const asAdmin = (permissions: string[], isSuperAdmin = false) => {
  useAuthStore.setState({ token: 't', user: null })
  vi.mocked(fetchAdminMe).mockResolvedValue({ id: 'a', username: 'م', phone: '+9647800000001', isSuperAdmin, permissions } as never)
}

describe('PointsLedger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setViewportWidth(DESKTOP)
    vi.mocked(getCustomerPoints).mockResolvedValue(points35)
  })

  it('[regression] الرصيد ٣٥ يُشرح: ثلاث حركات، الرصيد بعد كلٍّ منها، ورقم الطلب رابطاً', async () => {
    asAdmin([], true)
    const { container } = renderLedger()
    await screen.findByText('نقاط شراء')
    expect(getCustomerPoints).toHaveBeenCalledWith('u1')
    const rows = [...container.querySelectorAll('tr.ant-table-row')] as HTMLElement[]
    expect(rows).toHaveLength(3)
    // الأحدث أولاً: 35 ← 34 ← 29، ومجموع المقادير = الرصيد.
    expect(rows.map((r) => within(r).getByText(/^(35|34|29)$/).textContent)).toEqual(['35', '34', '29'])
    expect(within(rows[2]!).getByText('+29')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('استلام طلب')).toBeInTheDocument()
    await waitFor(() => expect(within(rows[0]!).getByText('#10421').closest('a')).toHaveAttribute('href', '/orders/o1'))
  })

  it('بلا صلاحية «الطلبات»: رقم الطلب نصٌّ لا رابطٌ إلى صفحة رفض', async () => {
    asAdmin(['points'])
    renderLedger()
    await screen.findByText('نقاط شراء')
    await waitFor(() => expect(fetchAdminMe).toHaveBeenCalled())
    for (const ref of screen.getAllByText('#10421')) expect(ref.closest('a')).toBeNull()
  })

  it('[CRITICAL] فشل الطلب يُعرض خطأً مع «إعادة المحاولة» — لا دفتراً فارغاً برصيد صفر', async () => {
    asAdmin([], true)
    vi.mocked(getCustomerPoints).mockRejectedValueOnce(new ApiError('العميل غير موجود', 404))
    const user = userEvent.setup()
    renderLedger()
    expect(await screen.findByText('تعذّر تحميل سجلّ النقاط')).toBeInTheDocument()
    expect(screen.queryByText('الرصيد الحالي')).toBeNull()
    expect(screen.queryByText('لا حركات نقاط لهذا الزبون بعد.')).toBeNull()
    await user.click(screen.getByText('إعادة المحاولة'))
    expect(await screen.findByText('نقاط شراء')).toBeInTheDocument()
  })

  it('الهاتف: بطاقة لكل حركة بمقدارها والرصيد بعدها ومرجعها', async () => {
    setViewportWidth(PHONE)
    asAdmin([], true)
    const { container } = renderLedger()
    await screen.findByText('نقاط شراء')
    const card = container.querySelector('[data-row-key="l1"]') as HTMLElement
    expect(within(card).getByText('+29')).toBeInTheDocument()
    expect(within(card).getByText(/الرصيد بعدها 29/)).toBeInTheDocument()
    expect(within(card).getByText('#10421')).toBeInTheDocument()
  })
})
