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
  it('روابط تيك توك وإنستغرام وواتساب تُحرَّر وتُحفظ من النموذج نفسه', async () => {
    vi.mocked(fetchSettings).mockResolvedValue({
      social_tiktok: 'https://www.tiktok.com/@old',
      social_instagram: 'https://www.instagram.com/old',
      social_whatsapp: '',
      social_description: '',
      store_share_url: '',
    })
    const user = userEvent.setup()
    renderPage()
    const tiktok = await screen.findByDisplayValue('https://www.tiktok.com/@old')
    const form = tiktok.closest('form') as HTMLElement
    const instagram = within(form).getByDisplayValue('https://www.instagram.com/old')
    const whatsapp = within(form).getByPlaceholderText('+9647701234567')

    await user.clear(tiktok)
    await user.type(tiktok, 'https://www.tiktok.com/@otakugalaxy')
    await user.clear(instagram)
    await user.type(instagram, 'https://www.instagram.com/otakugalaxy')
    await user.type(whatsapp, '+9647701234567')
    await user.click(within(form).getByRole('button', { name: /حفظ/ }))

    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateSettings).mock.calls[0][0]).toMatchObject({
      social_tiktok: 'https://www.tiktok.com/@otakugalaxy',
      social_instagram: 'https://www.instagram.com/otakugalaxy',
      social_whatsapp: '+9647701234567',
    })
  })
})
