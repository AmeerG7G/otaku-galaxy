import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.setConfig({ testTimeout: 30_000 })

vi.mock('../api/notificationsApi', () => ({ listCampaigns: vi.fn(), getCampaign: vi.fn() }))

import { getCampaign, listCampaigns } from '../api/notificationsApi'
import type { Campaign } from '../types/notifications'
import NotificationCampaigns from './NotificationCampaigns'

const campaign: Campaign = {
  id: 'c1',
  kind: 'broadcast',
  title: 'عرض الجمعة',
  body: 'نص',
  audience: { type: 'segment', segment: 'birthday_upcoming', windowDays: 7, userCount: null },
  recipients: 12,
  createdAt: '2026-10-01T10:00:00Z',
  createdByName: 'مدير المتجر',
  frozen: false,
  push: {
    pending: 0,
    acceptedByFcm: 9,
    failed: 1,
    skippedNotConfigured: 0,
    skippedPreference: 2,
    skippedNoDevices: 0,
    devicesAcceptedByFcm: 11,
    devicesInvalid: 1,
  },
  readInApp: 4,
  openedFromPush: 3,
}

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <NotificationCampaigns />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.clearAllMocks())

describe('سجلّ الحملات', () => {
  it('[CRITICAL] الأعداد بمصطلحاتٍ دقيقة — «مقبولة لدى FCM» لا «وصلت» — ووصف الجمهور بلا مستلمين', async () => {
    vi.mocked(listCampaigns).mockResolvedValue({ items: [campaign], total: 1, page: 1, limit: 10 })
    vi.mocked(getCampaign).mockResolvedValue(campaign)
    renderList()
    expect(await screen.findByText('عرض الجمعة')).toBeInTheDocument()
    expect(screen.getAllByText(/مقبولة لدى FCM/).length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/وصلت|delivered/)

    // على الهاتف (jsdom) الصفّ بطاقةٌ تُفتح بالنقر؛ على الحاسوب زرّ «التفاصيل».
    await userEvent.click(screen.getByText('عرض الجمعة'))
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('أجهزة قبلتها FCM')).toBeInTheDocument()
    expect(within(drawer).getByText('تُخطّيت — أطفأها الزبون')).toBeInTheDocument()
    expect(within(drawer).getByText('فُتحت بالنقر')).toBeInTheDocument()
    expect(within(drawer).getByText(/أعياد قريبة|7 يوماً/)).toBeInTheDocument()
  })

  it('بلا حملات: حالةٌ فارغة', async () => {
    vi.mocked(listCampaigns).mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 })
    renderList()
    expect(await screen.findByText('لا حملات بعد')).toBeInTheDocument()
  })
})
