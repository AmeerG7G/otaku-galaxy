/**
 * خصم عيد الميلاد — قاعدة تجارية ثابتة.
 *
 * [CRITICAL] النسبة **ليست إعداداً**. كانت تُقرأ من `store_settings` ويضبطها
 * المسؤول من لوحة التحكم، فصار مقدارُ الخصم الذي يحصل عليه الزبون رهيناً بمن
 * فتح اللوحة آخر مرة — ولم يعد لـ«خصم عيد الميلاد» تعريفٌ واحد يُرجع إليه.
 *
 * ما بقي على حاله عمداً: الأهلية (طلب مكتمل + تاريخ ميلاد مسجَّل)، والاستهلاك
 * مرة واحدة في السنة الميلادية (يحرسه `UNIQUE (user_id, used_year)` في
 * `birthday_discount_usage`)، وحساب الخصم على مجموع المنتجات وقت إنشاء الطلب.
 * هذا الملف يستبدل **مصدر النسبة** لا شيئاً غيره.
 */

import { roundDiscountIqd } from './discountRounding.js';

/** نسبة خصم عيد الميلاد من مجموع المنتجات. */
export const BIRTHDAY_DISCOUNT_PERCENT = 5;

/**
 * قيمة خصم الميلاد على مجموع منتجات.
 *
 * التقريب بقاعدة الخصم الواحدة (`roundDiscountIqd`: أقرب ٢٥٠، وأدناه ٢٥٠) على
 * النسبة الخام مباشرة. كان `Math.round` إلى دينار؛ قاعدة الـ٢٥٠ قرار المالك
 * (2026-09-27)، وتقريبٌ إلى دينار قبلها كان سيغيّر النتيجة عند الحدود.
 */
export function birthdayDiscountAmount(productsTotal: number): number {
  if (!Number.isFinite(productsTotal) || productsTotal <= 0) return 0;
  return roundDiscountIqd((productsTotal * BIRTHDAY_DISCOUNT_PERCENT) / 100);
}
