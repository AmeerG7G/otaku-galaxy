import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import LoginPage from './LoginPage'
import { useAuthStore } from '../../stores/authStore'
// الملفات التي يخدمها Vite كما هي — نصّاً.
import indexHtml from '../../../index.html?raw'
import manifest from '../../../public/manifest.webmanifest?raw'

/**
 * هوية اللوحة قبل الدخول: الشعار المعتمد (`otaku-square-mark.png`، نسخة
 * `assets/branding/`) والاسم «مجرة الأوتاكو» — لا شعار Vite الافتراضي ولا عارض
 * صور antd على الشعار.
 */
describe('هوية اللوحة — صفحة الدخول وأيقونة التبويب', () => {
  it('[CRITICAL] صفحة الدخول: الأصل المعتمد والاسم، والنقر على الشعار لا يفتح عارض الصور', async () => {
    useAuthStore.setState({ token: null, user: null })
    const user = userEvent.setup()
    render(
      <ConfigProvider direction="rtl">
        <AntApp>
          <MemoryRouter initialEntries={['/login']}>
            <LoginPage />
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>,
    )
    const logo = screen.getByRole('img', { name: 'مجرة الأوتاكو' })
    expect(logo.getAttribute('src')).toBe('/otaku-square-mark.png')
    expect(screen.getByRole('heading', { name: 'مجرة الأوتاكو' })).toBeTruthy()
    expect(logo.closest('.ant-image')?.querySelector('.ant-image-cover, .ant-image-mask')).toBeNull()
    await user.click(logo)
    expect(document.querySelector('.ant-image-preview, .ant-image-preview-root')).toBeNull()
  })

  it('[CRITICAL] أيقونة التبويب هي الشعار المعتمد — لا favicon.svg (شعار Vite الافتراضي)', () => {
    const doc = new DOMParser().parseFromString(indexHtml, 'text/html')
    const icons = [...doc.querySelectorAll('link[rel~="icon"]')].map((l) => l.getAttribute('href'))
    expect(icons).toEqual(['/otaku-square-mark.png'])
    expect(doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe('/otaku-square-mark.png')
    expect(indexHtml).not.toMatch(/vite\.svg|href="\/favicon\.svg"/)
    expect(doc.title).toBe('لوحة تحكم مجرة الأوتاكو')
  })

  it('بيان التثبيت: الاسم والأيقونة من الهوية نفسها', () => {
    const parsed = JSON.parse(manifest) as { name: string; icons: Array<{ src: string }> }
    expect(parsed.name).toBe('لوحة تحكم مجرة الأوتاكو')
    expect(parsed.icons.map((i) => i.src)).toEqual(['/otaku-square-mark.png'])
  })
})
