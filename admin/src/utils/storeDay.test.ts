import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import { endOfStoreDayIso, isStoreDaySelectable } from './storeDay'

/**
 * اليوم المختار في اللوحة يومٌ من **تقويم المتجر** (`storeTimezone`)، لا من
 * تقويم متصفح المسؤول. كل حالةٍ هنا تُحسب في منطقةٍ غير بغداد عمداً وتُقارن
 * بلحظةٍ مطلقة معروفة سلفاً، فلا يؤثّر جهاز التشغيل في النتيجة.
 */
describe('endOfStoreDayIso — نهاية اليوم المختار بتقويم المتجر', () => {
  // اليوم يُمرَّر كما يعطيه منتقي التاريخ: منتصف ليل المتصفح المحلي لذلك التاريخ.
  const day = (iso: string) => dayjs(iso, 'YYYY-MM-DD')

  it('يوم عادي في بغداد (+03): نهاية اليوم = 20:59:59.999Z', () => {
    expect(endOfStoreDayIso(day('2026-09-21'), 'Asia/Baghdad')).toBe('2026-09-21T20:59:59.999Z')
  })

  it('منطقة أمام UTC بأربع عشرة ساعة: نهاية اليوم تقع في اليوم السابق بتوقيت UTC', () => {
    expect(endOfStoreDayIso(day('2026-09-21'), 'Pacific/Kiritimati')).toBe('2026-09-21T09:59:59.999Z')
  })

  it('منطقة خلف UTC: نهاية اليوم تقع في اليوم التالي بتوقيت UTC', () => {
    expect(endOfStoreDayIso(day('2026-09-21'), 'Pacific/Pago_Pago')).toBe('2026-09-22T10:59:59.999Z')
  })

  it('توقيت صيفي: الإزاحة هي إزاحة ذلك اليوم لا إزاحة اليوم', () => {
    // نيويورك: EDT (−04) في الصيف، EST (−05) في الشتاء.
    expect(endOfStoreDayIso(day('2026-07-04'), 'America/New_York')).toBe('2026-07-05T03:59:59.999Z')
    expect(endOfStoreDayIso(day('2026-01-15'), 'America/New_York')).toBe('2026-01-16T04:59:59.999Z')
    // يوم انتهاء التوقيت الصيفي نفسه (٢٠٢٦-١١-٠١): نهايته بعد الرجوع إلى EST.
    expect(endOfStoreDayIso(day('2026-11-01'), 'America/New_York')).toBe('2026-11-02T04:59:59.999Z')
  })

  it('حدود منتصف الليل: اليوم الأخير من الشهر والسنة', () => {
    expect(endOfStoreDayIso(day('2026-12-31'), 'Asia/Baghdad')).toBe('2026-12-31T20:59:59.999Z')
    expect(endOfStoreDayIso(day('2026-02-28'), 'Asia/Tokyo')).toBe('2026-02-28T14:59:59.999Z')
  })
})

describe('isStoreDaySelectable — «اليوم» بتقويم المتجر لا بتقويم المتصفح', () => {
  // اللحظة: ٢٠٢٦-٠٩-٢١ 22:30Z — في بغداد صار ٢٢ سبتمبر (01:30)، وفي نيويورك ما يزال ٢١ (18:30).
  const now = new Date('2026-09-21T22:30:00.000Z')

  it('يومٌ انتهى بتقويم المتجر لا يُختار ولو كان «اليوم» عند المسؤول', () => {
    const day = dayjs('2026-09-21', 'YYYY-MM-DD')
    expect(isStoreDaySelectable(day, 'Asia/Baghdad', now, 366)).toBe(false)
    expect(isStoreDaySelectable(day, 'America/New_York', now, 366)).toBe(true)
  })
})

/**
 * [F7] حدّ الـ٣٦٦ يوماً: الخادم يرفض لحظةً أبعد من `now + 366 × 24h`. اليوم
 * الأخير القابل للاختيار هو آخر يومٍ **نهايتُه** في منطقة المتجر داخل ذلك
 * الحدّ — لا اليوم الذي يبعد ٣٦٦ يوماً تقويمياً، فنهايتُه تتجاوزه بساعات
 * فيُقبل الرفع ثم يُرفض الوضع ويبقى الملف بلا مرجع.
 */
describe('isStoreDaySelectable — حدّ الـ٣٦٦ يوماً على نهاية اليوم لا على عدده', () => {
  // الآن: ٢٠٢٦-٠٩-٢١ 23:30 ببغداد. بعد ٣٦٦ يوماً بالضبط: ٢٠٢٧-٠٩-٢٢ 23:30 ببغداد.
  const now = new Date('2026-09-21T20:30:00.000Z')
  const zone = 'Asia/Baghdad'
  const day = (iso: string) => dayjs(iso, 'YYYY-MM-DD')
  const limit = now.getTime() + 366 * 24 * 60 * 60 * 1000

  it('اليوم قابل للاختيار: نهايته لم تمضِ', () => {
    expect(isStoreDaySelectable(day('2026-09-21'), zone, now, 366)).toBe(true)
  })

  it('آخر يومٍ صالح: نهايته داخل الحدّ', () => {
    expect(Date.parse(endOfStoreDayIso(day('2027-09-21'), zone))).toBeLessThanOrEqual(limit)
    expect(isStoreDaySelectable(day('2027-09-21'), zone, now, 366)).toBe(true)
  })

  it('[CRITICAL] اليوم الذي يبعد ٣٦٦ يوماً تقويمياً: نهايته تتجاوز الحدّ فلا يُعرض', () => {
    expect(Date.parse(endOfStoreDayIso(day('2027-09-22'), zone))).toBeGreaterThan(limit)
    expect(isStoreDaySelectable(day('2027-09-22'), zone, now, 366)).toBe(false)
  })

  it('ما بعده غير قابل للاختيار بالأولى', () => {
    expect(isStoreDaySelectable(day('2027-09-23'), zone, now, 366)).toBe(false)
  })
})
