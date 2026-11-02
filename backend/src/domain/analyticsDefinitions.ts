/**
 * تعريفات التحليلات التاريخية — المصدر الوحيد (STEP 67، `definitions_version = 1`).
 *
 * كل رقمٍ تعرضه صفحة «التحليلات» يُشتقّ من هذه التعريفات، والملخّصات تحفظ رقم
 * الإصدار الذي حُسبت به. تغيير تعريفٍ = رفع `ANALYTICS_DEFINITIONS_VERSION` ثم
 * إعادة بناءٍ مُدقَّقة للأشهر المُغلقة (`scripts/analyticsRebuild.ts`).
 *
 * ═══ النطاق (D2) ═══
 * طلبات الأعمال وحدها: `analytics_business_orders` (دور صاحب الطلب ساعة الطلب
 * زبون، والحساب غير معلَّم داخلياً). الزبائن: `analytics_business_customers`
 * (زبون مفعَّل غير داخلي).
 *
 * ═══ الإيراد ═══
 *   الإجمالي (gross)        = Σ products_total      — طلبات COMPLETED بيوم delivered_at
 *   خصومات المنتجات         = Σ discount            (ميلاد + مزيّة المستوى)
 *     خصم المزيّة           = Σ loyalty_discount
 *     خصم الميلاد           = Σ (discount − loyalty_discount)
 *   إيراد المبيعات          = الإجمالي − خصومات المنتجات   (= eligiblePurchaseValue)
 *   [CRITICAL] رسوم التوصيل التي يدفعها الزبون **ليست إيراداً** ولا تدخل أي رقم
 *   إيراد. خصم التوصيل الترويجي يُعرض في «التسويق» كلفةً ترويجية لا إيراداً.
 *
 * ═══ غير المتاح (لا يُختلق أبداً) ═══
 *   كوبونات (لا نظام كوبونات)، مرتجعات/استرداد (لا مفهوم لهما)، كلفة التوصيل
 *   (لا تُخزَّن)، الربح لأي بندٍ بلا لقطة تكلفة، التخفيض الترويجي لبنودٍ بلا
 *   لقطة سعر، «وصول» إشعار الدفع، ومصدر الزبون (تيك توك/إنستغرام).
 *
 * ═══ الجنس ═══
 * فئتان فقط: ذكور وإناث. الحساب بلا جنس (شذوذ ما قبل ٠٤٠) لا يدخل تقسيم الجنس
 * ولا يُعرض كفئة أو ملاحظة؛ يدخل المجاميع غير الجنسية فقط إلى أن يُكمَل.
 */

export const ANALYTICS_DEFINITIONS_VERSION = 1;

/** مهلة إغلاق الشهر بعد نهايته (أيام). بعدها لا يتغيّر إلا بإعادة بناءٍ مُدقَّقة. */
export const CLOSE_GRACE_DAYS = 7;

/** كم يوماً قبل آخر يومٍ محسوب يُعاد حسابه في كل دور (للمعاملات المتأخّرة). */
export const RECOMPUTE_LOOKBACK_DAYS = 3;

/** أيام النشاط الخام (`user_daily_activity`) وعبارات البحث اليومية: ٤٠٠ يوم ثم تُطهَّر. */
export const RAW_TRACKING_RETENTION_DAYS = 400;

/** العبارة لا تظهر في «الأكثر بحثاً» إلا إن بُحث بها مرتين فأكثر في الشهر. */
export const SEARCH_TERM_MIN_COUNT = 2;

/** أعلى العبارات المجمَّدة لكل شهر. */
export const MONTHLY_TOP_SEARCH_TERMS = 50;

/** «قيد المعالجة» = طلبٌ لم يُحسم بعد (يشمل الحالتين الموروثتين). */
export const PROCESSING_STATUSES = [
  'PENDING_ADMIN_CONFIRMATION',
  'CONFIRMED',
  'PREPARING',
  'OUT_FOR_DELIVERY',
] as const;

/** اتجاه مبيعات المنتج لا يُحسب إلا إن بلغ أحد الطرفين هذا العدد من القطع. */
export const TREND_MIN_UNITS = 3;

/**
 * التغيّر النسبي — `null` حين لا يكون رياضياً صالحاً (الأساس صفر أو غائب).
 *
 * لا «نمو» من صفر: ١٠ مقابل ٠ ليس «+∞٪»، والواجهة تعرض «—».
 */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** الفرق المطلق — `null` إن غاب أحد الطرفين. */
export function absoluteChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 100) / 100;
}

/** «YYYY-MM» ← «YYYY-MM-01». */
export function monthKey(month: string): string {
  return month.slice(0, 7);
}
