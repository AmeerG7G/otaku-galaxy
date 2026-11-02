// @ts-expect-error — مشروع المتصفّح بلا أنواع Node عمداً؛ هذا الاختبار وحده يقرأ من القرص.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

declare const process: { cwd(): string }

// من القرص لا `?raw`: `css: false` في إعداد فيتست يعيد كل استيراد ‎.css فارغاً.
const css: string = readFileSync(`${process.cwd()}/src/index.css`, 'utf8')

/**
 * حارس قواعد CSS التي يعتمد عليها تخطيط STEP 66 — jsdom لا يطبّق الأنماط،
 * فحذفُ قاعدةٍ منها لا يُسقط أي اختبار مكوّن بينما يعيد العطل على الشاشة.
 */

/** كتلة المحدِّد كما كُتبت في `index.css`. */
function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start, `القاعدة ${selector} مفقودة من index.css`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

function channel(value: number) {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]: number[]) => 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!)
const hex = (h: string) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16))

describe('index.css — قواعد التخطيط (STEP 66)', () => {
  it('شريط الخيارات يلتفّ داخل حاويته ولا يتجاوزها («لم يسجّل ميلاده» خارج الشاشة)', () => {
    expect(rule('.og-segmented-wrap.ant-segmented')).toMatch(/max-width:\s*100%/)
    expect(rule('.og-segmented-wrap.ant-segmented .ant-segmented-group')).toMatch(/flex-wrap:\s*wrap/)
    // المؤشّر يتحرّك أفقياً فقط — يُخفى كي لا يقفز بين السطرين.
    expect(rule('.og-segmented-wrap.ant-segmented .ant-segmented-thumb')).toMatch(/display:\s*none/)
  })

  it('شريط تمرير القائمة الجانبية مرئيّ: تباين ≥ 3:1 على كل درجات خلفيتها (WCAG 1.4.11)', () => {
    const match = /scrollbar-color:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(rule('.og-sidebar-scroll'))
    expect(match).not.toBeNull()
    const [r, g, b, a] = match!.slice(1).map(Number) as [number, number, number, number]
    // طرفا تدرّج الشريط الجانبي في الثيمين (`--og-sidebar-gradient`).
    for (const background of ['#180f30', '#241743', '#0b0718', '#120c24']) {
      const bg = hex(background)
      const thumb = [r, g, b].map((c, i) => a * c + (1 - a) * bg[i]!)
      const ratio = (luminance(thumb) + 0.05) / (luminance(bg) + 0.05)
      expect(ratio, `على ${background}`).toBeGreaterThanOrEqual(3)
    }
  })
})
