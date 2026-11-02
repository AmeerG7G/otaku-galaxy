import { StatCard, type StatTone } from '../ui/StatCard'
import { formatPercent } from '../../utils/periods'
import type { Kpi } from '../../types/analytics'

/**
 * مؤشّر بمقارنته — القيمة، ثم سطر بياناتٍ (لا شرح): الفرق المطلق والنسبة وأساس
 * المقارنة. النسبة «—» من أساسٍ صفري، ولا «نمو» بلا أساسٍ مسمّى.
 */
export function AnalyticsKpi({
  title,
  kpi,
  format,
  compareLabel,
  tone = 'brand',
}: {
  title: string
  kpi: Kpi
  format: (value: number | null) => string
  compareLabel: string | null
  tone?: StatTone
}) {
  const hasComparison = compareLabel !== null && kpi.previous !== null
  const arrow = kpi.delta === null || kpi.delta === 0 ? '' : kpi.delta > 0 ? '▲ ' : '▼ '
  const hint = hasComparison
    ? `${arrow}${format(kpi.delta === null ? null : Math.abs(kpi.delta))} (${formatPercent(kpi.percent)}) · ${compareLabel}: ${format(kpi.previous)}`
    : undefined
  return <StatCard title={title} value={format(kpi.current)} tone={tone} hint={hint} />
}
