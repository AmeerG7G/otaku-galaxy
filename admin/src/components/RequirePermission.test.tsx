import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/adminAccountsApi', () => ({ fetchAdminMe: vi.fn() }))

import { fetchAdminMe } from '../api/adminAccountsApi'
import { useAuthStore } from '../stores/authStore'
import RequirePermission from './RequirePermission'
import type { AdminProfile } from '../types/adminPermissions'

const profile = (over: Partial<AdminProfile>): AdminProfile => ({
  id: 'a1',
  username: 'مسؤول',
  phone: '+9647800000001',
  isSuperAdmin: false,
  permissions: [],
  ...over,
})

function renderGuard(section: Parameters<typeof RequirePermission>[0]['section']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RequirePermission section={section}>
          <div>محتوى الصفحة</div>
        </RequirePermission>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** حاجز الصفحة (STEP 64) — رابطٌ مباشر إلى قسمٍ لا يملكه المسؤول يرى 403. */
describe('RequirePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ token: 't', user: null })
  })

  it('يعرض الصفحة لمن يملك القسم', async () => {
    vi.mocked(fetchAdminMe).mockResolvedValue(profile({ permissions: ['orders'] }))
    renderGuard('orders')
    expect(await screen.findByText('محتوى الصفحة')).toBeInTheDocument()
  })

  it('يعرض «لا تملك صلاحية» ورابط أول قسمٍ متاح لمن لا يملكه', async () => {
    vi.mocked(fetchAdminMe).mockResolvedValue(profile({ permissions: ['reviews'] }))
    renderGuard('settings')
    expect(await screen.findByText('لا تملك صلاحية هذا القسم')).toBeInTheDocument()
    expect(screen.queryByText('محتوى الصفحة')).not.toBeInTheDocument()
    expect(screen.getByText('الانتقال إلى قسمٍ متاح').closest('a')).toHaveAttribute('href', '/reviews')
  })

  it('المسؤول الأعلى يعبر كل حاجز', async () => {
    vi.mocked(fetchAdminMe).mockResolvedValue(profile({ isSuperAdmin: true }))
    renderGuard('admins')
    expect(await screen.findByText('محتوى الصفحة')).toBeInTheDocument()
  })
})
