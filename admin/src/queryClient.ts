import { QueryClient, type DefaultOptions } from '@tanstack/react-query'

/**
 * خيارات React Query للّوحة — مصدرٌ واحد يستعمله التطبيق والاختبارات.
 *
 * [CRITICAL] `staleTime` يبقى صفراً (الافتراضي): كل تركيبٍ لصفحةٍ يعيد
 * الجلب من الخادم، فتغييرٌ وقع من التطبيق (جنس الزبون، اسمه، حالته…) يظهر
 * في اللوحة مع أول دخولٍ أو «تحديث» تالٍ بلا قيمةٍ قديمة تُخدَم من الذاكرة.
 * الاختبارات تبني عميلها من هنا كي يسقط الحارس إن رُفع الزمن يوماً.
 */
export function createQueryClient(overrides: Partial<DefaultOptions['queries']> = {}) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        ...overrides,
      },
    },
  })
}
