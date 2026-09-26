import { get, put, remove } from './client'
import type { VisualSlot } from '../types/visuals'

/**
 * الرسوم المُدارة — فتحات الشخصيات: صورة دائمة واحدة لكل موضع، ومؤقّتة
 * واحدة فوقها إلى لحظةٍ (الهجرتان ٠٥٤ و٠٥٥).
 *
 * الرفع يمرّ بـ`uploadsApi` القائم بغرض `slot`؛ لا مسار رفع ثانٍ هنا.
 * هذه الوحدة تضع الرابط المرفوع في الفتحة أو تزيله — لا أكثر: لا إنشاء
 * فتحات ولا حذفها (تُعرَّف بالهجرات)، ولا قوائم صور ولا تدوير.
 * الدائمة والمؤقّتة مساران منفصلان على الخادم فلا تطمس إحداهما الأخرى.
 */
export interface VisualSlotList {
  items: VisualSlot[]
  /** منطقة المتجر الزمنية — تقويم «مؤقّتة حتى يوم»؛ يعلنها الخادم (`storeTimezone`). */
  timezone: string
}

export function listVisualSlots(): Promise<VisualSlotList> {
  return get<VisualSlotList>('/admin/visual-slots')
}

/** يستبدل الصورة الدائمة — يراها الزبون فوراً ما لم تكن مؤقّتةٌ سارية. */
export function setSlotImage(slotId: string, url: string) {
  return put<VisualSlot>(`/admin/visual-slots/${slotId}/image`, { url })
}

/** يزيل الصورة الدائمة — التطبيق يعود إلى الرسم المضمَّن. الملف يبقى على الخادم. */
export function clearSlotImage(slotId: string) {
  return remove<VisualSlot>(`/admin/visual-slots/${slotId}/image`)
}

/**
 * يضع صورةً مؤقّتة إلى لحظةٍ (ISO 8601 بإزاحتها) — تحجب الدائمة حتى تنتهي
 * ثم تعود الدائمة تلقائياً. الخادم يرفض لحظةً في الماضي أو أبعد من عام.
 */
export function setSlotTemporaryImage(slotId: string, url: string, until: string) {
  return put<VisualSlot>(`/admin/visual-slots/${slotId}/temporary-image`, { url, until })
}

/** ينهي المؤقّتة الآن — الدائمة (أو المضمَّن) تظهر فوراً. الملف يبقى. */
export function clearSlotTemporaryImage(slotId: string) {
  return remove<VisualSlot>(`/admin/visual-slots/${slotId}/temporary-image`)
}
