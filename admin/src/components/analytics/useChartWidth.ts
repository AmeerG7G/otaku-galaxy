import { useLayoutEffect, useRef, useState } from 'react'

/**
 * عرض حاوية المخطّط — `ResizeObserver` في المتصفّح، وعرضٌ احتياطي حين لا يُقاس
 * (أول رسم، أو بيئة الاختبار): `ResponsiveContainer` كان لا يرسم شيئاً بعرض صفر.
 */
export function useChartWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const measured = element.clientWidth
      if (measured > 0) setWidth(measured)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}
