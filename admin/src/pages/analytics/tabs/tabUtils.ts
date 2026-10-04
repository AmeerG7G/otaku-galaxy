import type { CompareMode } from '../../../types/analytics'
import { monthLabel } from '../../../utils/periods'

/** اسم نافذة المقارنة كما يُكتب بجانب المؤشّر — `null` بلا مقارنة. */
export function compareLabelFor(compare: CompareMode, window: { months: string[] } | undefined | null): string | null {
  if (compare === 'none' || !window || window.months.length === 0) return null
  const first = window.months[0]!
  const last = window.months[window.months.length - 1]!
  return first === last ? monthLabel(first) : `${monthLabel(first)} – ${monthLabel(last)}`
}
