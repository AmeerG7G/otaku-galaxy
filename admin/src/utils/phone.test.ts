import { describe, expect, it } from 'vitest'
import { IRAQI_MOBILE_LENGTH, IRAQI_MOBILE_PATTERN, whatsappUrl } from './phone'

describe('رابط واتساب', () => {
  it('يجرّد + من الصيغة الدولية المخزَّنة', () => {
    expect(whatsappUrl('+9647701234567')).toBe('https://wa.me/9647701234567')
  })

  it('يجرّد الفواصل والمسافات', () => {
    expect(whatsappUrl('+964 770-123 4567')).toBe('https://wa.me/9647701234567')
  })

  it('لا يقصّ الرقم ولا يخفي أياً من خاناته', () => {
    const url = whatsappUrl('+9647701234567')!
    expect(url).toContain('7701234567')
    expect(url).not.toContain('*')
  })

  it('يعيد null لرقم قصير أو فارغ بدل فتح رابط معطوب', () => {
    expect(whatsappUrl('')).toBeNull()
    expect(whatsappUrl('12345')).toBeNull()
  })
})

describe('حقل هاتف الدخول — موبايل عراقي كامل يبدأ بـ07', () => {
  it('يقبل 075–079 بأحد عشر رقماً', () => {
    for (const value of ['07501234567', '07601234567', '07701234567', '07801234567', '07901234567']) {
      expect(IRAQI_MOBILE_PATTERN.test(value), value).toBe(true)
    }
  })

  it('يرفض ما يرفضه الخادم: بلا 07، الطول الخاطئ، 070–074، الأرضي والأجنبي', () => {
    for (const value of [
      '7701234567',
      '0770123456',
      '077012345678',
      '07001234567',
      '07401234567',
      '0662251234',
      '+9647701234567',
      '+447700900123',
      '00989121234567',
      '0770 123 4567',
      'abc',
      '',
    ]) {
      expect(IRAQI_MOBILE_PATTERN.test(value), value).toBe(false)
    }
    expect(IRAQI_MOBILE_LENGTH).toBe(11)
  })
})
