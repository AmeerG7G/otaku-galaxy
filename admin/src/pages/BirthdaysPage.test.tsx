import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/customersApi', () => ({
  listBirthdayCustomers: vi.fn(),
  listUsers: vi.fn(),
}))
vi.mock('../api/adminAccountsApi', () => ({
  fetchAdminMe: vi.fn(),
}))

import { listBirthdayCustomers } from '../api/customersApi'
import { fetchAdminMe } from '../api/adminAccountsApi'
import { useAuthStore } from '../stores/authStore'
import BirthdaysPage from './BirthdaysPage'
import { DESKTOP, PHONE, setViewportWidth } from '../test/viewport'
import type { BirthdayCustomerList } from '../types/birthdays'

/**
 * أعياد الميلاد — «الخيار الأخير لا يُحفظ» (STEP 64 §15).
 *
 * أُعيد إنتاج البلاغ على المكدّس الحيّ بعرض 375: شريط التبويبات الستّة بعرض
 * 497 داخل محتوى يقصّ الفائض أفقياً، فآخر خيارين («المسجَّلون»، «الكل») خارج
 * الشاشة ولا يُضغطان؛ وكل اختيار يضيع بإعادة التحميل. المرشّحان الآخران (ميلاد
 * ٣١/١٢ من التطبيق، وتفضيل «عيد الميلاد») يُحفظان — انظر
 * `backend/tests/birthday-last-option.test.ts`.
 */

const empty: BirthdayCustomerList = {
  items: [],
  page: 1,
  limit: 20,
  total: 0,
  hasMore: false,
  counts: { registered: 4, missing: 180, today: 0, upcoming: 0, recent: 0, windowDays: 7 },
  timezone: 'Asia/Baghdad',
}

let location: { search: string } = { search: '' }
function LocationProbe() {
  location = useLocation()
  return null
}

function renderPage(entry = '/birthdays') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <MemoryRouter initialEntries={[entry]}>
            <BirthdaysPage />
            <LocationProbe />
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

const lastCall = () => vi.mocked(listBirthdayCustomers).mock.calls.at(-1)![0]

describe('أعياد الميلاد — كل خيار في المتناول ويبقى بعد إعادة التحميل', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ token: null, user: null })
    vi.mocked(listBirthdayCustomers).mockResolvedValue(empty)
  })

  afterEach(() => setViewportWidth(PHONE))

  /** الخيارات الستّة كما تظهر في الشريط — بالترتيب. */
  const tabOptions = () =>
    [...document.querySelectorAll('[aria-label="مجموعة أعياد الميلاد"] .ant-segmented-item')].map((el) => el.textContent)
  const SIX = ['أعياد اليوم', 'أعياد قادمة', 'أعياد مؤخّراً', 'لم يسجّل ميلاده', 'المسجَّلون', 'الكل']

  /**
   * [STEP 66] «لم يسجّل ميلاده خارج الشاشة». القرار كان بعرض الشاشة
   * (`screens.md`) لا بالعرض المتاح، فالشريط غير الملتفّ يخرج من بطاقةٍ أضيق
   * منه ويُقصّ. الآن شريطٌ واحد بكل العروض، يلتفّ داخل بطاقته. jsdom لا يرسم،
   * فالتخطيط الفعلي تحقّقٌ في المتصفّح؛ هنا العقد: الخيارات الستة كلها في
   * الشريط نفسه، بصنف الالتفاف، وكلٌّ منها يُختار ويُرسَل ويُكتب في الرابط.
   */
  for (const [name, width] of [['الهاتف', PHONE], ['الشاشة العريضة', DESKTOP]] as const) {
    it(`[regression] ${name}: الخيارات الستّة ظاهرة معاً في شريطٍ يلتفّ — «لم يسجّل ميلاده» و«الكل» تُختاران`, async () => {
      setViewportWidth(width)
      const user = userEvent.setup()
      renderPage()
      await waitFor(() => expect(listBirthdayCustomers).toHaveBeenCalled())

      expect(tabOptions()).toEqual(SIX)
      const bar = document.querySelector('[aria-label="مجموعة أعياد الميلاد"]')!
      expect(bar.classList.contains('og-segmented-wrap')).toBe(true)
      // لا قائمة منسدلة تُخفي الخيارات خلف نقرة.
      expect(screen.queryByRole('combobox', { name: 'مجموعة أعياد الميلاد' })).toBeNull()

      await user.click(screen.getByText('لم يسجّل ميلاده'))
      await waitFor(() => expect(lastCall()).toMatchObject({ filter: 'missing', page: 1 }))
      expect(location.search).toContain('tab=missing')

      await user.click(screen.getByText('الكل'))
      await waitFor(() => expect(lastCall()).toMatchObject({ filter: 'all', page: 1 }))
      expect(location.search).toContain('tab=all')
    })
  }

  it('[regression] «إعادة التحميل»: الرابط يعيد التبويب والنافذة والصفحة كما اختيرت', async () => {
    renderPage('/birthdays?tab=upcoming&window=30&page=2')
    await waitFor(() => expect(lastCall()).toEqual({ filter: 'upcoming', windowDays: 30, page: 2, limit: 20 }))
    const selected = document.querySelectorAll('.ant-segmented-item-selected')
    expect([...selected].map((el) => el.textContent)).toContain('٣٠ يوماً')
  })

  it('قيمٌ فاسدة في الرابط تعود إلى الافتراضي لا ترسل طلباً فاسداً', async () => {
    renderPage('/birthdays?tab=everything&window=9999&page=-3')
    await waitFor(() => expect(lastCall()).toMatchObject({ filter: 'today', windowDays: 7, page: 1 }))
  })

  it('الشاشة العريضة: شريط التبويبات كما كان، والنافذة ٣٠ تُكتب في الرابط', async () => {
    setViewportWidth(DESKTOP)
    const user = userEvent.setup()
    renderPage('/birthdays?tab=recent')
    await waitFor(() => expect(listBirthdayCustomers).toHaveBeenCalled())
    await user.click(screen.getByText('٣٠ يوماً'))
    await waitFor(() => expect(lastCall()).toMatchObject({ filter: 'recent', windowDays: 30 }))
    expect(location.search).toContain('window=30')
    await user.click(screen.getByText('الكل'))
    await waitFor(() => expect(lastCall()).toMatchObject({ filter: 'all' }))
  })

  it('لا صندوق معلومات («لا إرسال تلقائي…») — STEP 64 §2', async () => {
    renderPage()
    await waitFor(() => expect(listBirthdayCustomers).toHaveBeenCalled())
    expect(document.body.textContent).not.toContain('لا إرسال تلقائي')
    expect(document.querySelector('.ant-alert-info')).toBeNull()
  })

  it('زرّ «إشعار لهذه المجموعة» لمن يملك «الإشعارات» وحده', async () => {
    renderPage()
    await waitFor(() => expect(listBirthdayCustomers).toHaveBeenCalled())
    expect(screen.queryByText('إشعار لهذه المجموعة')).toBeNull()

    useAuthStore.setState({ token: 't', user: null })
    vi.mocked(fetchAdminMe).mockResolvedValue({ id: 'a', username: 'م', phone: '+9647800000001', isSuperAdmin: false, permissions: ['birthdays', 'notifications'] })
    renderPage()
    expect(await screen.findByText('إشعار لهذه المجموعة')).toBeInTheDocument()
  })
})
