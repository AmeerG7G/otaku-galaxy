/**
 * إجبار التحديث كما يقرؤه المسؤول ويكتبه — ثلاثة حقول (STEP 64 §16):
 * مفعَّل؟ الحدّ الأدنى، رابط التحديث. الخادم يرفض التفعيل بلا حدٍّ صالح أو
 * بلا رابط، ويُسقط الحجب في كل حالة شكّ.
 */
export interface AppVersionSettings {
  enabled: boolean
  minimumVersion: string
  updateUrl: string
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
