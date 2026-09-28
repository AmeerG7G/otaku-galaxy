import { describe, expect, it } from 'vitest'
import { activeMenuKey, NAV_ITEMS, navTitleFor } from './nav'

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
/**
 * [PRODUCT] «رسوم الشخصيات» أُزيلت من اللوحة (2026-09-27): الشخصيات أصولٌ
 * ثابتة في التطبيق. لا بند قائمة ولا عنوان ولا مسار يعود.
 */
describe('لا «رسوم الشخصيات» في اللوحة', () => {
  it('لا بند قائمة ولا عنوان قسم', () => {
    const labels = JSON.stringify(NAV_ITEMS, (_key, value) =>
      typeof value === 'object' && value !== null && '$$typeof' in value ? undefined : value,
    )
    expect(labels).not.toContain('رسوم الشخصيات')
    expect(labels).not.toContain('/visuals')
    expect(navTitleFor('/visuals')).toBe('لوحة التحكم')
  })
})
