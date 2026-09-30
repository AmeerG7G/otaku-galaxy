import { Typography } from 'antd'
import type { CSSProperties } from 'react'

/**
 * رقم هاتف معروضٌ داخل واجهة RTL — «+9647…» لا «…9647+».
 *
 * [CRITICAL] `dir="ltr"` على `Typography.Text` لا يكفي: أنتديب يضيف صنف
 * `ant-typography-rtl` الذي يفرض `direction: rtl` في CSS، وCSS يغلب سمة
 * `dir` — فكانت «+» تقفز إلى آخر الرقم في الطلبات وطلبات الحساب وغيرها.
 * الاتجاه هنا في `style` (يغلب الصنف)، و`isolate` يعزل الرقم عن النصّ حوله.
 */
export function PhoneText({
  phone,
  copyable = false,
  secondary = false,
  style,
}: {
  phone: string
  copyable?: boolean
  secondary?: boolean
  style?: CSSProperties
}) {
  return (
    <Typography.Text
      type={secondary ? 'secondary' : undefined}
      copyable={copyable}
      data-testid="phone-text"
      style={{ direction: 'ltr', unicodeBidi: 'isolate', whiteSpace: 'nowrap', ...style }}
    >
      {phone}
    </Typography.Text>
  )
}
