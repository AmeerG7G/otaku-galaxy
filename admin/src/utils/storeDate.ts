/**
 * إدخال التواريخ يدوياً في توقيت المتجر (بغداد) — 2026-10-26.
 *
 * [PRODUCT] المالك: تقويم antd الكبير صعبٌ على الهاتف. التاريخ يُكتب بلوحة
 * المفاتيح بصيغةٍ واحدة `YYYY-MM-DD` (والوقت `HH:mm` بنظام ٢٤ ساعة)، والتقويم
 * بديلٌ اختياري. هذه الدوال وحدها تحوّل بين النصّ المكتوب واللحظة المرسَلة.
 *
 * [CRITICAL] المعنى الزمني صريح لا يتبع متصفّح المسؤول:
 * - «تاريخ فقط» (موعد التوفر في نموذج المنتج) = منتصف ليل ذلك اليوم **في بغداد**
 *   ← `21:00Z` من اليوم السابق. كان `dayjs().toISOString()` يتبع منطقة المتصفّح،
 *   فمسؤولٌ خارج العراق كان يحفظ يوماً آخر.
 * - «تاريخ ووقت» = تلك الساعة في بغداد.
 * العراق على UTC+03:00 بلا توقيت صيفي (منذ ٢٠٠٨)، فالإزاحة ثابتة. الصيغة
 * المرسَلة كما هي اليوم: ISO-8601 بتوقيت UTC (`…Z`) — لا تغيير في عقد الـAPI.
 */

/** إزاحة توقيت المتجر عن UTC بالدقائق. */
export const STORE_OFFSET_MINUTES = 180

const OFFSET_MS = STORE_OFFSET_MINUTES * 60_000

/** الأرقام العربية-الهندية (٠–٩) والفارسية (۰–۹) ← لاتينية. */
export function normalizeDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

/**
 * ما يُعرض في الحقل أثناء الكتابة: الأرقام وحدها تُقرأ، والفواصل تُدرج
 * تلقائياً (لوحة الأرقام في iOS بلا «-»). «20261105» و«2026/11/05» و«٢٠٢٦-١١-٠٥»
 * كلها ← «2026-11-05».
 */
export function formatDateTyping(raw: string): string {
  const digits = normalizeDigits(raw).replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}

/** «1430» / «14:30» / «١٤:٣٠» ← «14:30». */
export function formatTimeTyping(raw: string): string {
  const digits = normalizeDigits(raw).replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!
}

export type DateParse =
  | { kind: 'empty' }
  | { kind: 'ok'; year: number; month: number; day: number; text: string }
  | { kind: 'error'; message: string }

export const DATE_FORMAT_HINT = 'سنة-شهر-يوم، مثال: 2026-11-05'
export const TIME_FORMAT_HINT = 'ساعة:دقيقة بنظام ٢٤ ساعة، مثال: 14:30'

/** تاريخٌ تقويمي حقيقي بصيغة `YYYY-MM-DD` (الأشهر وطولها والسنوات الكبيسة). */
export function parseDateText(raw: string | null | undefined): DateParse {
  const text = formatDateTyping(raw ?? '')
  if (text === '') return { kind: 'empty' }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) {
    return { kind: 'error', message: `التاريخ غير مكتمل — اكتبه بالشكل ${DATE_FORMAT_HINT}` }
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 2000 || year > 2100) {
    return { kind: 'error', message: 'السنة يجب أن تكون بين 2000 و2100' }
  }
  if (month < 1 || month > 12) {
    return { kind: 'error', message: 'الشهر يجب أن يكون بين 01 و12' }
  }
  const max = daysInMonth(year, month)
  if (day < 1 || day > max) {
    return {
      kind: 'error',
      message: `اليوم غير صالح — الشهر ${match[2]} من ${year} فيه ${max} يوماً`,
    }
  }
  return { kind: 'ok', year, month, day, text }
}

export type TimeParse =
  | { kind: 'empty' }
  | { kind: 'ok'; hour: number; minute: number; text: string }
  | { kind: 'error'; message: string }

export function parseTimeText(raw: string | null | undefined): TimeParse {
  const text = formatTimeTyping(raw ?? '')
  if (text === '') return { kind: 'empty' }
  const match = /^(\d{2}):(\d{2})$/.exec(text)
  const hour = Number(match?.[1])
  const minute = Number(match?.[2])
  if (!match || hour > 23 || minute > 59) {
    return { kind: 'error', message: `الوقت غير صالح — اكتبه بالشكل ${TIME_FORMAT_HINT}` }
  }
  return { kind: 'ok', hour, minute, text }
}

/** لحظة (ISO، UTC) لساعةٍ ودقيقةٍ في يومٍ ما بتوقيت بغداد. */
export function storeDateTimeToIso(
  date: { year: number; month: number; day: number },
  time: { hour: number; minute: number } = { hour: 0, minute: 0 },
): string {
  const utc = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute) - OFFSET_MS
  return new Date(utc).toISOString()
}

/** «2026-11-05» ← لحظة منتصف ليل ذلك اليوم في بغداد (`2026-11-04T21:00:00.000Z`). */
export function storeDateToIso(text: string): string | null {
  const parsed = parseDateText(text)
  return parsed.kind === 'ok' ? storeDateTimeToIso(parsed) : null
}

/** لحظةٌ (ISO) ← { date: «YYYY-MM-DD», time: «HH:mm» } بتوقيت بغداد. */
export function isoToStoreParts(iso: string): { date: string; time: string } {
  const store = new Date(new Date(iso).getTime() + OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${store.getUTCFullYear()}-${pad(store.getUTCMonth() + 1)}-${pad(store.getUTCDate())}`,
    time: `${pad(store.getUTCHours())}:${pad(store.getUTCMinutes())}`,
  }
}

/** هل النصّ لحظةٌ ISO كاملة (قيمةٌ محمَّلة لم يلمسها المسؤول)؟ */
export function isIsoInstant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
}

/** اليوم الحالي في بغداد بصيغة «YYYY-MM-DD» — لمقارنة «في الماضي». */
export function storeToday(now: Date = new Date()): string {
  return isoToStoreParts(now.toISOString()).date
}

/**
 * حقل «تاريخ فقط» يحمل لحظة ISO محمَّلة أو نصّاً كتبه المسؤول ← ما يُرسَل.
 *
 * - فارغ ← `null` (موعدٌ اختياري يبقى فارغاً، لا تاريخ عرضي).
 * - اللحظة المحمَّلة نفسها، أو نصٌّ يساوي يومها في بغداد ← تُعاد كما هي (لا يُمسّ
 *   وقتٌ حدّدته صفحة «طلبات التوفر» بالساعة).
 * - غير ذلك ← منتصف ليل اليوم المكتوب في بغداد.
 */
export function storeDateFieldToIso(value: string | null | undefined, loaded?: string | null): string | null {
  if (value === null || value === undefined || value === '') return null
  if (isIsoInstant(value)) return value
  const parsed = parseDateText(value)
  if (parsed.kind !== 'ok') return null
  if (loaded && isoToStoreParts(loaded).date === parsed.text) return loaded
  return storeDateTimeToIso(parsed)
}

export type DateTimeParse = { kind: 'ok'; iso: string } | { kind: 'error'; message: string } | { kind: 'empty' }

/**
 * تاريخٌ ووقتٌ مكتوبان ← لحظةٌ في بغداد. الوقت الفارغ = بداية اليوم (00:00)
 * ما لم يُطلب صراحةً. `notBefore`: لحظةٌ لا يُقبل ما قبلها (موعدٌ في الماضي).
 */
export function parseStoreDateTime(
  dateText: string | null | undefined,
  timeText: string | null | undefined,
  { requireTime = false, notBefore }: { requireTime?: boolean; notBefore?: Date } = {},
): DateTimeParse {
  const date = parseDateText(dateText)
  const time = parseTimeText(timeText)
  if (date.kind === 'empty' && time.kind === 'empty') return { kind: 'empty' }
  if (date.kind === 'empty') return { kind: 'error', message: `اكتب التاريخ (${DATE_FORMAT_HINT})` }
  if (date.kind === 'error') return date
  if (time.kind === 'error') return time
  if (time.kind === 'empty' && requireTime) {
    return { kind: 'error', message: `اكتب الوقت (${TIME_FORMAT_HINT})` }
  }
  const iso = storeDateTimeToIso(date, time.kind === 'ok' ? time : undefined)
  if (notBefore && new Date(iso).getTime() < notBefore.getTime()) {
    return { kind: 'error', message: 'الموعد في الماضي — اختر تاريخاً ووقتاً قادمين (بتوقيت بغداد)' }
  }
  return { kind: 'ok', iso }
}
