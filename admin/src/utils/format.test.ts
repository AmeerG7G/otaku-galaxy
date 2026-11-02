import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDateTime, productCountLabel } from '../utils/format'
import { resolveMediaUrl, isValidImageRef } from '../utils/media'

describe('format utils', () => {
  it('يعرض المبلغ بالدينار بأرقام لاتينية', () => {
    expect(formatCurrency(12500)).toBe('12,500 د.ع')
  })

  it('[STEP 66] عدد المنتجات بتمييزه العربي — لا «١ منتجات»', () => {
    expect(productCountLabel(1)).toBe('منتج واحد')
    expect(productCountLabel(2)).toBe('منتجان')
    expect(productCountLabel(3)).toBe('3 منتجات')
    expect(productCountLabel(10)).toBe('10 منتجات')
    expect(productCountLabel(11)).toBe('11 منتجاً')
    expect(productCountLabel(100)).toBe('100 منتج')
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