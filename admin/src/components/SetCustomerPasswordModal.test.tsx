import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.setConfig({ testTimeout: 30_000 })

vi.mock('../api/customersApi', () => ({ setCustomerPassword: vi.fn() }))

import { setCustomerPassword } from '../api/customersApi'
import { passwordMessage } from '../utils/passwordPolicy'
import SetCustomerPasswordModal from './SetCustomerPasswordModal'

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <SetCustomerPasswordModal open customerId="u1" customerName="Ameer" customerPhone="+9647701234567" onClose={vi.fn()} />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

async function submit(password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByTestId('new-password'), password)
  await user.type(screen.getByTestId('confirm-password'), password)
  await user.click(screen.getByText('حفظ كلمة المرور'))
}

/**
 * المسؤول يضع كلمة مرور **زبون** (STEP 85): سياسة الزبون (٨) لا المسؤول (١٢)،
 * مع الكلمات الشائعة ورقم الزبون واسمه. الرفض هنا قبل الطلب؛ الخادم يفحص ثانيةً.
 */
describe('كلمة مرور الزبون من اللوحة', () => {
  afterEach(() => vi.clearAllMocks())

  it.each([
    ['password123', 'weak'],
    ['11111111', 'weak'],
    ['qwerty123', 'weak'],
    ['k7#mPq2', 'tooShort'],
    ['          ', 'blank'],
    ['x07701234567y', 'containsPhone'],
    ['ameer-river-731', 'containsUsername'],
  ] as const)('«%s» ← %s، ولا طلب', async (password, problem) => {
    renderModal()
    await submit(password)
    expect(await screen.findByText(passwordMessage(problem))).toBeInTheDocument()
    expect(setCustomerPassword).not.toHaveBeenCalled()
  })

  it('عشرة أحرف قوية تكفي للزبون — حدّ المسؤول (١٢) لا ينطبق', async () => {
    vi.mocked(setCustomerPassword).mockResolvedValue({ data: { customerId: 'u1', request: null }, message: 'تم' } as never)
    renderModal()
    await submit('k7#mPq2z-9')
    await waitFor(() => expect(setCustomerPassword).toHaveBeenCalledWith('u1', { newPassword: 'k7#mPq2z-9' }))
    expect(screen.queryByText(passwordMessage('adminTooShort'))).toBeNull()
  })

  it('ما يتجاوز ٧٢ بايتاً يُرفض قبل أن يقتطعه bcrypt', async () => {
    renderModal()
    await submit('قهوة صباحية مع '.repeat(3).slice(0, 40))
    expect(await screen.findByText(passwordMessage('tooLong'))).toBeInTheDocument()
    expect(setCustomerPassword).not.toHaveBeenCalled()
  })
})
