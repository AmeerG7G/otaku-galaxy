import { DatePicker, Flex, Segmented, Select, Tag } from 'antd'
import dayjs from 'dayjs'
import type { CompareMode } from '../../types/analytics'
import { PERIOD_PRESETS, currentMonth, rangeLabel, storeToday, type PeriodPreset } from '../../utils/periods'

/** صفٌّ واحد للمرشِّحات فوق المخطّطات: الفترة، المدى المخصّص، أساس المقارنة. */
export function AnalyticsFilters({
  preset,
  range,
  compare,
  showCompare,
  onPreset,
  onCustom,
  onCompare,
}: {
  preset: PeriodPreset
  range: { from: string; to: string }
  compare: CompareMode
  showCompare: boolean
  onPreset: (value: PeriodPreset) => void
  onCustom: (from: string, to: string) => void
  onCompare: (value: CompareMode) => void
}) {
  const partial = range.to >= currentMonth()
  return (
    <Flex gap={12} wrap align="center" data-testid="analytics-filters">
      <Segmented
        className="og-segmented-wrap"
        value={preset}
        onChange={(value) => onPreset(value as PeriodPreset)}
        options={PERIOD_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
        aria-label="الفترة"
      />
      {preset === 'custom' && (
        <DatePicker.RangePicker
          picker="month"
          allowClear={false}
          value={[dayjs(`${range.from}-01`), dayjs(`${range.to}-01`)]}
          onChange={(values) => {
            if (values?.[0] && values[1]) onCustom(values[0].format('YYYY-MM'), values[1].format('YYYY-MM'))
          }}
          aria-label="المدى المخصّص"
        />
      )}
      {showCompare && (
        <Select<CompareMode>
          value={compare}
          onChange={onCompare}
          style={{ minWidth: 200 }}
          aria-label="أساس المقارنة"
          options={[
            { value: 'previous', label: 'مقارنةً بالفترة السابقة' },
            { value: 'year', label: 'مقارنةً بالفترة نفسها من العام الماضي' },
            { value: 'none', label: 'بلا مقارنة' },
          ]}
        />
      )}
      <Tag>{rangeLabel(range.from, range.to)}</Tag>
      {partial && <Tag color="processing">جارٍ — حتى {storeToday()}</Tag>}
    </Flex>
  )
}
