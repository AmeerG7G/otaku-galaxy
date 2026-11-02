import { useState } from 'react'
import { Button, Calendar, Input, Popover, Space } from 'antd'
import { CalendarOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import {
  formatDateTyping,
  formatTimeTyping,
  isIsoInstant,
  isoToStoreParts,
} from '../../utils/storeDate'

/**
 * حقل تاريخ يُكتب باليد بصيغة `YYYY-MM-DD` — والتقويم بديلٌ اختياري (زرّ).
 *
 * [PRODUCT] (المالك، 2026-10-26) تقويم antd يفتح لوحةً كبيرة على الهاتف يصعب
 * استعمالها. هنا لوحة الأرقام (`inputMode="numeric"`) وتُدرج الفواصل تلقائياً
 * (لوحة iOS بلا «-»)، والأرقام العربية-الهندية مقبولة. القيمة نصّ؛ لحظة ISO
 * محمَّلة تُعرض بيومها في بغداد. التحقق والتحويل في `utils/storeDate`.
 *
 * يعمل حقلاً في `Form.Item` (يأخذ `id`/`value`/`onChange`) أو مستقلاً.
 */
export function StoreDateInput({
  id,
  value,
  onChange,
  disabled,
  placeholder = 'YYYY-MM-DD',
  calendar = true,
  width = 200,
  'aria-label': ariaLabel,
}: {
  id?: string
  value?: string | null
  onChange?: (text: string) => void
  disabled?: boolean
  placeholder?: string
  calendar?: boolean
  width?: number | string
  'aria-label'?: string
}) {
  const [open, setOpen] = useState(false)
  const text = isIsoInstant(value) ? isoToStoreParts(value).date : (value ?? '')
  const input = (
    <Input
      id={id}
      aria-label={ariaLabel}
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      inputMode="numeric"
      autoComplete="off"
      dir="ltr"
      maxLength={10}
      allowClear
      style={{ width }}
      onChange={(event) => onChange?.(formatDateTyping(event.target.value))}
    />
  )
  if (!calendar) return input
  return (
    <Space.Compact>
      {input}
      <Popover
        trigger="click"
        open={open && !disabled}
        onOpenChange={setOpen}
        placement="bottomRight"
        content={
          <div style={{ width: 280 }}>
            <Calendar
              fullscreen={false}
              onSelect={(day: Dayjs, info: { source: string }) => {
                if (info.source !== 'date') return
                onChange?.(day.format('YYYY-MM-DD'))
                setOpen(false)
              }}
            />
          </div>
        }
      >
        <Button icon={<CalendarOutlined />} disabled={disabled} aria-label="اختيار من التقويم" />
      </Popover>
    </Space.Compact>
  )
}

/** حقل وقت `HH:mm` (٢٤ ساعة) يُكتب باليد — النقطتان تُدرجان تلقائياً. */
export function StoreTimeInput({
  id,
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: {
  id?: string
  value?: string | null
  onChange?: (text: string) => void
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      value={value ?? ''}
      disabled={disabled}
      placeholder="HH:mm"
      inputMode="numeric"
      autoComplete="off"
      dir="ltr"
      maxLength={5}
      style={{ width: 96 }}
      onChange={(event) => onChange?.(formatTimeTyping(event.target.value))}
    />
  )
}
