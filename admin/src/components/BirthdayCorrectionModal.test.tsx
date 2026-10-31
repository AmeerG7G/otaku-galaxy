import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.setConfig({ testTimeout: 30_000 })

vi.mock('../api/customersApi', () => ({ correctCustomerBirthday: vi.fn() }))

import { correctCustomerBirthday } from '../api/customersApi'
import BirthdayCorrectionModal from './BirthdayCorrectionModal'

function renderModal(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <BirthdayCorrectionModal open customerId="c1" customerName="أمير" day={5} month={6} onClose={onClose} />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
  return onClose
}

afterEach(() => vi.clearAllMocks())

describe('تصحيح تاريخ الميلاد (STEP 76 D1)', () => {
  it('starts from the saved date and will not send without a reason', async () => {
    renderModal()
    expect(await screen.findByText('تصحيح تاريخ الميلاد — أمير')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('يونيو')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'حفظ التصحيح' }))
    expect(await screen.findByText('اكتب سبب التصحيح')).toBeInTheDocument()
    expect(correctCustomerBirthday).not.toHaveBeenCalled()
  })

  it('sends the day, month and trimmed reason, then closes', async () => {
    vi.mocked(correctCustomerBirthday).mockResolvedValue({ id: 'c1', day: 5, month: 6, changed: true })
    const onClose = renderModal()
    await userEvent.type(await screen.findByTestId('birthday-reason'), '  خطأ في الشهر  ')
    await userEvent.click(screen.getByRole('button', { name: 'حفظ التصحيح' }))
    await waitFor(() =>
      expect(correctCustomerBirthday).toHaveBeenCalledWith('c1', { day: 5, month: 6, reason: 'خطأ في الشهر' }),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows the server error and stays open', async () => {
    const { ApiError } = await import('../api/client')
    vi.mocked(correctCustomerBirthday).mockRejectedValue(new ApiError('تاريخ غير صالح', 422, 'VALIDATION_ERROR'))
    const onClose = renderModal()
    await userEvent.type(await screen.findByTestId('birthday-reason'), 'تصحيح')
    await userEvent.click(screen.getByRole('button', { name: 'حفظ التصحيح' }))
    expect(await screen.findByText('تاريخ غير صالح')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
