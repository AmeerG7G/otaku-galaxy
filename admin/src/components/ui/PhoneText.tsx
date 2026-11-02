import { Typography } from 'antd'
import type { CSSProperties } from 'react'
import { formatIraqiPhone } from '../../utils/phone'

/**
 * رقم هاتف معروضٌ في اللوحة. النصوص المركّبة (خيار قائمة، سطر في السجلّ)
 * تستدعي `formatIraqiPhone` مباشرةً — `utils/phone.guard.test.ts` يمنع الرقم الخام.
 *
 * الموبايل العراقي يظهر بصيغته المحلية `07XXXXXXXXX` أيّاً كانت صيغته
 * المخزَّنة، فلا تعرض شاشةٌ `964…` وأخرى `07…`. والنسخ ينسخ المعروض نفسه.
 * روابط واتساب لا تمرّ من هنا: تأخذ الرقم المخزَّن.
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
      {formatIraqiPhone(phone)}
    </Typography.Text>
  )
}
