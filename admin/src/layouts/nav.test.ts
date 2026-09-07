import { describe, expect, it } from 'vitest'
import { activeMenuKey, navTitleFor } from './nav'

describe('activeMenuKey', () => {
  it('الرئيسية تُحافَظ كسطر مباشر', () => {
    expect(activeMenuKey('/')).toBe('/')
  })

  it('يستخرج مفتاح القسم الأول من المسار', () => {
    expect(activeMenuKey('/orders/123')).toBe('/orders')
    expect(activeMenuKey('/products/new')).toBe('/products')
    expect(activeMenuKey('/products/9/edit')).toBe('/products')
  })
})

describe('navTitleFor', () => {
  it('يعرض عنوان القسم المطابق', () => {
    expect(navTitleFor('/orders')).toBe('الطلبات')
    expect(navTitleFor('/delivery')).toBe('المحافظات والتوصيل')
  })

  it('يعطي عنواناً عاماً للطرق غير المعروفة', () => {
    expect(navTitleFor('/nope')).toBe('لوحة التحكم')
  })
})