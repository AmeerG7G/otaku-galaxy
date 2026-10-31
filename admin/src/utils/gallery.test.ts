import { describe, expect, it } from 'vitest'
import { customerGallery, productCover } from './gallery'

/**
 * المعرض الموحّد في اللوحة — القاعدة نفسها في التطبيق والمتجر: صورة كل لونٍ نشط
 * بترتيب الألوان، ثم الصور العامة بترتيبها، بلا تكرار.
 */
const red = { colorName: 'أحمر', imageUrl: '/uploads/product/red.png', isActive: true }
const blue = { colorName: 'أزرق', imageUrl: '/uploads/product/blue.png', isActive: true }
const front = '/uploads/product/front.png'
const back = '/uploads/product/back.png'

describe('customerGallery', () => {
  it('صور الألوان بترتيبها ثم الصور العامة بترتيبها', () => {
    expect(customerGallery([front, back], [red, blue]).entries).toEqual([
      { kind: 'colour', ref: red.imageUrl, colourNames: ['أحمر'] },
      { kind: 'colour', ref: blue.imageUrl, colourNames: ['أزرق'] },
      { kind: 'general', ref: front, position: 0 },
      { kind: 'general', ref: back, position: 1 },
    ])
  })

  it('صورةٌ عامة هي صورة لون: مرةً واحدة، وتُعَدّ مكرّرة ولا تُحذف', () => {
    const gallery = customerGallery([front, blue.imageUrl, back], [red, blue])
    expect(gallery.entries.map((entry) => entry.ref)).toEqual([red.imageUrl, blue.imageUrl, front, back])
    expect(gallery.duplicates).toEqual([{ position: 1, colourNames: ['أزرق'] }])
  })

  it('المرجع النسبي والمطلق للملف نفسه صورةٌ واحدة — كما يحلّهما العميلان', () => {
    const absolute = `http://localhost:4000${blue.imageUrl}`
    expect(customerGallery([absolute], [blue]).entries).toHaveLength(1)
  })

  it('لونان بالصورة نفسها: مدخلٌ واحد باسميهما', () => {
    expect(customerGallery([], [red, { ...blue, imageUrl: red.imageUrl }]).entries).toEqual([
      { kind: 'colour', ref: red.imageUrl, colourNames: ['أحمر', 'أزرق'] },
    ])
  })

  it('اللون الموقوف خارج المعرض ويُعَدّ، والفارغ يسقط بلا خطأ', () => {
    const gallery = customerGallery(['', '  ', front], [{ ...red, isActive: false }, { colorName: 'بلا صورة', imageUrl: '' }])
    expect(gallery.entries).toEqual([{ kind: 'general', ref: front, position: 2 }])
    expect(gallery.inactiveColours).toBe(1)
    expect(customerGallery([], []).entries).toEqual([])
  })
})

describe('productCover', () => {
  it('أولى الصور العامة كما كانت، وإلا صورة أول لونٍ نشط، وإلا لا شيء', () => {
    expect(productCover([front, back], [red])).toBe(front)
    expect(productCover([], [{ ...red, isActive: false }, blue])).toBe(blue.imageUrl)
    expect(productCover([])).toBeNull()
  })
})
