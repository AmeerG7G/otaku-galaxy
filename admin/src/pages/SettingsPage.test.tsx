import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/communityApi', () => ({ fetchSettings: vi.fn(), updateSettings: vi.fn() }))

import { fetchSettings, updateSettings } from '../api/communityApi'
import SettingsPage from './SettingsPage'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <SettingsPage />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

const card = (title: string) => screen.getByText(title).closest('.ant-card') as HTMLElement

/** الإعدادات (STEP 64 §19) — رابط المشاركة. إجبار التحديث صار صفحة «تحديث التطبيق» (STEP 70). */
describe('إعدادات المتجر', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchSettings).mockResolvedValue({
      social_tiktok: '',
      social_instagram: '',
      social_whatsapp: '',
      social_description: '',
      store_share_url: 'https://otakugalaxystore.com',
    })
    vi.mocked(updateSettings).mockResolvedValue({} as never)
  })

  it('لا بطاقة إجبار تحديث هنا — انتقلت إلى «تحديث التطبيق»', async () => {
    renderPage()
    await screen.findByDisplayValue('https://otakugalaxystore.com')
    expect(screen.queryByText('إجبار التحديث')).toBeNull()
    expect(screen.queryByText('الحدّ الأدنى للنسخة')).toBeNull()
  })

  it('رابط المشاركة يُحفظ وحده عبر إعدادات المتجر', async () => {
    const user = userEvent.setup()
    renderPage()
    const input = await screen.findByDisplayValue('https://otakugalaxystore.com')
    await user.clear(input)
    await user.type(input, 'https://otakugalaxystore.com/app')
    await user.click(within(card('رابط المتجر للمشاركة')).getByText('حفظ'))
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ store_share_url: 'https://otakugalaxystore.com/app' }))
  })
})
