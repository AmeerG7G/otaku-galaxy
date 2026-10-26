import { Flex, Typography } from 'antd'
import { formatNumber } from '../../utils/periods'
import { useChartTheme } from './chartTheme'

/**
 * التوزيع حسب الجنس — فئتان فقط: ذكور وإناث (D5). النسبة من مجموع الفئتين.
 * لا مقطع ثالث، ولا ملاحظة عن حساباتٍ بلا جنس.
 */
export function GenderSplit({ male, female }: { male: number; female: number }) {
  const theme = useChartTheme()
  const total = male + female
  if (total === 0) {
    return <Typography.Text type="secondary">لا بيانات في هذا المدى</Typography.Text>
  }
  const malePercent = Math.round((male / total) * 1000) / 10
  const femalePercent = Math.round((1000 - malePercent * 10)) / 10
  const segments = [
    { key: 'male', label: 'ذكور', value: male, percent: malePercent, color: theme.series[0] },
    { key: 'female', label: 'إناث', value: female, percent: femalePercent, color: theme.series[1] },
  ]
  return (
    <div data-testid="gender-split">
      <div
        role="img"
        aria-label={`ذكور ${formatNumber(male)}، إناث ${formatNumber(female)}`}
        style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden', gap: 2, background: theme.surface }}
      >
        {segments.map((s) =>
          s.value > 0 ? <div key={s.key} style={{ width: `${s.percent}%`, background: s.color }} /> : null,
        )}
      </div>
      <Flex gap={24} wrap style={{ marginTop: 10 }}>
        {segments.map((s) => (
          <Flex key={s.key} align="center" gap={8}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }} />
            <Typography.Text>
              {s.label}: <strong className="tnum">{formatNumber(s.value)}</strong>{' '}
              <Typography.Text type="secondary">({formatNumber(s.percent, true)}%)</Typography.Text>
            </Typography.Text>
          </Flex>
        ))}
      </Flex>
    </div>
  )
}
