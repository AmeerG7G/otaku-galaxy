import type { Request } from 'express';

/**
 * لغات المخاطبة المدعومة.
 *
 * `ckb` هي الكردية الوسطى (سوراني) بمعيار ISO 639-3 — لا `ku` التي ترمز
 * لمجموعة اللغات الكردية كلها. الرمز نفسه مستعمل في `AppLanguage` داخل
 * التطبيق وفي عمود `users.preferred_language`، فالسلسلة كلها تتكلّم رمزاً
 * واحداً: تطبيق ← API ← قاعدة ← إشعارات.
 */
export const APP_LOCALES = ['ar', 'ckb'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

/** العربية مرجعٌ واحتياط: كل محتوى موجود بها، ولا شيء يظهر فارغاً بسببها. */
export const DEFAULT_LOCALE: AppLocale = 'ar';

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (APP_LOCALES as readonly string[]).includes(value);
}

/**
 * لغة هذا الطلب — بترتيب أولوية واحد لا يتغيّر بين نقطة وأخرى.
 *
 * 0. لغةٌ مثبَّتة بوسيط `pinLocale` على المسار (لوحة الإدارة → العربية).
 * 1. ترويسة `Accept-Language` إن حملت لغةً مدعومة — وهي **لغة الواجهة الآن**
 *    كما يرسلها التطبيق مع كل طلب (زائراً كان أم مسجَّلاً).
 * 2. تفضيل المستخدم المصادَق عليه (`req.auth.locale`) — لطلبٍ بلا ترويسة
 *    (عميل قديم، أداة)، وهو المصدر الذي تعتمده الإشعارات لأنها تُبنى بلا طلب.
 * 3. العربية.
 *
 * [CRITICAL] لماذا الترويسة قبل العمود؟ كان العمود أولاً، فتبديل اللغة في
 * التطبيق (الذي يدفع `PATCH /auth/me` بصمت وبلا انتظار) كان يترك كل جلبٍ
 * يسبق وصول التحديث — أو يفشل بلا شبكة — بلغة العمود القديمة: أقسام كردية
 * في واجهة عربية. الترويسة تصف الطلب الحالي بلا سباق؛ العمود يبقى مصدر ما
 * لا طلب له.
 *
 * [CRITICAL] لا معامل استعلام `?lang=`. آليةٌ ثانية تعني نقطتين تختلفان في
 * لغتهما داخل الشاشة الواحدة حين ينسى أحدهما المعامل.
 */
export function resolveLocale(req: Request): AppLocale {
  // ٠. لغةٌ مثبَّتها وسيطُ المسار (`pinLocale`) — لوحة الإدارة عربيةٌ دائماً.
  if (isAppLocale(req.pinnedLocale)) return req.pinnedLocale;

  const header = req.headers['accept-language'];
  if (typeof header === 'string') {
    // `ckb-IQ,ckb;q=0.9,ar;q=0.8` ← نأخذ أول وسمٍ مدعوم بترتيب وروده.
    for (const part of header.split(',')) {
      const tag = part.split(';')[0]?.trim().toLowerCase() ?? '';
      const base = tag.split('-')[0];
      if (isAppLocale(tag)) return tag;
      if (isAppLocale(base)) return base;
    }
  }

  const fromUser = (req.auth as { locale?: unknown } | undefined)?.locale;
  if (isAppLocale(fromUser)) return fromUser;

  return DEFAULT_LOCALE;
}

/**
 * يختار النصّ باللغة المطلوبة، ويسقط إلى العربية عند غياب الكردية.
 *
 * [CRITICAL] الفراغ والمسافات البيضاء تُعامَل معاملة الغياب. صفٌّ حُفظ
 * بكرديةٍ فارغة (`''`) كان سيمرّ فحص `!= null` ويُخرج للزبون سطراً فارغاً —
 * وهو أسوأ من العربية، لأن الشاشة تبدو مكسورة لا غير مترجَمة.
 */
export function pickLocalized(
  arabic: string,
  kurdish: string | null | undefined,
  locale: AppLocale,
): string {
  if (locale === 'ckb' && typeof kurdish === 'string' && kurdish.trim() !== '') {
    return kurdish;
  }
  return arabic;
}

/** هل ينقص هذا الصفَّ نصٌّ كردي؟ */
export function isMissingKurdish(kurdish: string | null | undefined): boolean {
  return typeof kurdish !== 'string' || kurdish.trim() === '';
}

/**
 * النصّ الكردي كما يخرج في الـAPI: نصٌّ حاضر، أو `null` — صورة «ناقص» الوحيدة.
 *
 * [CRITICAL] العميل يقرّر «ناقص» بـ`== null` وحده. ترك `''` أو مسافاتٍ تخرج
 * كان سيجعله يعرض سطراً فارغاً على أنه «الكردية» — بنفس القاعدة التي تجعل
 * [pickLocalized] يعامل الفراغ معاملة الغياب.
 */
export function kurdishOrNull(kurdish: string | null | undefined): string | null {
  return isMissingKurdish(kurdish) ? null : (kurdish as string);
}

/**
 * اسم منتجٍ بلغتيه — لقطةً كان أو محتوىً حيّاً — لنصٍّ يُولَّد لمستلمٍ بلغته
 * (إشعار التوفر، إشعار اعتماد التقييم). `ckb` قد تغيب: يُسقط إلى العربية بـ
 * [pickLocalized] كأي نصٍّ آخر.
 */
export interface ProductNames {
  ar: string;
  ckb: string | null;
}

export function pickProductName(names: ProductNames, locale: AppLocale): string {
  return pickLocalized(names.ar, names.ckb, locale);
}

/**
 * نظيرُ [pickLocalized] للقوائم (قيم خيارات المنتج).
 *
 * الشرط أن تتطابق الأطوال: قائمةٌ كرديةٌ أقصر تعني قيماً بلا مقابل، وخلطُ
 * لغتين داخل قائمةٍ واحدة أسوأ من عرضها كلها بالعربية. القيد نفسه مفروض في
 * القاعدة (هجرة ٠٤٦).
 */
export function pickLocalizedList(
  arabic: string[],
  kurdish: string[] | null | undefined,
  locale: AppLocale,
): string[] {
  if (
    locale === 'ckb' &&
    Array.isArray(kurdish) &&
    kurdish.length === arabic.length &&
    kurdish.every((v) => typeof v === 'string' && v.trim() !== '')
  ) {
    return kurdish;
  }
  return arabic;
}
