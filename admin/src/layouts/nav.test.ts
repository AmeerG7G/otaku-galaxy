import { describe, expect, it } from 'vitest'
import { activeMenuKey, firstAllowedPath, NAV_ITEMS, navItemsFor, navTitleFor, SECTION_FOR_PATH } from './nav'
import { ADMIN_SECTIONS } from '../types/adminPermissions'

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

/**
 * STEP 64 — القائمة بحسب صلاحيات المسؤول. الخادم يفرض الصلاحية على كل مسار؛
 * هذا يمنع بنداً يقود إلى صفحة «لا صلاحية».
 */
describe('القائمة بحسب الصلاحيات', () => {
  const keys = (items: ReturnType<typeof navItemsFor>) =>
    items.flatMap((item) =>
      item && 'children' in item && item.children ? item.children.map((child) => child?.key) : [item?.key],
    )

  it('المسؤول الأعلى يرى كل الأقسام ومنها «المسؤولون»', () => {
    const all = keys(navItemsFor({ isSuperAdmin: true, permissions: [] }))
    expect(all).toContain('/admins')
    expect(all).toHaveLength(Object.keys(SECTION_FOR_PATH).length)
  })

  it('المسؤول الفرعي يرى أقسامه وحدها، والمجموعة الفارغة تختفي', () => {
    const items = navItemsFor({ isSuperAdmin: false, permissions: ['orders', 'reviews'] })
    expect(keys(items)).toEqual(['/orders', '/reviews'])
    const groups = items.filter((item) => item && 'type' in item && item.type === 'group')
    expect(groups).toHaveLength(2)
  })

  it('بلا صلاحيات: قائمة فارغة، ولا ملفّ ⇒ لا شيء', () => {
    expect(navItemsFor({ isSuperAdmin: false, permissions: [] })).toEqual([])
    expect(navItemsFor(undefined)).toEqual([])
  })

  it('أول صفحة متاحة لمن لا يملك «الرئيسية»', () => {
    expect(firstAllowedPath({ isSuperAdmin: false, permissions: ['birthdays', 'restock'] })).toBe('/restock')
    expect(firstAllowedPath({ isSuperAdmin: false, permissions: [] })).toBeNull()
    expect(firstAllowedPath({ isSuperAdmin: true, permissions: [] })).toBe('/')
  })

  it('كل مسار في القائمة له قسم، وكل قسم له مسار', () => {
    const inMenu = keys(navItemsFor({ isSuperAdmin: true, permissions: [] })).sort()
    expect(inMenu).toEqual(Object.keys(SECTION_FOR_PATH).sort())
    expect(new Set(Object.values(SECTION_FOR_PATH))).toEqual(new Set(ADMIN_SECTIONS))
  })

  it('عناوين الأقسام الناقصة سابقاً', () => {
    expect(navTitleFor('/account-requests')).toBe('طلبات الحساب')
    expect(navTitleFor('/restock')).toBe('طلبات التوفر')
    expect(navTitleFor('/admins')).toBe('المسؤولون')
  })
})
