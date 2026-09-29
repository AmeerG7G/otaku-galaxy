import { get, patch } from './client'

/** صفّ واحد في «طلبات التوفر»: منتج نفد ومن ينتظره. */
export interface RestockDemandRow {
  productId: string
  name: string
  subscriberCount: number
  /** موعد التوفر المتوقّع كما ضبطه المسؤول (ISO)، أو null. */
  restockAt: string | null
  /**
   * المنتظرون — الاسم ورقم **مقنَّع** (`0770****567`).
   *
   * الخادم هو من يقنّع لا الواجهة: الرقم الكامل لا يغادر القاعدة أصلاً، فلا
   * يصل المتصفّح ولا يظهر في أدوات المطوّر ولا في ذاكرة الشبكة.
   */
  /**
   * المشتركون المنتظرون — بالهاتف كاملاً.
   *
   * [CRITICAL] مسار `/admin/restock/demand` خلف `requireAdmin`، والرقم هنا
   * لغرضٍ واحد: أن يتواصل الطاقم مع المنتظر عند التوفر. نفس تمثيل
   * `AdminCustomer.phone` — لا شكل ثانٍ للهاتف في اللوحة.
   */
  subscribers: { username: string; phone: string }[]
}

/** طلبات إعادة التوفر — للمسؤول وحده (`requireAdmin` على `/api/admin`). */
export async function listRestockDemand() {
  return get<RestockDemandRow[]>('/admin/restock/demand')
}

/**
 * ضبط موعد التوفر المتوقَّع لمنتج.
 *
 * [SECURITY] مسارٌ ضيّق (STEP 64): `PATCH /admin/restock/:id/schedule` يقبل
 * `restockAt` وحده ويُفتح لصلاحية «طلبات التوفر». كان يمرّ عبر تعديل المنتج
 * الكامل، فمن يدير طلبات التوفر كان يستطيع تعديل السعر والمخزون أيضاً. التحقق
 * والإشعار واحدٌ في الخادم (`adminService.updateProduct`) للمسارين.
 *
 * `null` يمسح الموعد.
 */
export async function setRestockAt(productId: string, restockAt: string | null) {
  return patch(`/admin/restock/${productId}/schedule`, { restockAt })
}
