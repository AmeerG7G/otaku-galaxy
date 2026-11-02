import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme } from './chartTheme'
import { useChartWidth } from './useChartWidth'

/**
 * ترتيبٌ أفقي (الأكثر مبيعاً، المحافظات…) — سلسلةٌ واحدة فلا وسيلة إيضاح (العنوان
 * يسمّيها)، أطرافٌ مدوّرة ٤px، وفجوة ٢px بين الأشرطة.
 */
export function BarRanking({
  data,
  formatValue,
  valueLabel,
  height,
}: {
  data: Array<{ label: string; value: number }>
  formatValue: (value: number) => string
  valueLabel: string
  height?: number
}) {
  const theme = useChartTheme()
  const { ref, width } = useChartWidth()
  const chartHeight = height ?? Math.max(160, data.length * 34 + 24)
  return (
    <div ref={ref} dir="ltr" style={{ width: '100%', height: chartHeight }} data-testid="bar-ranking">
        <BarChart width={width} height={chartHeight} data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barCategoryGap={2}>
          <CartesianGrid stroke={theme.grid} horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(value: number) => formatValue(value)}
            tick={{ fill: theme.textMuted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={160}
            tick={{ fill: theme.text, fontSize: 12 }}
            axisLine={{ stroke: theme.grid }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: theme.grid }}
            formatter={(value) => [formatValue(Number(value)), valueLabel]}
            contentStyle={{ background: theme.surface, border: `1px solid ${theme.grid}`, color: theme.text, direction: 'rtl' }}
            labelStyle={{ color: theme.text }}
          />
          <Bar
            dataKey="value"
            name={valueLabel}
            fill={theme.series[0]}
            radius={[0, 4, 4, 0]}
            stroke={theme.surface}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </BarChart>
    </div>
  )
}
