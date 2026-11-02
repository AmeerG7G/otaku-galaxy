import { describe, expect, it } from 'vitest'
import { lightThemeConfig } from '../theme'
import { darkThemeConfig } from './ThemeProvider'

/**
 * تباين حالات الاختيار — حارس الرقم البنفسجي على البنفسجي (STEP 64).
 *
 * كان رقم الصفحة النشطة في الوضع الداكن `colorPrimary` على `colorPrimary`
 * (تباين 1:1) فيختفي. هذا الاختبار يقيس نسبة WCAG لكل زوج خلفية/نصّ في حالات
 * الاختيار، في الثيمين، ويطلب 4.5 (حدّ AA لنصٍّ عادي).
 */

function channel(value: number) {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string) {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!)
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const themes = [
  ['light', lightThemeConfig],
  ['dark', darkThemeConfig],
] as const

describe.each(themes)('%s theme — selected states stay readable', (_, config) => {
  const pagination = config.components!.Pagination!
  const segmented = config.components!.Segmented!
  const container = config.token!.colorBgContainer as string

  it('active page number: white on a deep primary, ≥ 4.5', () => {
    expect(pagination.itemActiveColor).toBe('#FFFFFF')
    expect(pagination.itemActiveColorHover).toBe('#FFFFFF')
    expect(contrast(pagination.itemActiveBg as string, pagination.itemActiveColor as string)).toBeGreaterThanOrEqual(4.5)
  })

  it('[regression] the active number is never the same colour as its background', () => {
    expect((pagination.itemActiveColor as string).toLowerCase()).not.toBe(
      (pagination.itemActiveBg as string).toLowerCase(),
    )
  })

  it('selected segment (gender, tabs): white on a deep primary, ≥ 4.5', () => {
    expect(contrast(segmented.itemSelectedBg as string, segmented.itemSelectedColor as string)).toBeGreaterThanOrEqual(4.5)
  })

  it('unselected segment text is readable on the card background, ≥ 4.5', () => {
    expect(contrast(container, segmented.itemColor as string)).toBeGreaterThanOrEqual(4.5)
  })
})
