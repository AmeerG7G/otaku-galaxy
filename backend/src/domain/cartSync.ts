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
 * [CRITICAL] القياس على **مخزون السطر** لا على السطر — اللون لسطرٍ بلون (087)،
 * وإلا `products.stock` عمودٌ واحد للمنتج يتقاسمه سطران بخيارين ([stockPoolKey]،
 * القاعدة نفسها في `addItem` و`create`). الأسبق إضافةً يحتفظ بقطعه أولاً؛
 * الأحدث يُخفَّض أو يُزال.
 *
 * زيادة المخزون لا ترفع كمية أحد: المزامنة تُصلح عربةً صارت غير صالحة، ولا
 * تقرّر عن الزبون أن يشتري أكثر.
 */

export interface CartSyncLine {
  id: string;
  productId: string;
  /** الاسم العربي. */
  productName: string;
  /** الاسم الكردي؛ `null` = ناقص (066). */
  productNameCkb: string | null;
  optionValue: string | null;
  quantity: number;
  stock: number;
  isActive: boolean;
  /** للمنتج سعرٌ معلن؟ (084) — بلا سعر يُعامَل كالمعطَّل: يُزال السطر. */
  priced: boolean;
  /** لون السطر (087)؛ `null` لمنتجٍ بلا ألوان. `stock` حينها مخزون اللون. */
  variantId: string | null;
  variantColorName: string | null;
  variantColorNameCkb: string | null;
  /**
   * `false`: اللون موقوف، أو السطر بلا لون ومنتجه صار بألوان — لا يُعرف أيّ
   * لونٍ أراد الزبون، فلا يُختار عنه: يُزال السطر.
   */
  variantSellable: boolean;
}

export type CartAdjustmentReason = 'unavailable' | 'reduced';

export interface CartAdjustment {
  lineId: string;
  productId: string;
  /** الاسم العربي — الحقل القديم، باقٍ بمعناه. */
  productName: string;
  /** الاسم باللغتين صراحةً (066) — التطبيق يسمّي المنتج بلغة واجهته. */
  productNameAr: string;
  productNameCkb: string | null;
  optionValue: string | null;
  /** لون السطر (087) — الاسم العربي في الحقل القديم واللغتان صريحتان. */
  variantId: string | null;
  variantColorName: string | null;
  variantColorNameAr: string | null;
  variantColorNameCkb: string | null;
  /** `unavailable`: المنتج معطَّل أو نفد أو بلا سعرٍ معلن — أُزيل السطر. `reduced`: خُفِّضت الكمية (إلى صفر = أُزيل). */
  reason: CartAdjustmentReason;
  previousQuantity: number;
  /** الكمية بعد المزامنة؛ صفرٌ يعني أن السطر أُزيل. */
  quantity: number;
}

/**
 * مفتاح المخزون الذي يُقاس عليه السطر: اللون لسطرٍ بلون (087) — كل لونٍ مخزونٌ
 * مستقل — وإلا المنتج. القاعدة نفسها في العربة والطلب والقبول.
 */
export function stockPoolKey(line: { productId: string; variantId: string | null }): string {
  return line.variantId !== null ? `v:${line.variantId}` : `p:${line.productId}`;
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
      productNameAr: line.productName,
      productNameCkb: line.productNameCkb,
      optionValue: line.optionValue,
      variantId: line.variantId,
      variantColorName: line.variantColorName,
      variantColorNameAr: line.variantColorName,
      variantColorNameCkb: line.variantColorNameCkb,
      previousQuantity: line.quantity,
    };

    if (!line.isActive || !line.priced || !line.variantSellable || line.stock <= 0) {
      adjustments.push({ ...base, reason: 'unavailable', quantity: 0 });
      continue;
    }

    // المخزون الذي يتقاسمه السطر: اللون لسطرٍ بلون (087)، وإلا المنتج.
    const pool = stockPoolKey(line);
    const left = remaining.get(pool) ?? line.stock;
    const kept = Math.min(line.quantity, left);
    remaining.set(pool, left - kept);
    if (kept < line.quantity) {
      adjustments.push({ ...base, reason: 'reduced', quantity: kept });
    }
  }

  return adjustments;
}
