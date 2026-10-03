import { describe, expect, it } from 'vitest'
import { IRAQI_MOBILE_LENGTH, IRAQI_MOBILE_PATTERN, formatIraqiPhone, whatsappUrl } from './phone'

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
    expect(whatsappUrl(null)).toBeNull()
    expect(whatsappUrl(undefined)).toBeNull()
  })

  it('[STEP 64] يطبّع الرقم العراقي المحلي — wa.me لا يقبل 07…', () => {
    for (const raw of ['07701234567', '0770 123 4567', '7701234567', '9647701234567', '009647701234567', '+964 770 123 4567']) {
      expect(whatsappUrl(raw), raw).toBe('https://wa.me/9647701234567')
    }
  })

  it('[STEP 64] رقمٌ مقنَّع أو عراقيٌّ غير صالح لا رابط له', () => {
    expect(whatsappUrl('0770****567')).toBeNull()
    expect(whatsappUrl('07401234567')).toBeNull()
    expect(whatsappUrl('0770123456')).toBeNull()
    expect(whatsappUrl('+96477012345678')).toBeNull()
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

describe('عرض الهاتف في اللوحة — الموبايل العراقي بصيغته المحلية 07…', () => {
  it('الصيغة المخزَّنة E.164 وأشكالها الدولية الأخرى ← 07…', () => {
    expect(formatIraqiPhone('+9647801234567')).toBe('07801234567')
    expect(formatIraqiPhone('9647801234567')).toBe('07801234567')
    expect(formatIraqiPhone('009647801234567')).toBe('07801234567')
  })

  it('الصيغة المحلية تبقى كما هي، والرقم الوطني بلا صفر يُكمَّل', () => {
    expect(formatIraqiPhone('07801234567')).toBe('07801234567')
    expect(formatIraqiPhone('7801234567')).toBe('07801234567')
  })

  it('كل نطاقات المحمول 075–079', () => {
    for (const range of ['75', '76', '77', '78', '79']) {
      expect(formatIraqiPhone(`+964${range}01234567`), range).toBe(`0${range}01234567`)
    }
  })

  it('الفواصل المألوفة والفراغ المحيط لا تمنع التعرّف', () => {
    expect(formatIraqiPhone(' +964 780 123 4567 ')).toBe('07801234567')
    expect(formatIraqiPhone('+964-780-123-4567')).toBe('07801234567')
    expect(formatIraqiPhone('0780 123 4567')).toBe('07801234567')
  })

  it('التنسيق المكرَّر لا يغيّر شيئاً', () => {
    for (const raw of ['+9647801234567', '9647801234567', '07801234567', '7801234567', '+447700900123', 'غير متوفر']) {
      const once = formatIraqiPhone(raw)
      expect(formatIraqiPhone(once), raw).toBe(once)
    }
  })

  it('القيمة الغائبة أو الفارغة ← نصّ فارغ بلا استثناء', () => {
    expect(formatIraqiPhone(null)).toBe('')
    expect(formatIraqiPhone(undefined)).toBe('')
    expect(formatIraqiPhone('')).toBe('')
  })

  it('[CRITICAL] ما ليس موبايلاً عراقياً واضحاً يُعرض كما وصل، لا يُحوَّل', () => {
    for (const raw of [
      // دولي غير عراقي
      '+447700900123',
      '00989121234567',
      '+79161234567',
      // عراقي لكن ليس نطاق محمول (070–074) أو أرضي
      '+9647401234567',
      '07001234567',
      '+964 1 234 5678',
      // طول خاطئ أو رمز دولي مكرَّر
      '+96478012345678',
      '+964780123456',
      '0780123456',
      '+9649647801234567',
      // مقنَّع، نصّ، لاحقة تحويلة، محارف تحكّم
      '0780****567',
      'غير متوفر',
      'abc',
      '+9647801234567 ext 12',
      '+964780\t1234567',
    ]) {
      expect(formatIraqiPhone(raw), JSON.stringify(raw)).toBe(raw)
    }
  })

  it('العرض لا يغيّر رابط واتساب: الرقم المعروض يفتح المحادثة نفسها', () => {
    expect(whatsappUrl(formatIraqiPhone('+9647801234567'))).toBe(whatsappUrl('+9647801234567'))
    expect(whatsappUrl(formatIraqiPhone('+9647801234567'))).toBe('https://wa.me/9647801234567')
  })
})
