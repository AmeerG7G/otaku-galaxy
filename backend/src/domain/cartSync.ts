/**
 * مزامنة العربة مع حال المنتجات الحالية (CA-14، قرار المالك).
 *
 * الخادم مرجع الحقيقة، والعربة لا تفاجئ الزبون عند الدفع: سطرٌ لم يعد قابلاً
 * للبيع يُزال، وكميةٌ تتجاوز المخزون تُخفَّض إليه — ويُبلَّغ الزبون بما عُدِّل.
 * السعر لا يُخزَّن في العربة أصلاً (يُقرأ حيّاً من المنتج)، فلا شيء يُخطَّط له.
 *
 * دالةٌ صافية: تقرّر فقط، والتنفيذ في `cartService.sync` داخل معاملةٍ تقفل
 * العربة.
 *
 * [CRITICAL] القياس على **المنتج** لا على السطر — `products.stock` عمودٌ واحد
 * للمنتج، وسطران بخيارين يتقاسمانه (القاعدة نفسها في `addItem` و`create`).
 * الأسبق إضافةً يحتفظ بقطعه أولاً؛ الأحدث يُخفَّض أو يُزال.
 *
 * زيادة المخزون لا ترفع كمية أحد: المزامنة تُصلح عربةً صارت غير صالحة، ولا
 * تقرّر عن الزبون أن يشتري أكثر.
 */

export interface CartSyncLine {
  id: string;
  productId: string;
  productName: string;
  optionValue: string | null;
  quantity: number;
  stock: number;
  isActive: boolean;
}

export type CartAdjustmentReason = 'unavailable' | 'reduced';

export interface CartAdjustment {
  lineId: string;
  productId: string;
  productName: string;
  optionValue: string | null;
  /** `unavailable`: المنتج معطَّل أو نفد — أُزيل السطر. `reduced`: خُفِّضت الكمية (إلى صفر = أُزيل). */
  reason: CartAdjustmentReason;
  previousQuantity: number;
  /** الكمية بعد المزامنة؛ صفرٌ يعني أن السطر أُزيل. */
  quantity: number;
}

/**
 * @param lines أسطر العربة **بترتيب الإضافة** (الأقدم أولاً).
 */
export function planCartSync(lines: readonly CartSyncLine[]): CartAdjustment[] {
  const remaining = new Map<string, number>();
  const adjustments: CartAdjustment[] = [];

  for (const line of lines) {
    const base = {
      lineId: line.id,
      productId: line.productId,
      productName: line.productName,
      optionValue: line.optionValue,
      previousQuantity: line.quantity,
    };

    if (!line.isActive || line.stock <= 0) {
      adjustments.push({ ...base, reason: 'unavailable', quantity: 0 });
      continue;
    }

    const left = remaining.get(line.productId) ?? line.stock;
    const kept = Math.min(line.quantity, left);
    remaining.set(line.productId, left - kept);
    if (kept < line.quantity) {
      adjustments.push({ ...base, reason: 'reduced', quantity: kept });
    }
  }

  return adjustments;
}
