import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDateTime } from '../utils/format'
import { resolveMediaUrl, isValidImageRef } from '../utils/media'

describe('format utils', () => {
  it('يعرض المبلغ بالدينار بأرقام لاتينية', () => {
    expect(formatCurrency(12500)).toBe('12,500 د.ع')
  })

  it('يعرض التاريخ والوقت بالعربية', () => {
    const out = formatDateTime('2026-08-30T10:00:00Z')
    expect(out).toContain('2026')
  })
})

describe('media utils', () => {
  it('يكمل المرجع النسبي بأصل الخادم', () => {
    const url = resolveMediaUrl('/uploads/x.jpg')
    expect(url).toBe('http://localhost:4000/uploads/x.jpg')
  })

  it('يترك الروابط المطلقة كما هي', () => {
    expect(resolveMediaUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
  })

  it('يعيد undefined للمراجع الفارغة', () => {
    expect(resolveMediaUrl('')).toBeUndefined()
    expect(resolveMediaUrl(null)).toBeUndefined()
  })

  it('يتحقق من صحة مراجع الصور', () => {
    expect(isValidImageRef('https://x/i.png')).toBe(true)
    expect(isValidImageRef('/uploads/i.png')).toBe(true)
    expect(isValidImageRef('/media/i.png')).toBe(false)
  })
})