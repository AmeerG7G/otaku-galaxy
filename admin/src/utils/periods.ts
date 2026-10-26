/**
 * فترات «التحليلات» — أشهرٌ «YYYY-MM» بتقويم المتجر (Asia/Baghdad).
 *
 * [CRITICAL] «الشهر الجاري» يُحسم بتوقيت المتجر لا بمنطقة متصفّح المسؤول: مسؤولٌ
 * في منطقةٍ أخرى بعد منتصف ليل بغداد يرى الشهر نفسه الذي يحسبه الخادم.
 */

export const STORE_TIMEZONE = 'Asia/Baghdad'

export type PeriodPreset = 'current' | 'previous' | 'last3' | 'last6' | 'year' | 'prevYear' | 'all' | 'custom'

export const PERIOD_PRESETS: Array<{ value: PeriodPreset; label: string }> = [
  { value: 'current', label: 'الشهر الحالي' },
  { value: 'previous', label: 'الشهر السابق' },
  { value: 'last3', label: 'آخر ٣ أشهر' },
  { value: 'last6', label: 'آخر ٦ أشهر' },
  { value: 'year', label: 'السنة الحالية' },
  { value: 'prevYear', label: 'السنة السابقة' },
  { value: 'all', label: 'كل الفترات' },
  { value: 'custom', label: 'مدى مخصّص' },
]

/** «اليوم» بتقويم المتجر — YYYY-MM-DD. */
export function storeToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function currentMonth(now: Date = new Date()): string {
  return storeToday(now).slice(0, 7)
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function isMonth(value: string | null | undefined): value is string {
  return typeof value === 'string' && MONTH_RE.test(value)
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const index = y! * 12 + (m! - 1) + delta
  const year = Math.floor(index / 12)
  const mon = (index % 12) + 1
  return `${year}-${String(mon).padStart(2, '0')}`
}

/** المدى [from, to] لاختيارٍ جاهز. `firstMonth` = أول شهرٍ له بيانات (لـ«كل الفترات»). */
export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, now: Date = new Date(), firstMonth?: string) {
  const month = currentMonth(now)
  const year = month.slice(0, 4)
  switch (preset) {
    case 'current':
      return { from: month, to: month }
    case 'previous': {
      const previous = shiftMonth(month, -1)
      return { from: previous, to: previous }
    }
    case 'last3':
      return { from: shiftMonth(month, -2), to: month }
    case 'last6':
      return { from: shiftMonth(month, -5), to: month }
    case 'year':
      return { from: `${year}-01`, to: month }
    case 'prevYear': {
      const last = String(Number(year) - 1)
      return { from: `${last}-01`, to: `${last}-12` }
    }
    case 'all':
      return { from: firstMonth && firstMonth < month ? firstMonth : month, to: month }
  }
}

const MONTH_LABEL = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const SHORT_MONTH_LABEL = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { month: 'short', timeZone: 'UTC' })
const DAY_LABEL = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** «أيلول 2026» — أسماء الأشهر كما تُكتب في العراق. */
export function monthLabel(month: string): string {
  return MONTH_LABEL.format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`))
}

export function shortMonthLabel(month: string): string {
  return SHORT_MONTH_LABEL.format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`))
}

export function dayLabel(day: string): string {
  return DAY_LABEL.format(new Date(`${day}T00:00:00Z`))
}

/** وصف المدى: «أيلول 2026» أو «تموز 2026 – أيلول 2026». */
export function rangeLabel(from: string, to: string): string {
  return from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`
}

const INTEGER = new Intl.NumberFormat('ar-IQ-u-nu-latn', { maximumFractionDigits: 0 })
const DECIMAL = new Intl.NumberFormat('ar-IQ-u-nu-latn', { maximumFractionDigits: 2 })

export function formatNumber(value: number | null | undefined, decimals = false): string {
  if (value === null || value === undefined) return '—'
  return (decimals ? DECIMAL : INTEGER).format(value)
}

export function formatIqd(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${INTEGER.format(value)} د.ع`
}

/** «+55.3%» أو «−12%» — و«—» حين لا يكون التغيّر صالحاً (أساسٌ صفري). */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${DECIMAL.format(Math.abs(value))}%`
}
