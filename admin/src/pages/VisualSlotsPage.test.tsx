import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// انظر التعليق نفسه في `OffersPage.test.tsx`: مهلة أوسع لجداول antd في jsdom.
vi.setConfig({ testTimeout: 20_000 })
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../queryClient'

vi.mock('../api/visualsApi', () => ({
  listVisualSlots: vi.fn(),
  setSlotImage: vi.fn(),
  clearSlotImage: vi.fn(),
  setSlotTemporaryImage: vi.fn(),
  clearSlotTemporaryImage: vi.fn(),
}))
vi.mock('../api/uploadsApi', () => ({ uploadImage: vi.fn() }))

import dayjs from 'dayjs'
import {
  clearSlotImage,
  clearSlotTemporaryImage,
  listVisualSlots,
  setSlotImage,
  setSlotTemporaryImage,
} from '../api/visualsApi'
import { uploadImage } from '../api/uploadsApi'
import VisualSlotsPage from './VisualSlotsPage'
import { GROUP_LABELS } from '../types/visuals'
import type { VisualSlot } from '../types/visuals'
import { resolveMediaUrl } from '../utils/media'

/**
 * رسوم الشخصيات: موضعٌ واحد = فتحةٌ واحدة = صورةٌ فعّالة واحدة.
 *
 * ما تحرسه هذه الاختبارات: اللوحة مرآةٌ للقاعدة (كل فتحة يرسلها الخادم
 * تظهر — ولا فتحة غيرها)؛ تُجمَّع بمناطق التطبيق وبترتيب رحلة الزبون؛ لكل
 * صفٍّ صورةٌ فعّالة واحدة أو «مضمَّن» كما حسبها الخادم؛ الدائمة والمؤقّتة
 * مساران لا يطمس أحدهما الآخر؛ ولا أثر لأدوات التدوير والقوائم والإنشاء
 * والحذف التي أُزيلت بالهجرة ٠٥٤.
 */
function slot(overrides: Partial<VisualSlot> = {}): VisualSlot {
  const imageUrl = overrides.imageUrl ?? null
  const temporaryImageUrl = overrides.temporaryImageUrl ?? null
  // الفعّالة كما يحسبها الخادم — الاختبار يكرّر القاعدة كي يغذّي اللوحة لا ليختبرها.
  const activeImageUrl = temporaryImageUrl ?? imageUrl
  const activeMode = temporaryImageUrl ? 'temporary' : imageUrl ? 'permanent' : 'bundled'
  return {
    id: 's',
    slotKey: 'slot_key',
    label: '',
    location: '',
    groupKey: 'other',
    sortOrder: 0,
    imageUrl,
    mediaId: null,
    temporaryImageUrl,
    temporaryMediaId: null,
    temporaryUntil: null,
    activeImageUrl,
    activeMode,
    updatedAt: '2026-09-20T00:00:00.000Z',
    ...overrides,
  }
}

/** لحظة انتهاء في المستقبل — بعد ثلاثة أيام من الآن. */
const UNTIL = dayjs().add(3, 'day').endOf('day').toISOString()

/**
 * منطقة المتجر كما يعلنها الخادم — بعيدةٌ عمداً عن بغداد وعن جهاز الاختبار
 * (+14): نهاية اليوم فيها لا تساوي نهايته بتوقيت المتصفح، فيُكشف أي حسابٍ
 * بتوقيت الجهاز.
 */
const STORE_TIMEZONE = 'Pacific/Kiritimati'

/** أربع فتحات تغطّي الحالات: بلا صورة، بصورة، مجموعة مجهولة، وفتحتا تجزئة. */
const FIXTURE: VisualSlot[] = [
  slot({
    id: 's-login',
    slotKey: 'login_character',
    label: 'شخصية تسجيل الدخول',
    location: 'شاشة تسجيل الدخول — الترويسة',
    groupKey: 'auth',
  }),
  slot({
    id: 's-login-cta',
    slotKey: 'login_cta_character',
    label: 'شخصية زاوية بطاقة تسجيل الدخول',
    location: 'شاشة تسجيل الدخول — زاوية بطاقة النموذج فوق زر الإجراء',
    groupKey: 'auth',
    sortOrder: 1,
  }),
  slot({
    id: 's-hero',
    slotKey: 'home_hero_character',
    label: 'شخصية اللوحة الرئيسية',
    location: 'الرئيسية — اللوحة العلوية الكبيرة',
    groupKey: 'home',
    imageUrl: '/uploads/slot/hero.png',
    mediaId: 'm-hero',
  }),
  slot({
    id: 's-cart-guest',
    slotKey: 'cart_guest_prompt_character',
    label: 'شخصية دعوة الزائر — السلة',
    location: 'تبويب السلة — بطاقة دعوة الزائر لتسجيل الدخول',
    groupKey: 'shopping',
  }),
  slot({
    id: 's-ghost',
    slotKey: 'mystery_character',
    label: 'فتحة بمجموعة لا تعرفها اللوحة',
    location: 'موضع جديد',
    groupKey: 'mystery',
  }),
  // دائمة يحجبها مؤقّتة سارية.
  slot({
    id: 's-search',
    slotKey: 'empty_search_character',
    label: 'شخصية نتائج البحث الفارغة',
    location: 'شاشة البحث — حين لا نتائج',
    groupKey: 'search',
    imageUrl: '/uploads/slot/search-permanent.png',
    mediaId: 'm-search',
    temporaryImageUrl: '/uploads/slot/search-temporary.png',
    temporaryMediaId: 'm-search-temp',
    temporaryUntil: UNTIL,
  }),
  slot({
    id: 's-offline',
    slotKey: 'offline_gate_character',
    label: 'شخصية عدم الاتصال بالإنترنت',
    location: 'شاشة انقطاع الاتصال — الرسم أعلى اللوحة (تُعرض حين لا إنترنت)',
    groupKey: 'connectivity',
  }),
]

/** ردّ القائمة كما يرسله الخادم: الفتحات ومنطقة المتجر. */
const LIST = { items: FIXTURE, timezone: STORE_TIMEZONE }

function renderPage(client = createQueryClient({ retry: false })) {
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <VisualSlotsPage />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

async function rowOf(slotKey: string) {
  return (await screen.findByText(slotKey)).closest('tr')!
}

/** الصفوف داخل جداول الفتحات وحدها — جدول الأصول الثابتة فوقها ليس فتحات. */
const slotRows = () => document.querySelectorAll('.ant-collapse tbody tr.ant-table-row')

describe('اللوحة مرآة للفهرس — صورة فعّالة واحدة لكل موضع', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listVisualSlots).mockResolvedValue(LIST)
  })

  it('كل فتحة يرسلها الخادم تظهر بمفتاحها وموضعها — ولا فتحة غيرها', async () => {
    renderPage()
    for (const item of FIXTURE) {
      const row = await rowOf(item.slotKey)
      expect(within(row).getByText(item.label)).toBeInTheDocument()
      expect(within(row).getByText(item.location)).toBeInTheDocument()
    }
    // لا صفّ من ذاكرة الصفحة: فتحةٌ حُذفت أو جُزّئت في القاعدة لا تظهر هنا.
    for (const retired of ['otp_character', 'auth_cta_character', 'guest_prompt_character']) {
      expect(screen.queryByText(retired)).not.toBeInTheDocument()
    }
    expect(slotRows()).toHaveLength(FIXTURE.length)
    expect(listVisualSlots).toHaveBeenCalledTimes(1)
  })

  it('التجميع بمناطق التطبيق وبترتيب رحلة الزبون، والمجموعة المجهولة آخراً بمفتاحها لا مخفيّة', async () => {
    renderPage()
    await rowOf('login_character')
    const headers = [...document.querySelectorAll('.ant-collapse-header')].map(
      (header) => header.querySelector('strong')?.textContent,
    )
    expect(headers).toEqual([
      GROUP_LABELS.auth,
      GROUP_LABELS.home,
      GROUP_LABELS.shopping,
      GROUP_LABELS.search,
      GROUP_LABELS.connectivity,
      'mystery',
    ])
  })

  it('العدّاد في الترويسة يُحسب من حمولة الخادم: موضعان لهما صورة من سبعة، أحدهما مؤقّت', async () => {
    renderPage()
    expect(await screen.findByText(/2 من 7 موضعاً له صورة حالياً، منها 1 بصورة مؤقّتة/)).toBeInTheDocument()
  })

  it('[CRITICAL] الصورة الحالية هي صورة الفتحة نفسها؛ الفتحة بلا صورة ⇒ «مضمَّن» ولا صورة', async () => {
    renderPage()
    const hero = await rowOf('home_hero_character')
    const imgs = hero.querySelectorAll('img')
    expect(imgs).toHaveLength(1)
    expect(imgs[0]).toHaveAttribute('src', resolveMediaUrl('/uploads/slot/hero.png'))
    expect(within(hero).getByText('صورة دائمة')).toBeInTheDocument()
    expect(within(hero).queryByText('مضمَّن')).not.toBeInTheDocument()
    expect(within(hero).queryByText(/مؤقّتة/)).not.toBeInTheDocument()

    for (const slotKey of ['login_character', 'login_cta_character', 'cart_guest_prompt_character', 'offline_gate_character']) {
      const row = await rowOf(slotKey)
      expect(within(row).getByText('مضمَّن')).toBeInTheDocument()
      expect(within(row).getByText('الرسم المضمَّن')).toBeInTheDocument()
      expect(row.querySelector('img')).toBeNull()
    }
  })

  it('[CRITICAL] مؤقّتةٌ سارية: الصفّ يعرض المؤقّتة لا الدائمة، ويقول حتى متى وإلامَ يعود', async () => {
    renderPage()
    const row = await rowOf('empty_search_character')
    const imgs = row.querySelectorAll('img')
    expect(imgs).toHaveLength(1)
    expect(imgs[0]).toHaveAttribute('src', resolveMediaUrl('/uploads/slot/search-temporary.png'))
    expect(within(row).getByText(/^مؤقّتة حتى /)).toBeInTheDocument()
    expect(within(row).getByText('ثم تعود الصورة الدائمة تلقائياً')).toBeInTheDocument()
    expect(within(row).queryByText('صورة دائمة')).not.toBeInTheDocument()
  })

  it('شاشة انقطاع الاتصال فتحةٌ قابلة للتغيير في مجموعتها — لا في جدول الأصول الثابتة', async () => {
    renderPage()
    const row = await rowOf('offline_gate_character')
    expect(within(row).getByText('شخصية عدم الاتصال بالإنترنت')).toBeInTheDocument()
    expect(within(row).getByText('شخصية قابلة للتغيير')).toBeInTheDocument()
    const fixed = screen.getByTestId('fixed-assets')
    expect(fixed.textContent).not.toMatch(/انقطاع الاتصال/)
  })

  it('كل صفّ شخصيةٌ قابلة للتغيير بإجراءٍ واحد: استبدال إن كانت لها صورة، رفع إن لم تكن', async () => {
    renderPage()
    for (const item of FIXTURE) {
      const row = await rowOf(item.slotKey)
      expect(within(row).getByText('شخصية قابلة للتغيير')).toBeInTheDocument()
      // زرّ الإجراء الوحيد (استعلام DOM مباشر: شجرة الأدوار في jsdom بطيئة).
      const actions = [...row.querySelectorAll('button')].filter((b) =>
        /استبدال الصورة|رفع صورة|إزالة|حذف|إضافة|أعلى|أسفل/.test(b.textContent ?? ''),
      )
      expect(actions).toHaveLength(1)
      expect(actions[0]).toHaveTextContent(item.activeImageUrl ? 'استبدال الصورة' : 'رفع صورة')
    }
  })

  it('[CRITICAL] لا أدوات تدوير ولا قوائم صور ولا إنشاء أو حذف فتحات — أُزيلت كلّها', async () => {
    renderPage()
    await rowOf('login_character')
    for (const gone of [
      'فتحة جديدة',
      'حذف الفتحة',
      'التدوير',
      'ثابتة',
      'يومية',
      'إضافة صورة',
      'مجموعة التدوير',
      'إدارة الصور',
      'نشطة',
      'موقوفة',
      'مفعّلة',
    ]) {
      expect(screen.queryByText(gone), gone).not.toBeInTheDocument()
    }
    expect(document.querySelector('[role="switch"], .ant-switch')).toBeNull()
    expect(document.querySelector('.ant-segmented')).toBeNull()
    // لا اختيار «دائمة/مؤقّتة» في الجدول نفسه — في الدرج وحده عند الرفع.
    expect(document.querySelector('.ant-radio-group')).toBeNull()
    expect([...document.querySelectorAll('button')].some((b) => /أعلى|أسفل/.test(b.getAttribute('title') ?? b.textContent ?? ''))).toBe(false)
  })
})

describe('الاستبدال والإزالة من الدرج', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listVisualSlots).mockResolvedValue(LIST)
  })

  async function openDrawer(slotKey: string) {
    const row = await rowOf(slotKey)
    fireEvent.click(
      [...row.querySelectorAll('button')].find((b) => /استبدال الصورة|رفع صورة/.test(b.textContent ?? ''))!,
    )
    return (await screen.findByText(/ما يظهر للزبون الآن/)).closest('.ant-drawer') as HTMLElement
  }

  const fileInput = (drawer: HTMLElement) => drawer.querySelector('input[type="file"]') as HTMLInputElement
  const png = (name: string) => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' })

  /** يختار يوماً في منتقي التاريخ بالكتابة — كما يفعل المسؤول من لوحة المفاتيح. */
  async function pickDay(drawer: HTMLElement, day: string) {
    const input = drawer.querySelector('.ant-picker input') as HTMLInputElement
    fireEvent.mouseDown(input)
    fireEvent.change(input, { target: { value: day } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
  }

  it('[CRITICAL] الرفع يستبدل الدائمة: رفعٌ بغرض «slot» ثم PUT على صورة الفتحة — لا إضافة إلى قائمة ولا مؤقّتة', async () => {
    vi.mocked(uploadImage).mockResolvedValue('/uploads/slot/new.png')
    vi.mocked(setSlotImage).mockResolvedValue(FIXTURE[2]!)
    renderPage()
    const drawer = await openDrawer('home_hero_character')
    expect(within(drawer).getByText('استبدال الصورة الدائمة')).toBeInTheDocument()
    // الوضع الافتراضي «صورة دائمة» — لا منتقي تاريخ.
    expect(drawer.querySelector('.ant-picker')).toBeNull()

    await userEvent.upload(fileInput(drawer), png('hero2.png'))

    await waitFor(() => expect(setSlotImage).toHaveBeenCalledTimes(1))
    expect(uploadImage).toHaveBeenCalledWith(expect.any(File), 'slot')
    expect(setSlotImage).toHaveBeenCalledWith('s-hero', '/uploads/slot/new.png')
    expect(setSlotTemporaryImage).not.toHaveBeenCalled()
    expect(clearSlotImage).not.toHaveBeenCalled()
  })

  it('الفتحة بلا صورة: الدرج يعرض «الرسم المضمَّن» ورفعاً — ولا زرّ إزالة ولا مؤقّتة', async () => {
    renderPage()
    const drawer = await openDrawer('login_character')
    expect(within(drawer).getByText('لم تُرفع صورة لهذا الموضع بعد.')).toBeInTheDocument()
    expect(within(screen.getByTestId('active-now')).getByText('الرسم المضمَّن')).toBeInTheDocument()
    expect(within(drawer).getByText('رفع صورة دائمة لهذا الموضع')).toBeInTheDocument()
    expect(within(drawer).queryByText(/إزالة الصورة/)).not.toBeInTheDocument()
    expect(within(drawer).queryByText(/إنهاء الصورة المؤقّتة/)).not.toBeInTheDocument()
    expect(within(drawer).queryByText(/إضافة صورة|التدوير|حذف الفتحة/)).not.toBeInTheDocument()
  })

  it('[CRITICAL] الإزالة تستدعي DELETE على الصورة الدائمة بعد التأكيد — لا حذف فتحة ولا صورة أخرى', async () => {
    vi.mocked(clearSlotImage).mockResolvedValue({ ...FIXTURE[2]!, imageUrl: null, mediaId: null, activeImageUrl: null, activeMode: 'bundled' })
    renderPage()
    const drawer = await openDrawer('home_hero_character')
    fireEvent.click(within(drawer).getByText(/إزالة الصورة الدائمة — العودة إلى الرسم المضمَّن/))
    fireEvent.click(await screen.findByRole('button', { name: 'إزالة' }))
    await waitFor(() => expect(clearSlotImage).toHaveBeenCalledWith('s-hero'))
    expect(setSlotImage).not.toHaveBeenCalled()
    expect(clearSlotTemporaryImage).not.toHaveBeenCalled()
  })

  it('[CRITICAL] مؤقّتة إلى يوم: اختيار «مؤقّتة» يفتح منتقي التاريخ، والرفع بلا يومٍ معطَّل، ومع يومٍ يستدعي PUT على المؤقّتة بنهاية ذلك اليوم', async () => {
    vi.mocked(uploadImage).mockResolvedValue('/uploads/slot/party.png')
    vi.mocked(setSlotTemporaryImage).mockResolvedValue({
      ...FIXTURE[2]!,
      temporaryImageUrl: '/uploads/slot/party.png',
      temporaryUntil: UNTIL,
      activeImageUrl: '/uploads/slot/party.png',
      activeMode: 'temporary',
    })
    renderPage()
    const drawer = await openDrawer('home_hero_character')
    fireEvent.click(within(drawer).getByText('صورة مؤقّتة حتى يوم'))
    expect(drawer.querySelector('.ant-picker')).not.toBeNull()
    expect(within(drawer).getByText('اختر اليوم أولاً ثم ارفع الصورة المؤقّتة')).toBeInTheDocument()
    expect(within(drawer).getByText(/الصورة الدائمة لا تُمسّ/)).toBeInTheDocument()
    // [F5] اليوم يومٌ من تقويم المتجر — النصّ يسمّي منطقة المتجر لا «جهازك».
    expect(within(drawer).getByText(new RegExp(`بتوقيت المتجر \\(${STORE_TIMEZONE.replace('/', '\\/')}\\)`))).toBeInTheDocument()
    expect(within(drawer).queryByText(/بتوقيت جهازك/)).not.toBeInTheDocument()
    expect(fileInput(drawer)).toBeDisabled()

    const day = dayjs().add(2, 'day')
    await pickDay(drawer, day.format('YYYY/MM/DD'))
    await waitFor(() => expect(fileInput(drawer)).not.toBeDisabled())
    expect(within(drawer).getByText(`رفع صورة مؤقّتة حتى ${day.format('YYYY/MM/DD')}`)).toBeInTheDocument()

    await userEvent.upload(fileInput(drawer), png('party.png'))
    await waitFor(() => expect(setSlotTemporaryImage).toHaveBeenCalledTimes(1))
    // [F5] نهاية اليوم المختار **بتقويم المتجر** (+14)، لحظةً مطلقة ISO — لا نهايته بتوقيت المتصفح.
    const storeEndOfDay = new Date(`${day.format('YYYY-MM-DD')}T23:59:59.999+14:00`).toISOString()
    expect(storeEndOfDay).not.toBe(day.endOf('day').toISOString())
    expect(setSlotTemporaryImage).toHaveBeenCalledWith('s-hero', '/uploads/slot/party.png', storeEndOfDay)
    expect(setSlotImage).not.toHaveBeenCalled()
  })

  it('[CRITICAL] مؤقّتةٌ سارية في الدرج: «الآن» هي المؤقّتة، والدائمة معروضة تحتها لا ضائعة، وإنهاؤها يستدعي DELETE على المؤقّتة وحدها', async () => {
    vi.mocked(clearSlotTemporaryImage).mockResolvedValue({
      ...FIXTURE[5]!,
      temporaryImageUrl: null,
      temporaryUntil: null,
      activeImageUrl: '/uploads/slot/search-permanent.png',
      activeMode: 'permanent',
    })
    renderPage()
    const drawer = await openDrawer('empty_search_character')
    const now = screen.getByTestId('active-now')
    expect(now.querySelector('img')).toHaveAttribute('src', resolveMediaUrl('/uploads/slot/search-temporary.png'))
    expect(within(now).getByText(/^مؤقّتة حتى /)).toBeInTheDocument()
    expect(within(now).getByText(/بعد ذلك تعود الصورة الدائمة تلقائياً/)).toBeInTheDocument()

    const permanent = screen.getByTestId('permanent-card')
    expect(within(permanent).getByText('الصورة الدائمة — تعود بعد انتهاء المؤقّتة')).toBeInTheDocument()
    expect(permanent.querySelector('img')).toHaveAttribute('src', resolveMediaUrl('/uploads/slot/search-permanent.png'))

    fireEvent.click(within(drawer).getByText('إنهاء الصورة المؤقّتة الآن'))
    fireEvent.click(await screen.findByRole('button', { name: 'إنهاء' }))
    await waitFor(() => expect(clearSlotTemporaryImage).toHaveBeenCalledWith('s-search'))
    expect(clearSlotImage).not.toHaveBeenCalled()
    expect(setSlotImage).not.toHaveBeenCalled()
  })

  it('رفع دائمةٍ أثناء مؤقّتةٍ سارية يذهب إلى مسار الدائمة — المؤقّتة لا تُمسّ', async () => {
    vi.mocked(uploadImage).mockResolvedValue('/uploads/slot/search-new.png')
    vi.mocked(setSlotImage).mockResolvedValue({ ...FIXTURE[5]!, imageUrl: '/uploads/slot/search-new.png' })
    renderPage()
    const drawer = await openDrawer('empty_search_character')
    await userEvent.upload(fileInput(drawer), png('x.png'))
    await waitFor(() => expect(setSlotImage).toHaveBeenCalledWith('s-search', '/uploads/slot/search-new.png'))
    expect(setSlotTemporaryImage).not.toHaveBeenCalled()
    expect(clearSlotTemporaryImage).not.toHaveBeenCalled()
  })

  /**
   * [F7] الحدّ الأقصى: الخادم يرفض لحظةً أبعد من ٣٦٦ × ٢٤ ساعة. المنتقي لا
   * يعرض يوماً سيُرفض — آخر يومٍ صالح هو آخر يومٍ نهايتُه (بتقويم المتجر)
   * داخل الحدّ. الساعة مثبَّتة كي يكون الحدّ معروفاً سلفاً.
   */
  describe('[F7] حدّ الـ٣٦٦ يوماً في المنتقي', () => {
    // ٢٠٢٦-٠٩-٢١ 23:30 ببغداد؛ بعد ٣٦٦ يوماً: ٢٠٢٧-٠٩-٢٢ 23:30 ببغداد — نهاية ذلك اليوم تتجاوز الحدّ.
    const NOW = new Date('2026-09-21T20:30:00.000Z')
    const BAGHDAD = { items: FIXTURE, timezone: 'Asia/Baghdad' }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(NOW)
      vi.mocked(listVisualSlots).mockResolvedValue(BAGHDAD)
    })
    afterEach(() => vi.useRealTimers())

    it('[CRITICAL] اليوم الذي يبعد ٣٦٦ يوماً تقويمياً لا يُقبل، وآخر يومٍ صالح يُقبل ويُرسَل بنهايته', async () => {
      vi.mocked(uploadImage).mockResolvedValue('/uploads/slot/edge.png')
      vi.mocked(setSlotTemporaryImage).mockResolvedValue({
        ...FIXTURE[2]!,
        temporaryImageUrl: '/uploads/slot/edge.png',
        temporaryUntil: '2027-09-21T20:59:59.999Z',
        activeImageUrl: '/uploads/slot/edge.png',
        activeMode: 'temporary',
      })
      renderPage()
      const drawer = await openDrawer('home_hero_character')
      fireEvent.click(within(drawer).getByText('صورة مؤقّتة حتى يوم'))

      // يومٌ معطَّل لا يُقبل بالكتابة: يبقى الرفع معطَّلاً.
      await pickDay(drawer, '2027/09/22')
      expect(within(drawer).getByText('اختر اليوم أولاً ثم ارفع الصورة المؤقّتة')).toBeInTheDocument()
      expect(fileInput(drawer)).toBeDisabled()

      await pickDay(drawer, '2027/09/21')
      await waitFor(() => expect(fileInput(drawer)).not.toBeDisabled())
      await userEvent.upload(fileInput(drawer), png('edge.png'))
      await waitFor(() => expect(setSlotTemporaryImage).toHaveBeenCalledTimes(1))
      expect(setSlotTemporaryImage).toHaveBeenCalledWith('s-hero', '/uploads/slot/edge.png', '2027-09-21T20:59:59.999Z')
    })

    it('[CRITICAL] يومٌ اختير ثم مضى قبل الرفع: لا رفع أصلاً — لا ملف بلا مرجع', async () => {
      vi.mocked(uploadImage).mockResolvedValue('/uploads/slot/late.png')
      renderPage()
      const drawer = await openDrawer('home_hero_character')
      fireEvent.click(within(drawer).getByText('صورة مؤقّتة حتى يوم'))
      await pickDay(drawer, '2026/09/21') // اليوم — نهايته بعد نصف ساعة
      await waitFor(() => expect(fileInput(drawer)).not.toBeDisabled())

      // يمضي اليوم بتقويم المتجر بينما الدرج مفتوح.
      vi.setSystemTime(new Date('2026-09-21T21:05:00.000Z'))
      await userEvent.upload(fileInput(drawer), png('late.png'))
      await screen.findByText(/اليوم المختار لم يعد صالحاً/)
      expect(uploadImage).not.toHaveBeenCalled()
      expect(setSlotTemporaryImage).not.toHaveBeenCalled()
    })
  })

  it('فشل الخادم يظهر رسالةً ولا يغيّر اللوحة', async () => {
    vi.mocked(uploadImage).mockResolvedValue('/uploads/slot/new.png')
    vi.mocked(setSlotImage).mockRejectedValue(new Error('هذه الصورة لم تُرفع لرسوم الشخصيات'))
    renderPage()
    const drawer = await openDrawer('home_hero_character')
    await userEvent.upload(fileInput(drawer), png('x.png'))
    expect(await screen.findByText('هذه الصورة لم تُرفع لرسوم الشخصيات')).toBeInTheDocument()
    // الصورة الحالية ما تزال المعروضة.
    const hero = await rowOf('home_hero_character')
    expect(hero.querySelector('img')).toHaveAttribute('src', resolveMediaUrl('/uploads/slot/hero.png'))
  })
})

/**
 * [F10] انتهاء المؤقّتة يظهر في اللوحة من تلقاء نفسه.
 *
 * `refetchOnWindowFocus` معطَّل و`staleTime` صفر: بلا جلبٍ مجدول لحظةَ الانتهاء
 * تبقى اللوحة تقول «مؤقّتة حتى …» بعد أن عاد الزبون يرى الدائمة، حتى يضغط
 * المسؤول «تحديث». المطلوب جلبٌ **واحد** عند أقرب انتهاء (بحدّ يومٍ كما في
 * التطبيق) يُعاد تسليحه مع كل ردّ — لا استطلاع. الخادم يبقى الحكم: الجلب
 * يعيد الحالة كما يحسبها هو، واللوحة لا تحسب الانتهاء بنفسها.
 *
 * الزمن وهمي (`shouldAdvanceTime` كي تعمل أدوات الانتظار): كل انتظارٍ
 * يُقفَز إليه صراحةً، لا نومَ حقيقياً.
 */
describe('[F10] انتهاء المؤقّتة يظهر بلا تحديثٍ يدوي', () => {
  const NOW = new Date('2026-09-21T10:00:00.000Z')
  const HOUR = 60 * 60 * 1000
  const untilAt = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

  const live = (until: string, overrides: Partial<VisualSlot> = {}): VisualSlot =>
    slot({
      id: 's-search',
      slotKey: 'empty_search_character',
      label: 'شخصية نتائج البحث الفارغة',
      location: 'شاشة البحث — حين لا نتائج',
      groupKey: 'search',
      imageUrl: '/uploads/slot/search-permanent.png',
      mediaId: 'm-search',
      temporaryImageUrl: '/uploads/slot/search-temporary.png',
      temporaryMediaId: 'm-search-temp',
      temporaryUntil: until,
      ...overrides,
    })
  /** الحالة كما يحسبها الخادم بعد الانتهاء: المؤقّتة مخفيّة والدائمة فعّالة. */
  const expired = (): VisualSlot =>
    slot({
      id: 's-search',
      slotKey: 'empty_search_character',
      label: 'شخصية نتائج البحث الفارغة',
      location: 'شاشة البحث — حين لا نتائج',
      groupKey: 'search',
      imageUrl: '/uploads/slot/search-permanent.png',
      mediaId: 'm-search',
    })
  const list = (...items: VisualSlot[]) => ({ items, timezone: 'Asia/Baghdad' })

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(NOW)
    vi.clearAllMocks()
  })
  afterEach(() => vi.useRealTimers())

  const modeTag = async () => within(await rowOf('empty_search_character')).getByText(/مؤقّتة حتى|صورة دائمة|الرسم المضمَّن/)
  const jump = (ms: number) => act(() => vi.advanceTimersByTime(ms))

  it('[CRITICAL] تنتهي المؤقّتة: اللوحة تجلب مرةً واحدة عند لحظتها وتعرض الدائمة — بلا تحديثٍ يدوي وبلا استطلاع', async () => {
    vi.mocked(listVisualSlots).mockResolvedValueOnce(list(live(untilAt(HOUR)))).mockResolvedValue(list(expired()))
    renderPage()
    expect((await modeTag()).textContent).toMatch(/مؤقّتة حتى/)
    expect(listVisualSlots).toHaveBeenCalledTimes(1)

    // قبل الانتهاء بدقيقة: لا جلب — ليس استطلاعاً.
    await jump(59 * 60 * 1000)
    expect(listVisualSlots).toHaveBeenCalledTimes(1)
    expect((await modeTag()).textContent).toMatch(/مؤقّتة حتى/)

    // لحظة الانتهاء (بهامش ثانيتين): جلبٌ واحد، والصفّ يعرض الدائمة.
    await jump(60 * 1000 + 2000)
    await waitFor(() => expect(listVisualSlots).toHaveBeenCalledTimes(2))
    await waitFor(async () => expect((await modeTag()).textContent).toBe('صورة دائمة'))

    // ولا شيء بعدها: لا مؤقّتة سارية فلا جلبٌ مجدول.
    await jump(24 * HOUR)
    expect(listVisualSlots).toHaveBeenCalledTimes(2)
  })

  it('أُنهيت يدوياً قبل الانتهاء: الردّ بلا مؤقّتة يلغي الجلب المجدول للحظتها', async () => {
    // الإنهاء من الدرج يستدعي DELETE ثم يُبطل الاستعلام (مغطّى في «إنهاؤها يستدعي
    // DELETE»)؛ ما يعنينا هنا أثرُ الردّ التالي على المؤقّت، فيُبطَل الاستعلام مباشرةً.
    vi.mocked(listVisualSlots).mockResolvedValueOnce(list(live(untilAt(HOUR)))).mockResolvedValue(list(expired()))
    const client = createQueryClient({ retry: false })
    renderPage(client)
    await modeTag()
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['admin-visual-slots'] })
    })
    await waitFor(async () => expect((await modeTag()).textContent).toBe('صورة دائمة'))
    expect(listVisualSlots).toHaveBeenCalledTimes(2)

    await jump(2 * HOUR)
    expect(listVisualSlots).toHaveBeenCalledTimes(2)
  })

  it('استُبدلت بمؤقّتةٍ أبعد قبل الانتهاء: الجلب يُعاد تسليحه للحظة الجديدة لا القديمة', async () => {
    vi.mocked(listVisualSlots)
      .mockResolvedValueOnce(list(live(untilAt(HOUR))))
      .mockResolvedValueOnce(list(live(untilAt(3 * HOUR), { temporaryImageUrl: '/uploads/slot/later.png' })))
      .mockResolvedValue(list(expired()))
    const client = createQueryClient({ retry: false })
    renderPage(client)
    await modeTag()
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['admin-visual-slots'] })
    })
    await waitFor(() => expect(listVisualSlots).toHaveBeenCalledTimes(2))

    // اللحظة القديمة تمرّ: لا جلب. اللحظة الجديدة: جلب.
    await jump(HOUR + 2000)
    expect(listVisualSlots).toHaveBeenCalledTimes(2)
    await jump(2 * HOUR)
    await waitFor(() => expect(listVisualSlots).toHaveBeenCalledTimes(3))
    await waitFor(async () => expect((await modeTag()).textContent).toBe('صورة دائمة'))
  })

  it('فُكّت الصفحة قبل اللحظة: لا جلب بعد الفكّ — لا تسريب مؤقّت', async () => {
    vi.mocked(listVisualSlots).mockResolvedValue(list(live(untilAt(HOUR))))
    const { unmount } = renderPage()
    await modeTag()
    unmount()
    await jump(2 * HOUR)
    expect(listVisualSlots).toHaveBeenCalledTimes(1)
  })

  it('أُعيد تركيبها: جلبٌ عند التركيب ثم جلبٌ عند اللحظة', async () => {
    vi.mocked(listVisualSlots).mockResolvedValue(list(live(untilAt(HOUR))))
    const first = renderPage()
    await modeTag()
    first.unmount()
    vi.mocked(listVisualSlots).mockResolvedValueOnce(list(live(untilAt(HOUR)))).mockResolvedValue(list(expired()))
    renderPage()
    await modeTag()
    await waitFor(() => expect(listVisualSlots).toHaveBeenCalledTimes(2))
    await jump(HOUR + 2000)
    await waitFor(() => expect(listVisualSlots).toHaveBeenCalledTimes(3))
    await waitFor(async () => expect((await modeTag()).textContent).toBe('صورة دائمة'))
  })

  it('فتحتان بلحظتين: جلبٌ عند الأقرب ثم — من الردّ — جلبٌ عند الأبعد', async () => {
    const other = (until: string | null) =>
      slot({
        id: 's-hero',
        slotKey: 'home_hero_character',
        label: 'شخصية اللوحة الرئيسية',
        location: 'الرئيسية',
        groupKey: 'home',
        imageUrl: '/uploads/slot/hero.png',
        ...(until ? { temporaryImageUrl: '/uploads/slot/hero-temp.png', temporaryUntil: until } : {}),
      })
    vi.mocked(listVisualSlots)
      .mockResolvedValueOnce(list(live(untilAt(HOUR)), other(untilAt(3 * HOUR))))
      .mockResolvedValueOnce(list(expired(), other(untilAt(3 * HOUR))))
      .mockResolvedValue(list(expired(), other(null)))
    renderPage()
    await modeTag()
    await jump(HOUR + 2000)
    await waitFor(() => expect(listVisualSlots).toHaveBeenCalledTimes(2))
    await waitFor(async () => expect((await modeTag()).textContent).toBe('صورة دائمة'))
    await jump(HOUR)
    expect(listVisualSlots).toHaveBeenCalledTimes(2)
    await jump(HOUR + 2000)
    await waitFor(() => expect(listVisualSlots).toHaveBeenCalledTimes(3))
    const hero = await rowOf('home_hero_character')
    await waitFor(() => expect(within(hero).getByText('صورة دائمة')).toBeInTheDocument())
  })

  it('انتهاءٌ أبعد من يوم: مهلةٌ واحدة لا تتجاوز يوماً، تُعاد من كل ردّ حتى تُدرك اللحظة', async () => {
    const DAY = 24 * HOUR
    vi.mocked(listVisualSlots)
      .mockResolvedValueOnce(list(live(untilAt(3 * DAY))))
      .mockResolvedValueOnce(list(live(untilAt(3 * DAY))))
      .mockResolvedValueOnce(list(live(untilAt(3 * DAY))))
      .mockResolvedValue(list(expired()))
    renderPage()
    await modeTag()
    await jump(DAY - 60 * 1000)
    expect(listVisualSlots).toHaveBeenCalledTimes(1)
    await jump(60 * 1000 + 2000)
    await waitFor(() => expect(listVisualSlots).toHaveBeenCalledTimes(2))
    await jump(DAY + 2000)
    await waitFor(() => expect(listVisualSlots).toHaveBeenCalledTimes(3))
    await jump(DAY + 2000)
    await waitFor(() => expect(listVisualSlots).toHaveBeenCalledTimes(4))
    await waitFor(async () => expect((await modeTag()).textContent).toBe('صورة دائمة'))
  })
})

describe('حالات الحافة والأصول الثابتة', () => {
  beforeEach(() => vi.clearAllMocks())

  it('لا فتحات ⇒ حالة فارغة صريحة بلا زرّ إنشاء', async () => {
    vi.mocked(listVisualSlots).mockResolvedValue({ items: [], timezone: STORE_TIMEZONE })
    renderPage()
    expect(await screen.findByText(/لا فتحات — التطبيق يعمل كله بالرسوم المضمَّنة/)).toBeInTheDocument()
    expect(document.querySelector('.ant-collapse')).toBeNull()
    expect(screen.queryByText('إضافة فتحة')).not.toBeInTheDocument()
  })

  it('[CRITICAL] أيقونات التواصل أصولٌ ثابتة: تُعرض غير قابلة للتغيير وبلا أي تحكّم، ولا صفّ فتحةٍ يصفها', async () => {
    vi.mocked(listVisualSlots).mockResolvedValue(LIST)
    renderPage()
    await rowOf('login_character')
    const card = screen.getByText('أصولٌ ثابتة — غير قابلة للتغيير من اللوحة').closest('.ant-card') as HTMLElement
    for (const name of ['أيقونة تيك توك', 'أيقونة إنستغرام', 'أيقونة واتساب']) {
      const row = within(card).getByText(name).closest('tr')!
      expect(within(row).getByText('لا')).toBeInTheDocument()
      expect(within(row).queryByRole('button')).not.toBeInTheDocument()
    }
    for (const row of slotRows()) {
      expect(row.textContent).not.toMatch(/تيك توك|إنستغرام|واتساب/)
    }
  })
})
