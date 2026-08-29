/** مفاتيح إعدادات الأعمال — تجارية فقط، لا أمنية. */
export type BusinessSettingKey =
  | 'points_order_received'
  | 'points_review_approved'
  | 'points_review_with_photo'
  | 'birthday_discount_percent'
  | 'order_rating_delay_hours'

/**
 * وصف إعداد واحد كما يعيده الخادم.
 *
 * التمييز بين [value] و[effectiveValue] مقصود: الأولى ما حُفظ فعلاً
 * (`null` = غير مضبوط)، والثانية ما يعمل به النظام الآن. بدونه لا يفرّق
 * المسؤول بين «ضبطتُه على ٢٠» و«لم أضبطه فيعمل بـ٢٠».
 */
export interface BusinessSetting {
  key: BusinessSettingKey
  label: string
  description: string
  unit: string
  value: string | null
  effectiveValue: number
  defaultValue: number
  min: number
  max: number
  integer: boolean
  usingDefault: boolean
}
