import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReminderControls } from './ReminderControls'
import { MediaThumb } from './MediaThumb'
import type { AdminOrder } from '../../types/orders'

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider direction="rtl">
        <AntApp>{ui}</AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

const unsentOrder = {
  id: 'order-1',
  number: '1001',
  dispatchedAt: '2026-08-01T10:00:00Z',
  deliveredAt: null,
  ratingAvailableAt: '2026-08-02T10:00:00Z',
  ratingAvailable: false,
  ratingReminderSentAt: null,
} as AdminOrder

const sentOrder = {
  ...unsentOrder,
  ratingReminderSentAt: '2026-08-02T10:00:00Z',
} as AdminOrder

describe('ReminderControls', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('الوضع المضمّن يعرض المهلات المسبقة وزر «إرسال الإشعار الآن»', () => {
    renderWithProviders(<ReminderControls order={unsentOrder} />)
    expect(screen.getByRole('button', { name: '1 ساعة' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '48 ساعة' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إرسال الإشعار الآن' })).toBeInTheDocument()
  })

  it('الطلب المرسل له يتعطّل ويَظهر «أُرسل التذكير للعميل»', () => {
    renderWithProviders(<ReminderControls order={sentOrder} />)
    expect(screen.getByText(/أُرسل التذكير للعميل/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1 ساعة' })).not.toBeInTheDocument()
  })

  it('إرسال الآن يتطلب تأكيداً (Popconfirm) — لا إرسال مباشر', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReminderControls order={unsentOrder} />)
    await user.click(screen.getByRole('button', { name: 'إرسال الإشعار الآن' }))
    await waitFor(() => {
      expect(screen.getByText('إرسال الإشعار الآن؟')).toBeInTheDocument()
    })
  })
})

describe('MediaThumb', () => {
  it('يكمل المسار النسبي ويضبط alt', () => {
    renderWithProviders(<MediaThumb reference="/uploads/x.jpg" alt="منتج تجريبي" />)
    const img = screen.getByAltText('منتج تجريبي') as HTMLImageElement
    expect(img.src).toContain('/uploads/x.jpg')
  })

  it('يسقط إلى الصورة البديلة عندما لا يوجد مرجع', () => {
    renderWithProviders(<MediaThumb reference={null} />)
    const img = screen.getByAltText('صورة') as HTMLImageElement
    expect(img.src.startsWith('data:image/svg+xml')).toBe(true)
  })
})