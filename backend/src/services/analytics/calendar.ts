/**
 * حساب التقويم لأيام المتجر — تواريخ «YYYY-MM-DD» بلا منطقة زمنية.
 *
 * [CRITICAL] اليوم نفسه («أيّ يومٍ في بغداد») تحسمه القاعدة دائماً
 * (`(ts AT TIME ZONE storeTimezone)::date`). هنا حسابٌ تقويميّ خالص على نصوص
 * التواريخ (إضافة أيام، حدود الشهر)، يجري على منتصف ليل UTC فلا يتأثّر بمنطقة
 * خادم Node. ولا يُقرأ عمود DATE من pg كـ`Date` أبداً (يُحوَّل إلى منتصف ليلٍ
 * محلّي): استعلامات التحليلات تعيد التواريخ نصّاً (`::text`).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(day: string): Date {
  if (!DATE_RE.test(day)) throw new Error(`invalid calendar date: ${day}`);
  return new Date(`${day}T00:00:00Z`);
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  const date = toUtc(day);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

/** أول يوم في شهر اليوم المعطى. */
export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** آخر يوم في شهر اليوم المعطى. */
export function monthEnd(day: string): string {
  const date = toUtc(monthStart(day));
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return fromUtc(date);
}

export function addMonths(month: string, months: number): string {
  const date = toUtc(monthStart(month));
  date.setUTCMonth(date.getUTCMonth() + months);
  return fromUtc(date);
}

/** الأيام من `from` إلى `to` شاملةً (فارغة إن تجاوز البدء النهاية). */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** بدايات الأشهر من شهر `from` إلى شهر `to` شاملةً. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = monthStart(from); month <= monthStart(to); month = addMonths(month, 1)) months.push(month);
  return months;
}

export function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  return fromUtc(toUtc(value)) === value;
}
