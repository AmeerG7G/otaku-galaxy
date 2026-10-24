// @ts-expect-error — مشروع المتصفّح بلا أنواع Node عمداً (كـ`theme/layoutCss.test.ts`)؛ القراءة من القرص للحارسين أدناه.
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/appVersionApi', () => ({ fetchAppVersionSettings: vi.fn(), updateAppVersionSettings: vi.fn() }))

import { fetchAppVersionSettings, updateAppVersionSettings } from '../api/appVersionApi'
import { ApiError } from '../api/client'
import { APP_UPDATE_COPY } from '../constants/appUpdateCopy'
import { APP_PACKAGE_IDS, canonicalPlayStoreUrl, type AppUpdateAdminView } from '../types/appVersion'
import AppUpdatesPage from './AppUpdatesPage'

declare const process: { cwd(): string }

const PLAY = 'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy'
/** من جذر المستودع — فيتست يعمل من `admin/`. */
const repoFile = (path: string): string => readFileSync(`${process.cwd()}/../${path}`, 'utf8')

function view(over: Partial<AppUpdateAdminView> = {}): AppUpdateAdminView {
  return {
    enabled: false,
    mode: 'mandatory',
    latestVersion: '',
    minimumVersion: '',
    updateUrl: '',
    revision: 4,
    effective: { updateMode: 'none', minimumSupportedVersion: '', latestVersion: '', updateUrl: '', revision: 4 },
    problem: null,
    updatedAt: null,
    updatedBy: null,
    history: [],
    ...over,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <AppUpdatesPage />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

/** الصفحة جاهزة حين يظهر النموذج — عنوان البطاقة يظهر قبل البيانات (هيكل التحميل). */
const ready = () => screen.findByLabelText('رابط التطبيق على Google Play')
const statusCard = () => screen.getByText('ما تراه التطبيقات الآن').closest('.ant-card') as HTMLElement
/** نافذة التأكيد تحمل عنوانها مرّتين (مرئيّ ومتاح للقارئ). */
const dialog = async (title: string | RegExp) => expect((await screen.findAllByText(title)).length).toBeGreaterThan(0)

async function fill(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = screen.getByLabelText(label)
  await user.clear(input)
  if (value) await user.type(input, value)
}

/** «تحديث التطبيق» (STEP 70) — نشر سياسة التحديث، لا إصدار Google Play. */
describe('تحديث التطبيق', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchAppVersionSettings).mockResolvedValue(view())
    vi.mocked(updateAppVersionSettings).mockImplementation(async (input) => view({ ...input, mode: input.mode ?? 'mandatory', revision: input.revision + 1 }))
  })

  it('الحالة والنموذج والمعاينة والخطوات — ويقول صراحةً إنه لا ينشر على Google Play', async () => {
    renderPage()
    await ready()
    expect(within(statusCard()).getByText('موقوفة')).toBeInTheDocument()
    expect(screen.getByText('لم تُنشر سياسةٌ من اللوحة بعد')).toBeInTheDocument()
    expect(screen.getByText('هذا الزرّ لا ينشر شيئاً على Google Play')).toBeInTheDocument()
    expect(screen.getByLabelText('أحدث إصدار منشور على Google Play')).toBeInTheDocument()
    expect(screen.getByText('السياسة موقوفة: لا أحد يرى تنبيهاً ولا حجباً.')).toBeInTheDocument()
    // لا رسالة مسؤول (قرار STEP 64 باقٍ).
    expect(screen.queryByText('رسالة التحديث')).toBeNull()
  })

  it('[CRITICAL] الإجباري يطلب تأكيداً صريحاً ثم يرسل السياسة كاملة مع المراجعة', async () => {
    const user = userEvent.setup()
    renderPage()
    await ready()
    await fill(user, 'رابط التطبيق على Google Play', PLAY)
    await fill(user, 'أحدث إصدار منشور على Google Play', '1.2.0')
    await fill(user, 'أدنى إصدار مدعوم', '1.1.0')
    await user.click(screen.getByRole('switch'))

    expect(await screen.findByTestId('preview-mandatory')).toHaveTextContent('المطلوبة 1.1.0')
    expect(screen.getByTestId('preview-optional')).toHaveTextContent('الأحدث 1.2.0')
    expect(screen.getByTestId('affected-ranges')).toHaveTextContent('النسخ الأقدم من 1.1.0: تُحجب حتى التحديث.')

    await user.click(screen.getByRole('button', { name: /إرسال التحديث/ }))
    await dialog('نشر تحديث إجباري؟')
    expect(updateAppVersionSettings).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'نعم، فعّل الحجب' }))
    await waitFor(() =>
      expect(updateAppVersionSettings).toHaveBeenCalledWith({
        enabled: true,
        mode: 'mandatory',
        latestVersion: '1.2.0',
        minimumVersion: '1.1.0',
        updateUrl: PLAY,
        revision: 4,
      }),
    )
  })

  it('[CRITICAL] حدٌّ فوق أحدث إصدار، ورابطٌ ليس صفحة تطبيقنا، والتفعيل بلا رابط — تُرفض قبل الإرسال', async () => {
    const user = userEvent.setup()
    renderPage()
    await ready()
    await user.click(screen.getByRole('switch'))
    await fill(user, 'أحدث إصدار منشور على Google Play', '1.2.0')
    await fill(user, 'أدنى إصدار مدعوم', '1.3.0')
    await user.click(screen.getByRole('button', { name: /إرسال التحديث/ }))
    expect(await screen.findByText('أعلى من أحدث إصدار — لن تستطيع أي نسخة تجاوز شاشة التحديث')).toBeInTheDocument()
    expect(await screen.findByText('الصق رابط صفحة التطبيق قبل التفعيل')).toBeInTheDocument()

    await fill(user, 'رابط التطبيق على Google Play', 'https://example.com/app.apk')
    expect(await screen.findByText(/الرابط ليس صفحة تطبيقنا على Google Play/)).toBeInTheDocument()
    expect(screen.queryByText('نشر تحديث إجباري؟')).toBeNull()
    expect(updateAppVersionSettings).not.toHaveBeenCalled()
  })

  it('الاختياري: لا حدّ أدنى، المعاينة تنبيهٌ بـ«لاحقاً»، والتأكيد يقول إن أحداً لا يُحجب', async () => {
    const user = userEvent.setup()
    renderPage()
    await ready()
    await user.click(screen.getByText('اختياري — تنبيهٌ يُغلق للنسخ الأقدم من أحدث إصدار'))
    expect(screen.getByLabelText('أدنى إصدار مدعوم')).toBeDisabled()
    await fill(user, 'رابط التطبيق على Google Play', PLAY)
    await fill(user, 'أحدث إصدار منشور على Google Play', '1.4.0')
    await user.click(screen.getByRole('switch'))
    const preview = await screen.findByTestId('preview-optional')
    expect(within(preview).getByText(APP_UPDATE_COPY.updateLater)).toBeInTheDocument()
    expect(screen.queryByTestId('preview-mandatory')).toBeNull()

    await user.click(screen.getByRole('button', { name: /إرسال التحديث/ }))
    await dialog(/لا أحد يُحجب/)
    await user.click(screen.getByRole('button', { name: 'إرسال' }))
    await waitFor(() =>
      expect(updateAppVersionSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, mode: 'optional', latestVersion: '1.4.0' })),
    )
  })

  it('[CRITICAL] «إيقاف السياسة»: تأكيدٌ ثم `{ enabled: false, revision }` وحده — التراجع لا يتوقّف على باقي الحقول', async () => {
    vi.mocked(fetchAppVersionSettings).mockResolvedValue(
      view({
        enabled: true,
        latestVersion: '1.2.0',
        minimumVersion: '1.1.0',
        updateUrl: PLAY,
        effective: { updateMode: 'mandatory', minimumSupportedVersion: '1.1.0', latestVersion: '1.2.0', updateUrl: PLAY, revision: 4 },
        updatedAt: '2026-10-24T10:00:00.000Z',
        updatedBy: 'المالك',
      }),
    )
    const user = userEvent.setup()
    renderPage()
    await ready()
    expect(within(statusCard()).getByText('إجباري — نافذ')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /إيقاف السياسة/ }))
    await dialog('إيقاف سياسة التحديث؟')
    await user.click(screen.getByRole('button', { name: 'إيقاف الآن' }))
    await waitFor(() => expect(updateAppVersionSettings).toHaveBeenCalledWith({ enabled: false, revision: 4 }))
  })

  it('مسؤولٌ آخر غيّرها (409): رسالةٌ وإعادة تحميل، لا كتابةٌ فوق ما لم يُرَ', async () => {
    vi.mocked(updateAppVersionSettings).mockRejectedValue(
      new ApiError('غيّر مسؤولٌ آخر سياسة التحديث بعد أن فتحتَ الصفحة — أعد تحميلها وراجع القيم', 409, 'APP_UPDATE_POLICY_CHANGED'),
    )
    const user = userEvent.setup()
    renderPage()
    await ready()
    await user.click(screen.getByRole('button', { name: /إرسال التحديث/ }))
    await user.click(await screen.findByRole('button', { name: 'إرسال' }))
    await dialog(/غيّر مسؤولٌ آخر سياسة التحديث/)
    await waitFor(() => expect(fetchAppVersionSettings).toHaveBeenCalledTimes(2))
  })

  it('«استعادة هذه القيم» تملأ النموذج ولا ترسل شيئاً؛ والمشكلة تظهر تحذيراً', async () => {
    vi.mocked(fetchAppVersionSettings).mockResolvedValue(
      view({
        enabled: true,
        problem: 'رابط التحديث ليس صفحة تطبيقنا على Google Play — الصق رابط الصفحة كما في المتجر',
        history: [
          { id: '9', revision: 4, actorName: 'المالك', createdAt: '2026-10-24T10:00:00.000Z', policy: { enabled: true, mode: 'mandatory', latestVersion: '2.0.0', minimumVersion: '2.0.0', updateUrl: PLAY }, changes: {} },
          { id: '8', revision: 3, actorName: 'المالك', createdAt: '2026-10-23T10:00:00.000Z', policy: { enabled: true, mode: 'optional', latestVersion: '1.9.0', minimumVersion: '', updateUrl: PLAY }, changes: {} },
        ],
      }),
    )
    const user = userEvent.setup()
    renderPage()
    await ready()
    expect(within(statusCard()).getByText(/الصق رابط الصفحة كما في المتجر/)).toBeInTheDocument()
    expect(within(statusCard()).getByText('مفعّلة ولا تعمل')).toBeInTheDocument()
    // المراجعة الحالية لا «استعادة» لها؛ السابقة لها.
    const restore = screen.getAllByRole('button', { name: 'استعادة هذه القيم' })
    expect(restore).toHaveLength(1)
    await user.click(restore[0]!)
    expect(screen.getByLabelText('أحدث إصدار منشور على Google Play')).toHaveValue('1.9.0')
    expect(updateAppVersionSettings).not.toHaveBeenCalled()
  })
})

/**
 * المعاينة تعرض نصّ التطبيق نفسه — يُقرأ ملف النصوص في Flutter (القاموس العربي
 * أولاً فيه، فأول ظهورٍ لكل مفتاح هو العربي).
 */
describe('نصوص المعاينة = نصوص التطبيق', () => {
  const dart = repoFile('lib/core/l10n/app_strings.dart')

  it.each(Object.entries(APP_UPDATE_COPY))('%s', (key, value) => {
    const match = new RegExp(`'${key}':\\s*'([^']*)'`).exec(dart)
    expect(match?.[1], `${key} غائب عن app_strings.dart`).toBe(value)
  })
})

describe('قائمة الحِزم ورابط المتجر = الخادم', () => {
  const server = repoFile('backend/src/utils/playStoreUrl.ts')

  it('الحِزم الثلاث نفسها', () => {
    const block = /APP_PACKAGE_IDS = \[([\s\S]*?)\]/.exec(server)?.[1] ?? ''
    const ids = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect([...APP_PACKAGE_IDS]).toEqual(ids)
  })

  it('القواعد نفسها على عيّنات الخادم', () => {
    expect(canonicalPlayStoreUrl(`${PLAY}&hl=ar#x`)).toBe(PLAY)
    for (const bad of [
      'http://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
      'https://play.google.com.evil.example/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
      'https://play.google.com/store/apps/details?id=com.evil.app',
      `${PLAY}&id=com.evil.app`,
      'javascript:alert(1)',
    ]) {
      expect(canonicalPlayStoreUrl(bad), bad).toBeNull()
    }
  })
})
