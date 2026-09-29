import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/communityApi', () => ({ fetchSettings: vi.fn(), updateSettings: vi.fn() }))
vi.mock('../api/appVersionApi', () => ({ fetchAppVersionSettings: vi.fn(), updateAppVersionSettings: vi.fn() }))

import { fetchSettings, updateSettings } from '../api/communityApi'
import { fetchAppVersionSettings, updateAppVersionSettings } from '../api/appVersionApi'
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

/** الإعدادات (STEP 64 §16/§19) — إجبار تحديثٍ بثلاثة حقول، ورابط مشاركة. */
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
    vi.mocked(fetchAppVersionSettings).mockResolvedValue({ enabled: false, minimumVersion: '1.0.0', updateUrl: 'https://example.com/app' })
    vi.mocked(updateAppVersionSettings).mockImplementation(async (v) => v)
    vi.mocked(updateSettings).mockResolvedValue({} as never)
  })

  it('بطاقة إجبار التحديث: ثلاثة حقول فقط — لا رسائل ولا رابطا متجرين ولا «أحدث نسخة»', async () => {
    renderPage()
    await screen.findByText('الحدّ الأدنى للنسخة')
    const update = card('الحدّ الأدنى للنسخة')
    expect(within(update).getByText('رابط التحديث')).toBeInTheDocument()
    for (const gone of ['أحدث نسخة متوفّرة', 'رابط متجر أندرويد', 'رابط متجر آبل', 'رسالة التحديث']) {
      expect(screen.queryByText(gone)).toBeNull()
    }
    // لا صندوق تحذير دائم — صار تأكيداً عند التفعيل.
    expect(document.querySelector('.ant-alert-warning')).toBeNull()
  })

  it('[CRITICAL] التفعيل يطلب تأكيداً صريحاً ثم يرسل الحقول الثلاثة', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('الحدّ الأدنى للنسخة')
    const update = card('الحدّ الأدنى للنسخة')
    await user.click(within(update).getByRole('switch'))
    await user.click(within(update).getByText('حفظ'))
    expect((await screen.findAllByText('تفعيل إجبار التحديث؟')).length).toBeGreaterThan(0)
    expect(updateAppVersionSettings).not.toHaveBeenCalled()
    await user.click(screen.getByText('تفعيل'))
    await waitFor(() =>
      expect(updateAppVersionSettings).toHaveBeenCalledWith({ enabled: true, minimumVersion: '1.0.0', updateUrl: 'https://example.com/app' }),
    )
  })

  it('التفعيل بلا رابط يُرفض قبل الإرسال', async () => {
    vi.mocked(fetchAppVersionSettings).mockResolvedValue({ enabled: false, minimumVersion: '1.0.0', updateUrl: '' })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('الحدّ الأدنى للنسخة')
    const update = card('الحدّ الأدنى للنسخة')
    await user.click(within(update).getByRole('switch'))
    await user.click(within(update).getByText('حفظ'))
    expect(await screen.findByText('أدخل رابط التحديث قبل التفعيل')).toBeInTheDocument()
    expect(updateAppVersionSettings).not.toHaveBeenCalled()
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
