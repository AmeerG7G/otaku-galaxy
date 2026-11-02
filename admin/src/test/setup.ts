import '@testing-library/jest-dom/vitest'

/** jsdom لا يملك matchMedia — antd يحتاجه في نقاط التكسر. */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

/** بعض مكوّنات antd تقرأ getComputedStyle في بيئة الاختبار. */
if (!window.getComputedStyle) {
  window.getComputedStyle = (() => ({})) as unknown as typeof window.getComputedStyle
}

/** rc-resize-observer يحتاج ResizeObserver — jsdom لا يوفّره. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!window.ResizeObserver) {
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

/** rc-trigger/popover يحتاج scrollTo على العناصر. */
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = (() => {}) as never
}