/**
 * سياسة تحديث التطبيق كما يقرؤها المسؤول ويكتبها — «تحديث التطبيق» (STEP 64
 * §16، ثم STEP 70: أحدث إصدار ونوع التحديث، قرار المالك 2026-10-24). لا رسالة
 * مسؤول: التطبيق يعرض نصّه المترجَم.
 *
 * الخادم يتحقّق ويُسقط الحجب في كل حالة شكّ؛ ما هنا للعرض والتحذير قبل الإرسال.
 */
export type UpdateMode = 'optional' | 'mandatory'

export interface AppUpdatePolicy {
  enabled: boolean
  /** `null` = قيمةٌ محفوظة لا يعرفها الخادم (كُتبت خارج اللوحة). */
  mode: UpdateMode | null
  latestVersion: string
  minimumVersion: string
  updateUrl: string
}

/** ما تراه التطبيقات الآن (`GET /catalog/app-version`). */
export interface EffectiveAppUpdate {
  updateMode: 'none' | UpdateMode
  minimumSupportedVersion: string
  latestVersion: string
  updateUrl: string
  revision: number
}

export interface AppUpdateHistoryEntry {
  id: string
  revision: number | null
  actorName: string
  createdAt: string
  /** لقطة السياسة بعد الحفظ؛ `null` لصفوفٍ قبل STEP 70 (لا تُستعاد). */
  policy: AppUpdatePolicy | null
  changes: Record<string, { before: string; after: string }>
}

export interface AppUpdateAdminView extends AppUpdatePolicy {
  revision: number
  effective: EffectiveAppUpdate
  /** لماذا لا تعمل سياسةٌ مفعّلة — `null` حين لا مشكلة. */
  problem: string | null
  updatedAt: string | null
  updatedBy: string | null
  history: AppUpdateHistoryEntry[]
}

/** حفظ: الحقل الغائب يبقى كما حُفظ — `{ enabled: false, revision }` هو الإيقاف. */
export interface AppUpdatePolicyInput extends Partial<Omit<AppUpdatePolicy, 'enabled' | 'mode'>> {
  enabled: boolean
  mode?: UpdateMode
  revision: number
}

/**
 * معرّفات تطبيقنا على أندرويد — نسخة الخادم (`backend/src/utils/playStoreUrl.ts`)
 * يحرس تطابقهما `appVersion.test.ts`.
 */
export const APP_PACKAGE_IDS = [
  'com.otakugalaxy.otaku_galaxy',
  'com.otakugalaxy.otaku_galaxy.staging',
  'com.otakugalaxy.otaku_galaxy.dev',
] as const

export const PRODUCTION_PACKAGE_ID = APP_PACKAGE_IDS[0]

/**
 * الرابط القانوني لصفحة تطبيقنا على Google Play، أو `null` — القواعد نفسها في
 * الخادم (الحكم الملزِم) والموقع والتطبيق.
 */
export function canonicalPlayStoreUrl(raw: string): string | null {
  if (raw.trim() === '') return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== 'play.google.com' || url.username || url.password || url.port) {
    return null
  }
  if (url.pathname !== '/store/apps/details') return null
  const ids = url.searchParams.getAll('id')
  if (ids.length !== 1) return null
  const id = ids[0]!
  if (!(APP_PACKAGE_IDS as readonly string[]).includes(id)) return null
  return `https://play.google.com/store/apps/details?id=${id}`
}

/** معرّف الحزمة في رابطٍ صالح — يُعرض للمسؤول ليتأكّد أنه تطبيق الإنتاج. */
export function packageIdOf(url: string): string | null {
  const canonical = canonicalPlayStoreUrl(url)
  return canonical ? new URL(canonical).searchParams.get('id') : null
}

/**
 * مقارنة نسخ دلالية — نسخة مصغّرة تكفي للتحذير قبل الحفظ.
 *
 * [CRITICAL] المقارنة النصّية خاطئة صامتة: `'1.10.0' < '1.9.0'` حرفياً.
 * الحكم الملزِم يقع في الخادم (`utils/semver.ts`)؛ هذه للتحذير في اللوحة
 * قبل أن يحفظ المسؤول حدّاً أعلى من أحدث نسخة منشورة.
 */
export function compareVersions(a: string, b: string): number | null {
  const parse = (raw: string) => {
    const match = /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:[-+].*)?$/.exec(raw.trim())
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
  }
  const left = parse(a)
  const right = parse(b)
  if (!left || !right) return null
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1
  }
  return 0
}

export const SEMVER_PATTERN = /^\d{1,9}\.\d{1,9}\.\d{1,9}(?:[-+][0-9A-Za-z.-]+)?$/
