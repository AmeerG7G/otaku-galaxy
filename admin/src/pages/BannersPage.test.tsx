import { beforeEach, describe, expect, it, vi } from 'vitest'

// مهلة أوسع لجداول antd في jsdom — انظر `OffersPage.test.tsx`.
vi.setConfig({ testTimeout: 20_000 })
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../queryClient'

vi.mock('../api/bannersApi', () => ({
  listAdminBanners: vi.fn(),
  createBanner: vi.fn(),
  updateBanner: vi.fn(),
  deleteBanner: vi.fn(),
}))
vi.mock('../api/categoriesApi', () => ({ listAdminCategories: vi.fn() }))
vi.mock('../api/productsApi', () => ({ listProducts: vi.fn() }))
vi.mock('../api/uploadsApi', () => ({ uploadImage: vi.fn() }))

import {
  createBanner,
  listAdminBanners,
  updateBanner,
} from '../api/bannersApi'
import { listAdminCategories } from '../api/categoriesApi'
import { listProducts } from '../api/productsApi'
import BannersPage from './BannersPage'
import type { AdminBanner } from '../types/banners'

/**
 * [CRITICAL] نصّ البنر بلغتين (هجرة ٠٦٧) — عنوانٌ وسطرٌ ثانٍ تحت «العربية»،
 * ومثلهما تحت «الكردية». لا ترجمة ولا نسخ؛ وحفظ لغةٍ لا يعيد كتابة الأخرى.
 */
function banner(overrides: Partial<AdminBanner> = {}): AdminBanner {
  return {
    id: 'b1',
    imageUrl: '/uploads/banner/a.png',
    title: 'عنوان عربي تجريبي',
    subtitle: 'نص عربي تجريبي',
    titleAr: 'عنوان عربي تجريبي',
    subtitleAr: 'نص عربي تجريبي',
    titleCkb: 'ناونیشانی تاقیکردنەوە',
    subtitleCkb: 'دەقی تاقیکردنەوە',
    placement: 'promo',
    destinationType: 'none',
    destinationValue: null,
    sortOrder: 0,
    isActive: true,
    ...overrides,
  }
}

/**
 * بلا حركة: jsdom لا يُطلق نهاية حركة الإغلاق، فلا يُهدم نموذج النافذة
 * (`destroyOnHidden`) كما يُهدم في المتصفّح — ويُعاد فتحه بحالته القديمة.
 */
function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient({ retry: false })}>
      <ConfigProvider direction="rtl" theme={{ token: { motion: false } }}>
        <AntApp>
          <MemoryRouter>
            <BannersPage />
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

const LABELS = {
  titleAr: 'العنوان بالعربية',
  subtitleAr: 'السطر الثاني بالعربية',
  titleCkb: 'العنوان بالكردية',
  subtitleCkb: 'السطر الثاني بالكردية',
} as const

const CONTENT_KEYS = ['titleAr', 'subtitleAr', 'titleCkb', 'subtitleCkb'] as const

type User = ReturnType<typeof userEvent.setup>

async function openEditor(user: User) {
  await user.click(await screen.findByText('تعديل', { selector: 'button span' }))
  return (await screen.findByText('تعديل البنر')).closest('.ant-modal') as HTMLElement
}

/** «إضافة بنر» في رأس الصفحة — بعد تحميل القائمة، فلا زرّ الحالة الفارغة. */
async function openCreator(user: User) {
  await screen.findByText('عنوان عربي تجريبي')
  await user.click(screen.getByText('إضافة بنر', { selector: 'button span' }))
  return (await screen.findByText('إضافة بنر', { selector: '.ant-modal-title' }))
    .closest('.ant-modal') as HTMLElement
}

/** لصقٌ لا كتابة حرفاً حرفاً — أسرع بكثير في شجرة antd، والنصّ نفسه يصل. */
async function fill(user: User, input: HTMLElement, text: string) {
  await user.click(input)
  await user.paste(text)
}

/** الحقول الإلزامية غير النصّية: صورة، وموضع، ونوع وجهة. */
async function fillRequired(user: User, dialog: HTMLElement) {
  await fill(
    user,
    within(dialog).getByPlaceholderText('أو ألصق رابط صورة مستضافة خارجياً'),
    '/uploads/banner/new.png',
  )
  await user.click(within(dialog).getByText('الشريط الترويجي'))
  await user.click(within(dialog).getByRole('combobox'))
  await user.click(await screen.findByTitle('بدون وجهة'))
}

async function save(user: User, dialog: HTMLElement) {
  await user.click(within(dialog).getByText('حفظ', { selector: 'button span' }))
}

/** مفاتيح النصّ التي حملها طلب التعديل — ما عداها لم يُرسَل فلا يُمسّ. */
function sentContentKeys(payload: object) {
  return CONTENT_KEYS.filter((key) => key in payload)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listAdminBanners).mockResolvedValue({ items: [banner()] })
  vi.mocked(listAdminCategories).mockResolvedValue({ items: [] } as never)
  vi.mocked(listProducts).mockResolvedValue({ items: [] } as never)
  vi.mocked(createBanner).mockResolvedValue({ row: banner(), message: 'أُنشئ البنر' })
  vi.mocked(updateBanner).mockResolvedValue({ row: banner(), message: 'حُدّث البنر' })
})

describe('إضافة بنر — العربية والكردية منفصلتان', () => {
  it('النموذج يعرض الحقول الأربعة مجمَّعةً تحت «العربية» و«الكردية» — لا حقل عنوانٍ عامّ', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    const dialog = await openCreator(user)
    const ar = within(dialog).getByTestId('banner-content-ar')
    const ckb = within(dialog).getByTestId('banner-content-ckb')
    expect(within(dialog).getByText('محتوى البنر')).toBeInTheDocument()
    expect(within(ar).getByText('العربية')).toBeInTheDocument()
    expect(within(ckb).getByText('الكردية')).toBeInTheDocument()

    for (const key of ['titleAr', 'subtitleAr'] as const) {
      const input = within(ar).getByLabelText(LABELS[key])
      expect(input).toHaveAttribute('lang', 'ar')
      expect(input).toHaveAttribute('dir', 'rtl')
    }
    for (const key of ['titleCkb', 'subtitleCkb'] as const) {
      const input = within(ckb).getByLabelText(LABELS[key])
      expect(input).toHaveAttribute('lang', 'ckb')
      expect(input).toHaveAttribute('dir', 'rtl')
    }
    expect(within(dialog).queryByLabelText('العنوان')).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText('السطر الثاني')).not.toBeInTheDocument()
  })

  it('[CRITICAL] كل لغةٍ تصل في حقليها مقصوصةً — واليونيكود الكردي كما كُتب، بلا المفتاحين القديمين', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    const dialog = await openCreator(user)
    await fillRequired(user, dialog)
    await fill(user, within(dialog).getByLabelText(LABELS.titleAr), '  عنوان عربي تجريبي ')
    await fill(user, within(dialog).getByLabelText(LABELS.subtitleAr), 'نص عربي تجريبي')
    await fill(user, within(dialog).getByLabelText(LABELS.titleCkb), ' ناونیشانی تاقیکردنەوە  ')
    await fill(user, within(dialog).getByLabelText(LABELS.subtitleCkb), 'دەقی تاقیکردنەوە')
    await save(user, dialog)

    await waitFor(() => expect(createBanner).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(createBanner).mock.calls[0]![0]
    expect(payload).toMatchObject({
      imageUrl: '/uploads/banner/new.png',
      placement: 'promo',
      destinationType: 'none',
      titleAr: 'عنوان عربي تجريبي',
      subtitleAr: 'نص عربي تجريبي',
      titleCkb: 'ناونیشانی تاقیکردنەوە',
      subtitleCkb: 'دەقی تاقیکردنەوە',
    })
    expect(payload).not.toHaveProperty('title')
    expect(payload).not.toHaveProperty('subtitle')
  })

  it('النصّ اختياري: بلا كردية يُرسل null صريحة — لا نسخ من العربية', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    const dialog = await openCreator(user)
    await fillRequired(user, dialog)
    await fill(user, within(dialog).getByLabelText(LABELS.titleAr), 'عربي وحده')
    await save(user, dialog)

    await waitFor(() => expect(createBanner).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createBanner).mock.calls[0]![0]).toMatchObject({
      titleAr: 'عربي وحده',
      subtitleAr: null,
      titleCkb: null,
      subtitleCkb: null,
    })
  })

  it('الحدّ لكل لغة: عنوانٌ كردي فوق ١٠٠ حرف يُرفض برسالةٍ تسمّي لغته ولا يصل الخادم', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    const dialog = await openCreator(user)
    await fillRequired(user, dialog)
    await fill(user, within(dialog).getByLabelText(LABELS.titleCkb), 'ک'.repeat(101))
    expect(await within(dialog).findByText('العنوان بالكردية يجب ألا يتجاوز 100 حرف')).toBeInTheDocument()
    await save(user, dialog)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(createBanner).not.toHaveBeenCalled()
  })
})

describe('[CRITICAL] تعديل بنر — كل لغةٍ مستقلة', () => {
  it('الحقول تُملأ كلٌّ بلغتها كما حفظها الخادم', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    const dialog = await openEditor(user)
    expect(within(dialog).getByLabelText(LABELS.titleAr)).toHaveValue('عنوان عربي تجريبي')
    expect(within(dialog).getByLabelText(LABELS.subtitleAr)).toHaveValue('نص عربي تجريبي')
    expect(within(dialog).getByLabelText(LABELS.titleCkb)).toHaveValue('ناونیشانی تاقیکردنەوە')
    expect(within(dialog).getByLabelText(LABELS.subtitleCkb)).toHaveValue('دەقی تاقیکردنەوە')
  })

  it('تعديل العربية وحدها يُرسل العربية وحدها — الكردية لا تُعاد كتابتها', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    const dialog = await openEditor(user)
    const input = within(dialog).getByLabelText(LABELS.titleAr)
    await user.clear(input)
    await fill(user, input, 'عنوان عربي معدَّل')
    await save(user, dialog)

    await waitFor(() => expect(updateBanner).toHaveBeenCalledTimes(1))
    const [id, payload] = vi.mocked(updateBanner).mock.calls[0]!
    expect(id).toBe('b1')
    expect(sentContentKeys(payload)).toEqual(['titleAr'])
    expect(payload.titleAr).toBe('عنوان عربي معدَّل')
  })

  it('تعديل الكردية وحدها يُرسل الكردية وحدها — العربية لا تُعاد كتابتها', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    const dialog = await openEditor(user)
    const input = within(dialog).getByLabelText(LABELS.subtitleCkb)
    await user.clear(input)
    await fill(user, input, 'دەقی نوێ')
    await save(user, dialog)

    await waitFor(() => expect(updateBanner).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(updateBanner).mock.calls[0]![1]
    expect(sentContentKeys(payload)).toEqual(['subtitleCkb'])
    expect(payload.subtitleCkb).toBe('دەقی نوێ')
  })

  it('مسح حقلٍ يُرسل null لذلك الحقل وحده', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    const dialog = await openEditor(user)
    await user.clear(within(dialog).getByLabelText(LABELS.titleCkb))
    await save(user, dialog)

    await waitFor(() => expect(updateBanner).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(updateBanner).mock.calls[0]![1]
    expect(sentContentKeys(payload)).toEqual(['titleCkb'])
    expect(payload.titleCkb).toBeNull()
  })

  it('[CRITICAL] بنرٌ قديم بلا كردية: حقولها فارغة لا منسوخة من العربية، والحفظ بلا تغيير لا يكتب نصاً', async () => {
    vi.mocked(listAdminBanners).mockResolvedValue({
      items: [banner({ titleCkb: null, subtitleCkb: null })],
    })
    const user = userEvent.setup({ delay: null })
    renderPage()
    const dialog = await openEditor(user)
    expect(within(dialog).getByLabelText(LABELS.titleCkb)).toHaveValue('')
    expect(within(dialog).getByLabelText(LABELS.subtitleCkb)).toHaveValue('')
    await save(user, dialog)

    await waitFor(() => expect(updateBanner).toHaveBeenCalledTimes(1))
    expect(sentContentKeys(vi.mocked(updateBanner).mock.calls[0]![1])).toEqual([])
  })

  it('القيم تبقى بعد إعادة التحميل: الحفظ يعيد جلب القائمة، والنموذج يُفتح بما أعاده الخادم', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    const dialog = await openEditor(user)
    const input = within(dialog).getByLabelText(LABELS.titleCkb)
    await user.clear(input)
    await fill(user, input, 'ناونیشانی نوێ')
    // ما يعيده الخادم بعد الحفظ يختلف عمّا في النموذج (عنوانٌ عربي عدّله غيرُنا)
    // — فالنموذج المُعاد فتحه يُثبت أنه مُلئ من الجلب الجديد لا من حالته القديمة.
    vi.mocked(listAdminBanners).mockResolvedValue({
      items: [banner({ titleAr: 'عنوان من الخادم', titleCkb: 'ناونیشانی نوێ' })],
    })
    await save(user, dialog)
    await waitFor(() => expect(listAdminBanners).toHaveBeenCalledTimes(2))
    await screen.findByText('عنوان من الخادم')

    const reopened = await openEditor(user)
    await waitFor(() =>
      expect(within(reopened).getByLabelText(LABELS.titleAr)).toHaveValue('عنوان من الخادم'),
    )
    expect(within(reopened).getByLabelText(LABELS.titleCkb)).toHaveValue('ناونیشانی نوێ')
    expect(within(reopened).getByLabelText(LABELS.subtitleCkb)).toHaveValue('دەقی تاقیکردنەوە')
  })
})

describe('قائمة البنرات', () => {
  it('العنوان باللغتين، و«الكردية ناقصة» لبنرٍ قديم عربيٍّ وحده', async () => {
    vi.mocked(listAdminBanners).mockResolvedValue({
      items: [
        banner(),
        banner({ id: 'b2', titleAr: 'بنر قديم', title: 'بنر قديم', titleCkb: null, subtitleCkb: null }),
      ],
    })
    renderPage()
    expect(await screen.findByText('ناونیشانی تاقیکردنەوە')).toBeInTheDocument()
    const legacyRow = screen.getByText('بنر قديم').closest('tr') as HTMLElement
    expect(within(legacyRow).getByText('الكردية ناقصة')).toBeInTheDocument()
    const fullRow = screen.getByText('عنوان عربي تجريبي').closest('tr') as HTMLElement
    expect(within(fullRow).queryByText(/ناقصة/)).not.toBeInTheDocument()
  })
})
