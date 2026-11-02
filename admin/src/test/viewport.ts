/**
 * عرض الشاشة في jsdom — لاختبار التخطيطين (هاتف/شاشة عريضة).
 *
 * `Grid.useBreakpoint` في أنتديب يقرأ `matchMedia('(min-width: Npx)')`؛ الإعداد
 * الافتراضي (`setup.ts`) يجيب «لا» على الكل فيرى الاختبار هاتفاً. هنا تُقيَّم
 * شروط `min-width`/`max-width` بعرضٍ محدَّد.
 */
export function setViewportWidth(width: number) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query)
      const max = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(query)
      const matches = (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]))
      return {
        matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }
    },
  })
}

/** الهاتف (375) — ما يراه الاختبار افتراضاً. */
export const PHONE = 375
/** شاشة عريضة (1280). */
export const DESKTOP = 1280
