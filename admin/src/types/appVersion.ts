/** إعدادات نسخة التطبيق كما يقرؤها المسؤول ويكتبها. */
export interface AppVersionConfig {
  minimumSupportedVersion: string
  latestVersion: string
  androidStoreUrl: string
  iosStoreUrl: string
  updateMessage: string
  /** الرسالة بالكردية — فارغةً يعرض التطبيق نصّه الكردي الافتراضي. */
  updateMessageCkb?: string
}

/** حمولة الحفظ — بمفاتيح `store_settings` نفسها التي يتحقق منها الخادم. */
export interface AppVersionSettingsPayload {
  app_min_supported_version?: string
  app_latest_version?: string
  app_android_store_url?: string
  app_ios_store_url?: string
  app_update_message?: string
  app_update_message_ckb?: string
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
