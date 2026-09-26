import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../queryClient'

vi.mock('../api/customersApi', () => ({
  getCustomerDetail: vi.fn(),
  setCustomerPassword: vi.fn(),
}))

import { getCustomerDetail } from '../api/customersApi'
import CustomerDetailPage from './CustomerDetailPage'
import type { AdminCustomerDetail } from '../types/customers'

/**
 * ملفّ الزبون: كل شيء من مكانٍ واحد — ولا سرّ فيه.
 */
function detail(overrides: Partial<AdminCustomerDetail> = {}): AdminCustomerDetail {
  return {
    profile: {
      id: 'u1',
      username: 'أمير',
      phone: '+9647701234567',
      gender: 'male',
      avatarUrl: null,
      isActive: true,
      isVerified: true,
      verifiedAt: '2026-09-02T00:00:00Z',
      preferredLanguage: 'ckb',
      createdAt: '2026-09-01T00:00:00Z',
    },
    points: { balance: 120, levelKey: 'explorer', levelNumber: 2, levelName: 'مستكشف المجرة', nextLevelKey: 'voyager', pointsToNextLevel: 130 },
    orders: {
      items: [{ id: 'o1234567-abcd', status: 'completed', total: 25000, createdAt: '2026-09-03T00:00:00Z', items: [{ productName: 'قبعة لوفي', quantity: 2 }] }],
      total: 1,
    },
    requests: [
      {
        id: 'req-9',
        kind: 'password_reset',
        status: 'pending',
        submitted: { phone: '+9647701234567', username: 'أمير', gender: 'male', levelKey: 'explorer' },
        account: null,
        match: { username: true, gender: true, level: true },
        adminNote: null,
        resolvedAt: null,
        resolvedBy: null,
        createdAt: '2026-09-04T00:00:00Z',
        updatedAt: '2026-09-04T00:00:00Z',
      },
    ],
    ...overrides,
  }
}

function renderPage(queryClient = createQueryClient({ retry: false })) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <MemoryRouter initialEntries={['/customers/u1']}>
            <Routes>
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('ملفّ الزبون', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getCustomerDetail).mockResolvedValue(detail())
  })

  it('الهوية والنقاط والمستوى والطلبات وطلبات الحساب من مكانٍ واحد', async () => {
    renderPage()
    expect(await screen.findByText('+9647701234567')).toBeInTheDocument()
    expect(screen.getByText('مستكشف المجرة')).toBeInTheDocument()
    expect(screen.getByText('الكردية (سوراني)')).toBeInTheDocument()
    expect(screen.getByText('مفعَّل')).toBeInTheDocument()
    expect(screen.getByText(/قبعة لوفي ×2/)).toBeInTheDocument()
    expect(screen.getByText('إعادة تعيين كلمة المرور')).toBeInTheDocument()
  })

  it('[CRITICAL] طلب إعادة تعيين معلَّق يُنبَّه إليه مع ما أُرسل للمقارنة', async () => {
    renderPage()
    const alert = (await screen.findByText(/لهذا الزبون طلب إعادة تعيين كلمة مرور قيد المراجعة/)).closest('.ant-alert') as HTMLElement
    expect(within(alert).getByText(/المستوى explorer/)).toBeInTheDocument()
  })

  it('زرّ «تغيير كلمة مرور الزبون» موجود — ولا كلمة ولا تجزئة معروضة', async () => {
    renderPage()
    expect(await screen.findByText('تغيير كلمة مرور الزبون')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/password_hash|passwordHash|\$2[aby]\$/)
  })

  it('حساب غير مفعَّل يُعرض «بانتظار الموافقة»', async () => {
    vi.mocked(getCustomerDetail).mockResolvedValue(
      detail({ profile: { ...detail().profile, isVerified: false, verifiedAt: null }, requests: [] }),
    )
    renderPage()
    expect(await screen.findByText('بانتظار الموافقة')).toBeInTheDocument()
    expect(screen.queryByText(/قيد المراجعة/)).not.toBeInTheDocument()
  })
})

/**
 * تزامن الجنس مع التطبيق في ملفّ الزبون: «تحديث» وإعادة الفتح يقرآن من
 * الخادم، فالقيمة الجديدة تحلّ محلّ القديمة ولا تبقى في الذاكرة.
 */
describe('ملفّ الزبون — تزامن الجنس', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const genderCell = () => {
    const label = screen.getByText('الجنس')
    return label.closest('.ant-descriptions-item')! as HTMLElement
  }

  it('[CRITICAL] «تحديث» بعد تغيير الزبون لجنسه يعرض «أنثى» بدل «ذكر»', async () => {
    vi.mocked(getCustomerDetail).mockResolvedValue(detail())
    renderPage()
    await screen.findByText('الجنس')
    expect(within(genderCell()).getByText('ذكر')).toBeInTheDocument()

    vi.mocked(getCustomerDetail).mockResolvedValue(
      detail({ profile: { ...detail().profile, gender: 'female' } }),
    )
    await userEvent.setup().click(screen.getByRole('button', { name: /تحديث/ }))
    await waitFor(() => expect(within(genderCell()).getByText('أنثى')).toBeInTheDocument())
    expect(within(genderCell()).queryByText('ذكر')).not.toBeInTheDocument()
  })

  it('إعادة فتح الملفّ تعيد الجلب من الخادم', async () => {
    const queryClient = createQueryClient({ retry: false })
    vi.mocked(getCustomerDetail).mockResolvedValue(detail())
    const first = renderPage(queryClient)
    await screen.findByText('الجنس')
    const fetchesBefore = vi.mocked(getCustomerDetail).mock.calls.length
    first.unmount()

    vi.mocked(getCustomerDetail).mockResolvedValue(
      detail({ profile: { ...detail().profile, gender: 'female' } }),
    )
    renderPage(queryClient)
    await waitFor(() =>
      expect(vi.mocked(getCustomerDetail).mock.calls.length).toBeGreaterThan(fetchesBefore),
    )
    await waitFor(() => expect(within(genderCell()).getByText('أنثى')).toBeInTheDocument())
  })
})
