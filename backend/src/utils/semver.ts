/**
 * مقارنة النسخ الدلالية (SemVer 2.0.0).
 *
 * [CRITICAL] المقارنة النصّية خاطئة هنا خطأً صامتاً: `'1.10.0' < '1.9.0'`
 * صحيحٌ كنصّين لأن `'1' < '9'` حرفياً — فيمرّ مستخدمٌ على نسخة قديمة، أو
 * يُحجب مستخدمٌ على أحدث نسخة، بلا أي خطأ يُنبّه. لذلك كل مقارنة نسخة في
 * المنظومة تمرّ من هنا وحدها.
 */

export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
  /** معرّفات ما قبل الإصدار (`1.2.0-beta.3` → `['beta', 3]`)، فارغة للإصدار المستقرّ. */
  prerelease: readonly (string | number)[];
}

/**
 * `major.minor.patch` ثم ما قبل الإصدار اختياراً ثم بيانات البناء اختياراً.
 *
 * سقف تسع خانات لكل جزء يمنع أن يبتلع `Number()` رقماً أكبر من المدى الآمن
 * فيصير `Infinity` ويقارَن بلا معنى.
 */
const SEMVER =
  /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:-([0-9A-Za-z][0-9A-Za-z.-]*))?(?:\+([0-9A-Za-z][0-9A-Za-z.-]*))?$/;

const NUMERIC = /^\d+$/;

/** يحلّل نصّ نسخة، أو `null` إن لم يكن نسخةً دلالية صالحة. */
export function parseVersion(raw: unknown): SemanticVersion | null {
  if (typeof raw !== 'string') return null;
  const match = SEMVER.exec(raw.trim());
  if (!match) return null;
  const [, major, minor, patch, prerelease] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    // بيانات البناء (`+42`) تُهمَل عمداً: المواصفة تنصّ على أنها **لا** تدخل
    // في الأسبقية. رقم بناء Flutter (`version: 1.0.0+1`) يقع هنا تماماً،
    // فبناءان بنفس النسخة ورقمَي بناء مختلفين متساويان — وهو الصواب.
    prerelease: prerelease
      ? prerelease.split('.').map((part) => (NUMERIC.test(part) ? Number(part) : part))
      : [],
  };
}

/** يقارن معرّفات ما قبل الإصدار حسب قواعد الأسبقية في المواصفة. */
function comparePrerelease(
  a: readonly (string | number)[],
  b: readonly (string | number)[],
): number {
  // «النسخة التي لها ما قبل إصدار أدنى من نظيرتها المستقرّة»: 1.0.0-rc < 1.0.0.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    if (left === right) continue;
    const leftNumeric = typeof left === 'number';
    const rightNumeric = typeof right === 'number';
    // «المعرّفات الرقمية أدنى دائماً من المعرّفات النصّية».
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    if (leftNumeric && rightNumeric) return left < right ? -1 : 1;
    return String(left) < String(right) ? -1 : 1;
  }
  // تساوى ما قورن؛ الأطول أعلى (`1.0.0-a` < `1.0.0-a.1`).
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/** `-1` إن كانت `a` أقدم، `0` إن تساوتا، `1` إن كانت `a` أحدث. */
export function compareVersions(a: SemanticVersion, b: SemanticVersion): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

/** يقارن نصّين مباشرة، أو `null` إن كان أحدهما غير صالح. */
export function compareVersionStrings(a: unknown, b: unknown): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  return compareVersions(left, right);
}

/**
 * هل النسخة المثبَّتة أدنى من الحدّ الأدنى المدعوم؟
 *
 * [CRITICAL] `null` تعني «لا أعرف» لا «محجوب». النسخة غير الصالحة أو الحدّ
 * غير المضبوط يجب ألّا يحجبا أحداً: قرار الحجب لا يُتّخذ إلا بمقارنةٍ تمّت
 * فعلاً بين قيمتين صالحتين.
 */
export function isBelowMinimum(installed: unknown, minimum: unknown): boolean | null {
  const result = compareVersionStrings(installed, minimum);
  return result === null ? null : result < 0;
}
