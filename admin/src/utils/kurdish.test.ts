import { describe, expect, it } from 'vitest'
import { kurdishOrNull, kurdishPatch } from './kurdish'

/** الكردية الاختيارية في طلبات اللوحة (المالك، 2026-10-26). */
describe('kurdishPatch', () => {
  it('نصٌّ مكتوب يُرسَل مقصوصاً', () => {
    expect(kurdishPatch('nameCkb', '  جانتا ', null)).toEqual({ nameCkb: 'جانتا' })
    expect(kurdishPatch('nameCkb', 'نوێ', 'کۆن')).toEqual({ nameCkb: 'نوێ' })
  })

  it('[CRITICAL] فُرِّغ بعد أن كان محفوظاً ← null (يمسح الترجمة)', () => {
    expect(kurdishPatch('nameCkb', '', 'کۆن')).toEqual({ nameCkb: null })
    expect(kurdishPatch('nameCkb', '   ', 'کۆن')).toEqual({ nameCkb: null })
    expect(kurdishPatch('descriptionCkb', undefined, 'وەسف')).toEqual({ descriptionCkb: null })
  })

  it('فارغٌ من البداية ← لا يُرسَل (لا تغيير)', () => {
    expect(kurdishPatch('nameCkb', '', null)).toEqual({})
    expect(kurdishPatch('nameCkb', ' ', '')).toEqual({})
    expect(kurdishPatch('nameCkb', undefined, undefined)).toEqual({})
  })
})

describe('kurdishOrNull', () => {
  it('الفارغ والمسافات ← null، والنصّ مقصوص', () => {
    expect(kurdishOrNull('')).toBeNull()
    expect(kurdishOrNull('  ')).toBeNull()
    expect(kurdishOrNull(undefined)).toBeNull()
    expect(kurdishOrNull(' بەش ')).toBe('بەش')
  })
})
