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
 * لا نقطة نهاية جديدة: `restock_at` عمودٌ في `products` ومسار تعديل المنتج
 * القائم يقبله سلفاً. إضافة مسار ثانٍ لنفس الحقل كانت ستعني مصدرين للتحقق
 * ولقواعد الصلاحية.
 *
 * `null` يمسح الموعد.
 */
export async function setRestockAt(productId: string, restockAt: string | null) {
  return patch(`/admin/products/${productId}`, { restockAt })
}
