import { describe, expect, it } from 'vitest'
import { whatsappUrl } from './phone'

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
