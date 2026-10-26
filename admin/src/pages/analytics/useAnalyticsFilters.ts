import { useSearchParams } from 'react-router-dom'
import type { CompareMode } from '../../types/analytics'
import { PERIOD_PRESETS, currentMonth, isMonth, presetRange, type PeriodPreset } from '../../utils/periods'

/**
 * مرشِّحات «التحليلات» في الرابط — تبقى بعد التحديث والرجوع (كـ`useTableState`).
 *   period=current|previous|last3|last6|year|prevYear|all|custom
 *   from/to=YYYY-MM (للمخصّص)  ·  compare=none|previous|year
 */
export function useAnalyticsFilters(firstMonth?: string) {
  const [params, setParams] = useSearchParams()
  const rawPreset = params.get('period') as PeriodPreset | null
  const preset: PeriodPreset = PERIOD_PRESETS.some((p) => p.value === rawPreset) ? rawPreset! : 'current'
  const rawCompare = params.get('compare')
  const compare: CompareMode = rawCompare === 'none' || rawCompare === 'year' ? rawCompare : 'previous'

  let range = preset === 'custom' ? null : presetRange(preset, new Date(), firstMonth)
  if (preset === 'custom') {
    const from = params.get('from')
    const to = params.get('to')
    const month = currentMonth()
    range = isMonth(from) && isMonth(to) && from <= to ? { from, to } : { from: month, to: month }
  }

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  return {
    preset,
    range: range!,
    compare,
    setPreset: (value: PeriodPreset) =>
      value === 'custom'
        ? update({ period: 'custom', from: range!.from, to: range!.to })
        : update({ period: value, from: null, to: null }),
    setCustom: (from: string, to: string) => update({ period: 'custom', from, to }),
    setCompare: (value: CompareMode) => update({ compare: value }),
  }
}
