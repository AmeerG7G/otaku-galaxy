import { describe, expect, it } from 'vitest'
import {
  daysInMonth,
  formatDateTyping,
  formatTimeTyping,
  isoToStoreParts,
  normalizeDigits,
  parseDateText,
  parseStoreDateTime,
  parseTimeText,
  storeDateFieldToIso,
  storeDateTimeToIso,
  storeDateToIso,
  storeToday,
} from './storeDate'

describe('الكتابة: أرقامٌ عربية-هندية وفواصل تلقائية', () => {
  it('الأرقام العربية-الهندية والفارسية ← لاتينية', () => {
    expect(normalizeDigits('٢٠٢٦-١١-٠٥')).toBe('2026-11-05')
    expect(normalizeDigits('۱۴:۳۰')).toBe('14:30')
  })

  it('[CRITICAL] لوحة أرقام بلا «-» (iOS): الفواصل تُدرج أثناء الكتابة', () => {
    expect(formatDateTyping('2026')).toBe('2026')
    expect(formatDateTyping('202611')).toBe('2026-11')
    expect(formatDateTyping('20261105')).toBe('2026-11-05')
    expect(formatDateTyping('٢٠٢٦١١٠٥')).toBe('2026-11-05')
    expect(formatDateTyping('2026/11/05')).toBe('2026-11-05')
    expect(formatDateTyping('2026-11-05-99')).toBe('2026-11-05')
    expect(formatTimeTyping('1430')).toBe('14:30')
    expect(formatTimeTyping('١٤٣٠')).toBe('14:30')
  })
})

describe('parseDateText — تاريخ تقويمي حقيقي', () => {
  it('الفارغ اختياري — لا تاريخ عرضي', () => {
    expect(parseDateText('')).toEqual({ kind: 'empty' })
    expect(parseDateText(null)).toEqual({ kind: 'empty' })
    expect(parseDateText('   ')).toEqual({ kind: 'empty' })
  })

  it('تاريخٌ صالح', () => {
    expect(parseDateText('2026-11-05')).toMatchObject({ kind: 'ok', year: 2026, month: 11, day: 5 })
  })

  it('[CRITICAL] السنوات الكبيسة: 29 فبراير في 2024 و2000 فقط', () => {
    expect(parseDateText('2024-02-29').kind).toBe('ok')
    expect(parseDateText('2000-02-29').kind).toBe('ok')
    expect(parseDateText('2026-02-29').kind).toBe('error')
    expect(parseDateText('2100-02-29').kind).toBe('error')
    expect(daysInMonth(2100, 2)).toBe(28)
  })

  it('[CRITICAL] تواريخ مستحيلة تُرفض برسالةٍ عربية تقول السبب', () => {
    const april31 = parseDateText('2026-04-31')
    expect(april31).toMatchObject({ kind: 'error' })
    expect((april31 as { message: string }).message).toBe('اليوم غير صالح — الشهر 04 من 2026 فيه 30 يوماً')
    expect(parseDateText('2026-13-01')).toMatchObject({ kind: 'error', message: 'الشهر يجب أن يكون بين 01 و12' })
    expect(parseDateText('2026-00-10').kind).toBe('error')
    expect(parseDateText('2026-11-00').kind).toBe('error')
    expect(parseDateText('2026-11').kind).toBe('error')
    expect(parseDateText('1999-01-01').kind).toBe('error')
  })
})

describe('parseTimeText — ٢٤ ساعة', () => {
  it('صالحٌ وحدوده', () => {
    expect(parseTimeText('00:00')).toMatchObject({ kind: 'ok', hour: 0, minute: 0 })
    expect(parseTimeText('23:59')).toMatchObject({ kind: 'ok', hour: 23, minute: 59 })
    expect(parseTimeText('')).toEqual({ kind: 'empty' })
  })
  it('مستحيلٌ يُرفض', () => {
    expect(parseTimeText('24:00').kind).toBe('error')
    expect(parseTimeText('12:60').kind).toBe('error')
    expect(parseTimeText('9').kind).toBe('error')
  })
})

describe('[CRITICAL] توقيت بغداد (UTC+03:00) لا توقيت المتصفّح', () => {
  it('تاريخٌ فقط ← منتصف ليل بغداد = 21:00Z من اليوم السابق', () => {
    expect(storeDateToIso('2026-11-05')).toBe('2026-11-04T21:00:00.000Z')
    expect(storeDateToIso('2026-01-01')).toBe('2025-12-31T21:00:00.000Z')
    expect(storeDateToIso('2028-02-29')).toBe('2028-02-28T21:00:00.000Z')
    expect(storeDateToIso('2026-02-30')).toBeNull()
  })

  it('تاريخٌ ووقت ← تلك الساعة في بغداد', () => {
    expect(storeDateTimeToIso({ year: 2026, month: 11, day: 5 }, { hour: 14, minute: 30 })).toBe(
      '2026-11-05T11:30:00.000Z',
    )
    expect(storeDateTimeToIso({ year: 2026, month: 11, day: 5 }, { hour: 2, minute: 0 })).toBe(
      '2026-11-04T23:00:00.000Z',
    )
  })

  it('اللحظة المخزَّنة تُقرأ بيومها وساعتها في بغداد — ذهاباً وإياباً بلا إزاحة', () => {
    expect(isoToStoreParts('2026-10-12T21:00:00.000Z')).toEqual({ date: '2026-10-13', time: '00:00' })
    expect(isoToStoreParts('2026-12-31T21:30:00.000Z')).toEqual({ date: '2027-01-01', time: '00:30' })
    const iso = storeDateToIso('2026-11-05')!
    expect(isoToStoreParts(iso).date).toBe('2026-11-05')
  })

  it('«اليوم» في بغداد يتقدّم على UTC بعد 21:00Z', () => {
    expect(storeToday(new Date('2026-10-26T20:59:00Z'))).toBe('2026-10-26')
    expect(storeToday(new Date('2026-10-26T21:00:00Z'))).toBe('2026-10-27')
  })
})

describe('storeDateFieldToIso — حقل «متوقع التوفر»', () => {
  const loaded = '2026-11-05T11:30:00.000Z' // حدّدته صفحة «طلبات التوفر» بالساعة

  it('الفارغ ← null، والاختياري لا يصير تاريخاً', () => {
    expect(storeDateFieldToIso('')).toBeNull()
    expect(storeDateFieldToIso(undefined)).toBeNull()
    expect(storeDateFieldToIso(null, loaded)).toBeNull()
  })

  it('قيمةٌ محمَّلة لم تُلمس، أو اليوم نفسه مكتوباً ← اللحظة كما هي (لا يُمسّ الوقت)', () => {
    expect(storeDateFieldToIso(loaded, loaded)).toBe(loaded)
    expect(storeDateFieldToIso('2026-11-05', loaded)).toBe(loaded)
  })

  it('يومٌ آخر ← منتصف ليله في بغداد', () => {
    expect(storeDateFieldToIso('2026-11-06', loaded)).toBe('2026-11-05T21:00:00.000Z')
    expect(storeDateFieldToIso('٢٠٢٦١١٠٦')).toBe('2026-11-05T21:00:00.000Z')
  })
})

describe('parseStoreDateTime', () => {
  const now = new Date('2026-10-26T12:00:00Z') // ١٥:٠٠ في بغداد
  it('تاريخٌ ووقت ← لحظة بغداد', () => {
    expect(parseStoreDateTime('2026-11-05', '14:30')).toEqual({ kind: 'ok', iso: '2026-11-05T11:30:00.000Z' })
  })
  it('الوقت الفارغ = 00:00 ما لم يُطلب', () => {
    expect(parseStoreDateTime('2026-11-05', '')).toEqual({ kind: 'ok', iso: '2026-11-04T21:00:00.000Z' })
    expect(parseStoreDateTime('2026-11-05', '', { requireTime: true }).kind).toBe('error')
  })
  it('الفارغان معاً ← لا موعد؛ وقتٌ بلا تاريخ ← خطأ', () => {
    expect(parseStoreDateTime('', '')).toEqual({ kind: 'empty' })
    expect(parseStoreDateTime('', '10:00').kind).toBe('error')
  })
  it('[CRITICAL] الماضي بتوقيت بغداد يُرفض — حتى ساعةٌ مضت اليوم', () => {
    expect(parseStoreDateTime('2026-10-26', '14:59', { notBefore: now }).kind).toBe('error')
    expect(parseStoreDateTime('2026-10-26', '15:01', { notBefore: now }).kind).toBe('ok')
  })
  it('تاريخٌ مستحيل يُرفض قبل أي تحويل', () => {
    expect(parseStoreDateTime('2026-02-29', '10:00').kind).toBe('error')
  })
})
