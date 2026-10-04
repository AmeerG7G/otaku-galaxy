import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme } from './chartTheme'
import { useChartWidth } from './useChartWidth'
import type { TrendSeries } from './TrendChart'

/**
 * أشرطة مكدّسة (حالات الطلبات، نتائج الإشعارات، جدد/عائدون) — حتى ثلاث سلاسل
 * بخاناتٍ ثابتة، فجوة ٢px بلون السطح بين المقاطع، ووسيلة إيضاح دائماً.
 */
export function StackedBars({
  data,
  xKey,
  series,
  formatX,
  formatValue,
  height = 280,
}: {
  data: Array<Record<string, string | number | null>>
  xKey: string
  series: TrendSeries[]
  formatX: (value: string) => string
  formatValue: (value: number) => string
  height?: number
}) {
  const theme = useChartTheme()
  const { ref, width } = useChartWidth()
  return (
    <div ref={ref} dir="ltr" style={{ width: '100%', height }} data-testid="stacked-bars">
        <BarChart width={width} height={height} data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={(value: string) => formatX(value)}
            tick={{ fill: theme.textMuted, fontSize: 12 }}
            axisLine={{ stroke: theme.grid }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value: number) => formatValue(value)}
            tick={{ fill: theme.textMuted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            cursor={{ fill: theme.grid }}
            labelFormatter={(value) => formatX(String(value))}
            formatter={(value, name) => [formatValue(Number(value)), name]}
            contentStyle={{ background: theme.surface, border: `1px solid ${theme.grid}`, color: theme.text, direction: 'rtl' }}
            labelStyle={{ color: theme.text }}
          />
          <Legend formatter={(value: string) => <span style={{ color: theme.text }}>{value}</span>} />
          {series.map((s, index) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="stack"
              fill={theme.series[s.slot]}
              stroke={theme.surface}
              strokeWidth={2}
              radius={index === series.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
    </div>
  )
}
