import { Form, Input } from 'antd'

/**
 * اسمٌ كرديٌّ **اختياري** لقسمٍ أو قسمٍ فرعي أو محافظة أو منطقة (046).
 *
 * [PRODUCT] (المالك، 2026-10-26) الفارغ لا يمنع الحفظ: الزبون الكردي يرى الاسم
 * العربي حتى تُكتب الترجمة، ثم يراها بعد التحديث بلا إعادة إنشاء. الحدود هي
 * حدود الخادم (`optionalKurdish`)؛ الحدّ الأدنى يُطبَّق على المكتوب وحده.
 */
export default function KurdishNameField({
  label,
  max,
  min = 1,
}: {
  label: string
  max: number
  min?: number
}) {
  return (
    <Form.Item
      name="nameCkb"
      label={`${label} بالكردية (اختياري)`}
      extra="سوراني يكتبه المسؤول — الفارغ يُعرض للزبون الكردي بالعربية"
      rules={[
        {
          validator: (_, value?: string | null) => {
            const text = (value ?? '').trim()
            if (text.length > max) {
              return Promise.reject(new Error(`${label} بالكردية طويل جداً (${max} حرفاً كحد أقصى)`))
            }
            if (text.length > 0 && text.length < min) {
              return Promise.reject(new Error(`${label} بالكردية قصير جداً (حرفان كحد أدنى)`))
            }
            return Promise.resolve()
          },
        },
      ]}
    >
      <Input lang="ckb" dir="rtl" />
    </Form.Item>
  )
}
