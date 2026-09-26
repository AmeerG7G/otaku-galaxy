import dayjs, { type Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * أيام **المتجر**.
 *
 * [CRITICAL] «مؤقّتة حتى يوم» سؤالٌ تقويمي، وتقويم المتجر هو منطقته الزمنية
 * التي يعلنها الخادم (`storeTimezone`، بغداد افتراضياً) — لا منطقة متصفح
 * المسؤول ولا UTC، كما تُحسب أعياد الميلاد. مسؤولٌ يفتح اللوحة من منطقةٍ
 * أخرى يختار اليوم نفسه الذي يراه الزبون في بغداد، وتُرسَل نهايته لحظةً
 * مطلقة (ISO 8601) يقارنها الخادم بساعته.
 *
 * منتقي التاريخ يعطي اليوم منتصفَ ليلٍ بتوقيت المتصفح؛ لا يُؤخذ منه إلا
 * التاريخ (سنة/شهر/يوم) ثم يُقرأ في منطقة المتجر.
 */

/** نهاية اليوم المختار في منطقة المتجر — لحظةً مطلقة ISO 8601. */
export function endOfStoreDayIso(day: Dayjs, zone: string): string {
  return dayjs.tz(`${day.format('YYYY-MM-DD')} 23:59:59.999`, zone).toISOString()
}

/**
 * هل يقبل الخادم هذا اليوم؟ **نهايته** في منطقة المتجر لم تمضِ بعد، وليست
 * أبعد من `now + maxDays × 24h` — القاعدة نفسها التي يحكم بها الخادم على
 * اللحظة المرسَلة، فلا يُعرض يومٌ سيُرفض. الحكم النهائي يبقى للخادم.
 *
 * [CRITICAL] الحدّ على نهاية اليوم لا على عدد الأيام: اليوم الذي يبعد
 * ٣٦٦ يوماً تقويمياً تتجاوز نهايتُه الحدّ بساعات، فكان يُقبل الرفع ثم
 * يُرفض الوضع ويبقى الملف المرفوع بلا مرجع.
 */
export function isStoreDaySelectable(day: Dayjs, zone: string, now: Date, maxDays: number): boolean {
  const end = Date.parse(endOfStoreDayIso(day, zone))
  return end > now.getTime() && end <= now.getTime() + maxDays * 24 * 60 * 60 * 1000
}
