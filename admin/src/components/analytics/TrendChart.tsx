import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useChartTheme } from './chartTheme'
import { useChartWidth } from './useChartWidth'

export interface TrendSeries {
  key: string
  label: string
  /** خانة اللون الثابتة للكيان (٠ = الإيراد/الرئيسي). */
  slot: 0 | 1 | 2
  dashed?: boolean
}

/**
 * سلسلة زمنية — خطوط ٢px، علامات ٨px، شبكة خافتة، تلميحٌ بمؤشّرٍ عمودي، ووسيلة
 * إيضاحٍ لسلسلتين فأكثر. المحور الزمني من اليسار إلى اليمين كما تُقرأ الأرقام.
 * النقطة الأخيرة جوفاء حين تكون الفترة جارية (`partialLast`) — لم تكتمل بعد.
 */
export function TrendChart({
  data,
  xKey,
  series,
  formatX,
  formatValue,
  partialLast = false,
  height = 280,
}: {
  data: Array<Record<string, string | number | null>>
  xKey: string
  series: TrendSeries[]
  formatX: (value: string) => string
  formatValue: (value: number) => string
  partialLast?: boolean
  height?: number
}) {
  const theme = useChartTheme()
  const { ref, width } = useChartWidth()
  const lastIndex = data.length - 1
  return (
    <div ref={ref} dir="ltr" style={{ width: '100%', height }} data-testid="trend-chart">
        <LineChart width={width} height={height} data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
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
            width={88}
          />
          <Tooltip
            cursor={{ stroke: theme.textMuted, strokeWidth: 1 }}
            labelFormatter={(value) => formatX(String(value))}
            formatter={(value, name) => [formatValue(Number(value)), name]}
            contentStyle={{ background: theme.surface, border: `1px solid ${theme.grid}`, color: theme.text, direction: 'rtl' }}
            labelStyle={{ color: theme.text }}
          />
          {series.length >= 2 && (
            <Legend formatter={(value: string) => <span style={{ color: theme.text }}>{value}</span>} />
          )}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={theme.series[s.slot]}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '6 4' : undefined}
              isAnimationActive={false}
              connectNulls={false}
              dot={(props: { cx?: number; cy?: number; index?: number; value?: unknown }) => {
                const { cx, cy, index, value } = props
                if (cx === undefined || cy === undefined || value === null || value === undefined) {
                  return <g key={`${s.key}-${index}`} />
                }
                const hollow = partialLast && index === lastIndex
                return (
                  <circle
                    key={`${s.key}-${index}`}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill={hollow ? theme.surface : theme.series[s.slot]}
                    stroke={hollow ? theme.series[s.slot] : theme.surface}
                    strokeWidth={2}
                  />
                )
              }}
              activeDot={{ r: 5, stroke: theme.surface, strokeWidth: 2 }}
            />
          ))}
        </LineChart>
    </div>
  )
}
