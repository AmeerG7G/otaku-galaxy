import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.setConfig({ testTimeout: 30_000 })

vi.mock('../api/notificationsApi', () => ({
  broadcastNotification: vi.fn(),
  previewAudience: vi.fn(),
}))
vi.mock('../api/customersApi', () => ({ listCustomers: vi.fn() }))

import { broadcastNotification, previewAudience } from '../api/notificationsApi'
import BroadcastComposer from './BroadcastComposer'

function renderComposer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <BroadcastComposer open onClose={() => {}} />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.clearAllMocks())

describe('مؤلّف البثّ — مفتاح عدم التكرار (CA-7)', () => {
  it('[CRITICAL] إعادة المحاولة بعد فشل ترسل المفتاح نفسه، والنجاح يجدّده', async () => {
    vi.mocked(previewAudience).mockResolvedValue({ recipients: 5 })
    vi.mocked(broadcastNotification)
      .mockRejectedValueOnce(new Error('تعذر الاتصال بالخادم — تحقق من الشبكة ثم أعد المحاولة'))
      .mockResolvedValue({ recipients: 5, push: { provider: 'fcm', queued: 5 }, campaignId: 'c1', replayed: false })
    renderComposer()
    await userEvent.type(screen.getByPlaceholderText('عرض خاص لنهاية الأسبوع'), 'عرض')
    // antd يعيد إنشاء الزرّ بين حالتَي التحميل — يُقرأ من جديد في كل مرة.
    const send = () => screen.getByRole('button', { name: /إرسال/ })
    await waitFor(() => expect(send()).toBeEnabled())

    await userEvent.click(send())
    await waitFor(() => expect(broadcastNotification).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(send()).toBeEnabled())
    await userEvent.click(send())
    await waitFor(() => expect(broadcastNotification).toHaveBeenCalledTimes(2))

    const [first, second] = vi.mocked(broadcastNotification).mock.calls
    expect(first![1]).toMatch(/^[0-9a-f-]{36}$/)
    expect(second![1]).toBe(first![1])
  })

  it('بثٌّ أُعيد بالمفتاح نفسه يُبلَّغ أنه لم يُكرَّر', async () => {
    vi.mocked(previewAudience).mockResolvedValue({ recipients: 2 })
    vi.mocked(broadcastNotification).mockResolvedValue({ recipients: 2, push: { provider: 'fcm', queued: 0 }, campaignId: 'c1', replayed: true })
    renderComposer()
    await userEvent.type(screen.getByPlaceholderText('عرض خاص لنهاية الأسبوع'), 'عرض')
    const send = () => screen.getByRole('button', { name: /إرسال/ })
    await waitFor(() => expect(send()).toBeEnabled())
    await userEvent.click(send())
    expect(await screen.findByText('هذا البثّ أُرسل مسبقاً — لم يُكرَّر')).toBeInTheDocument()
  })
})
