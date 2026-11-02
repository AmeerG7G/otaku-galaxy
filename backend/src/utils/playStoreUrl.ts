/**
 * رابط صفحة التطبيق على Google Play — الشكل الوحيد المقبول لرابط التحديث.
 *
 * [SECURITY] رابط التحديث يفتحه تطبيق الزبون خارج التطبيق بضغطة واحدة، ومن
 * شاشةٍ لا مخرج منها سواه حين يكون التحديث إجبارياً. لو قُبل أي `http(s)`
 * لصار حقلٌ في اللوحة يوجّه كل المستخدمين إلى أي موقع (أو ملف APK من أي
 * مكان). لذلك: صفحة تطبيقٍ على `play.google.com` فقط، ولتطبيقنا فقط.
 *
 * القواعد نفسها في `web-store/src/lib/app-link.ts` (رابط «Google Play» في
 * الموقع) وفي `lib/features/app_update/domain/store_url.dart` (التطبيق) —
 * والخادم يضيف عليها قائمة الحِزم.
 */

/**
 * معرّفات تطبيقنا على أندرويد: الإنتاج ولاحقتا dev/staging
 * (`android/app/build.gradle.kts`: `applicationId` و`applicationIdSuffix`).
 *
 * [CRITICAL] معرّف الإنتاج لا يتغيّر أبداً (README §1) — يحرس التطابقَ
 * `tests/app-update-policy.test.ts`.
 */
export const APP_PACKAGE_IDS = [
  'com.otakugalaxy.otaku_galaxy',
  'com.otakugalaxy.otaku_galaxy.staging',
  'com.otakugalaxy.otaku_galaxy.dev',
] as const;

const PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

/**
 * الرابط القانوني `https://play.google.com/store/apps/details?id=<الحزمة>`، أو
 * `null` لكل ما سواه: مخطّط غير https، نطاقٌ آخر (ولو شبيهاً)، مستخدم/كلمة سر
 * أو منفذ في الرابط، مسارٌ غير صفحة التطبيق، أو حزمةٌ ليست تطبيقنا.
 *
 * يُعاد بناء الرابط من المعرّف وحده: معاملات أخرى (`hl`، `referrer`...) وجزء
 * `#` تُسقَط، فما يُحفظ ويُفتح هو ما يُعرض للمسؤول حرفياً.
 */
export function canonicalPlayStoreUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'play.google.com' || url.username || url.password || url.port) {
    return null;
  }
  if (url.pathname !== '/store/apps/details') return null;
  const ids = url.searchParams.getAll('id');
  if (ids.length !== 1) return null;
  const id = ids[0]!;
  if (!PACKAGE_PATTERN.test(id) || !(APP_PACKAGE_IDS as readonly string[]).includes(id)) return null;
  return `https://play.google.com/store/apps/details?id=${id}`;
}
