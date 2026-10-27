/**
 * حساب مبالغ الطلب من قيمه الخام — مصدرٌ واحد للإنشاء وللمعاينة.
 *
 * [CRITICAL] كانت هذه الحسابات تعيش داخل `orderRepo.create` وحده، فلم يكن
 * للزبون أن يرى قبل التأكيد ما سيُحفظ فعلاً: شاشة الدفع كانت تعاين خصم
 * الميلاد على العميل وتجهل خصم مزيّة المستوى كلياً، فيطالب الزبون بالمزيّة
 * ثم لا يراها في ملخّص طلبه (2026-09-27). الآن يحسب الإنشاءُ والمعاينةُ
 * (`orderService.checkoutQuote`) بالدالة نفسها، فلا يمكن أن يتباعدا.
 *
 * دالة خالصة: لا قاعدة ولا ساعة. الخصومات تُحسب قبلها على الخادم
 * (`birthdayDiscountAmount`، `discountRewardAmount`) — لا مبلغ من العميل.
 */

import { createHash } from 'node:crypto';
import { discountCeilingIqd } from './discountRounding.js';

/**
 * خصما المنتجات بعد إدخالهما في مجموع المنتجات — للإنشاء وللمعاينة معاً.
 *
 * الخصم المقرَّب أدناه ٢٥٠ (`roundDiscountIqd`)، فسلّةٌ رخيصة قد يتجاوز
 * خصماها مجموعَها. يتّسعان هنا في أكبر مضاعفٍ لـ٢٥٠ لا يتجاوز المجموع
 * (`discountCeilingIqd`)، فيبقى كلٌّ منهما مضاعفاً لـ٢٥٠ ولا يتجاوزان ما
 * يُطبَّقان عليه.
 *
 * الميلاد أولاً لأنه ينقضي بانقضاء يومه، والمزيّة تأخذ ما بقي لأنها لا تسقط
 * (§40.9). خصمٌ لم يبقَ له شيء يصير صفراً — والصفر لا يُستهلك
 * (`orderService.create`)، فيبقى متاحاً لطلبٍ يتّسع له.
 */
export function fitProductDiscounts(
  productsTotal: number,
  parts: { birthday: number; loyalty: number },
): { birthday: number; loyalty: number } {
  const room = discountCeilingIqd(productsTotal);
  const birthday = Math.min(Math.max(parts.birthday, 0), room);
  const loyalty = Math.min(Math.max(parts.loyalty, 0), room - birthday);
  return { birthday, loyalty };
}

/** سطرٌ مسعَّر قبل عرض القطعتين — من العربة أو من لقطة الطلب. */
export interface PairPricedLine {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  /** سعر قطعتين من المنتج نفسه (085)؛ `null` = لا عرض. */
  pairPrice: number | null;
  createdAt: Date;
}

/**
 * مبلغ كل سطر بعد عرض «قطعتان بسعر» (085) — للعربة والمعاينة والطلب معاً.
 *
 * قرار المالك (2026-10-24): العرض على قطعتين من **المنتج نفسه** وإن اختلف
 * الخيار، ويتكرّر: كل قطعتين بسعر القطعتين والفردة بسعر القطعة (٤٠٠٠ / ٧٠٠٠ /
 * ١١٠٠٠ / ١٤٠٠٠). مجموع المنتجات هو مجموع هذه المبالغ، وعليه يُحسب الخصمان.
 *
 * قطع المنتج تُعدّ عبر أسطره بترتيب الإضافة (`createdAt` ثم `id`) لا بترتيب
 * المصفوفة، فالنتيجة واحدة في العربة (الأحدث أولاً) والطلب. التوفير
 * (`2 × سعر القطعة − سعر القطعتين`) يقع على السطر الذي تكتمل فيه القطعتان:
 * «أحمر» ثم «أزرق» = ٤٠٠٠ + ٣٠٠٠. القيد في القاعدة يحصره بين صفرٍ وسعر القطعة،
 * والحصر هنا أيضاً فلا يصير سطرٌ سالباً مهما وصل.
 *
 * دالة خالصة: معرّف السطر ← مبلغه، لكل سطر.
 */
export function pairPricedLineTotals(lines: ReadonlyArray<PairPricedLine>): Map<string, number> {
  const totals = new Map<string, number>();
  const ordered = [...lines].sort((a, b) => {
    const at = a.createdAt.getTime() - b.createdAt.getTime();
    if (at !== 0) return at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const unitsBefore = new Map<string, number>();
  for (const line of ordered) {
    const before = unitsBefore.get(line.productId) ?? 0;
    unitsBefore.set(line.productId, before + line.quantity);
    const full = line.unitPrice * line.quantity;
    if (line.pairPrice === null) {
      totals.set(line.id, full);
      continue;
    }
    const saving = Math.min(Math.max(2 * line.unitPrice - line.pairPrice, 0), line.unitPrice);
    const pairsCompleted = Math.floor((before + line.quantity) / 2) - Math.floor(before / 2);
    totals.set(line.id, full - pairsCompleted * saving);
  }
  return totals;
}

export interface OrderPricingInput {
  productsTotal: number;
  deliveryFee: number;
  /** مجموع ترويج التوصيل **قبل السقف**: Σ(الكمية × مبلغ المنتج). */
  deliveryPromoRaw: number;
  /** الخصم على المنتجات (ميلاد + مزيّة مستوى). */
  discount: number;
  /** الجزء الآتي من مزيّة مستوى داخل [discount]. */
  loyaltyDiscount: number;
}

export interface OrderPricing {
  productsTotal: number;
  discount: number;
  loyaltyDiscount: number;
  deliveryDiscount: number;
  deliveryDiscountExcess: number;
  payableDelivery: number;
  total: number;
}

export function priceOrder(input: OrderPricingInput): OrderPricing {
  const productsTotal = input.productsTotal;
  const discount = Math.min(Math.max(input.discount, 0), productsTotal);
  // الجزء لا يتجاوز الكل: لو قُصّ الخصم الكلي عند مجموع المنتجات وجب أن
  // يُقصّ معه تفصيلُه، وإلا رفض القيدُ `loyalty_discount <= discount` الصفَّ.
  const loyaltyDiscount = Math.min(Math.max(input.loyaltyDiscount, 0), discount);
  // ═══ قسمة ترويج التوصيل ═══
  //
  // الخام يُقسم قسمين لا ثالث لهما، ومجموعهما يساوي الخام دائماً:
  //   • ما يناله الزبون  = min(الخام، الرسوم)      → `delivery_discount`
  //   • ما يُقيَّد للمتجر = max(0, الخام − الرسوم) → `delivery_discount_excess`
  //
  // [CRITICAL] الفائض لا يمسّ `productsTotal` ولا `discount` ولا `total`.
  // نقلُه إلى أيٍّ منها يحوّل مبلغاً محتفَظاً به للمتجر إلى خصمٍ إضافي
  // للزبون — وهو عكس المطلوب تماماً.
  const deliveryPromoRaw = Math.max(input.deliveryPromoRaw, 0);
  const deliveryDiscount = Math.min(deliveryPromoRaw, input.deliveryFee);
  const deliveryDiscountExcess = Math.max(0, deliveryPromoRaw - input.deliveryFee);
  const payableDelivery = input.deliveryFee - deliveryDiscount;
  // لا يُسمح بإجمالي سالب مهما بلغ الخصم.
  const total = Math.max(0, productsTotal + payableDelivery - discount);
  return {
    productsTotal,
    discount,
    loyaltyDiscount,
    deliveryDiscount,
    deliveryDiscountExcess,
    payableDelivery,
    total,
  };
}

/** سطرٌ مسعَّر كما يراه الزبون في المراجعة ويُنشأ منه الطلب. */
export interface QuotedLine {
  productId: string;
  /** لون السطر (087)؛ `null`/غائب = بلا لون — البصمة كما كانت حرفاً بحرف. */
  variantId?: string | null;
  optionValue: string | null;
  quantity: number;
  unitPrice: number;
}

export interface QuoteFingerprintInput {
  lines: ReadonlyArray<QuotedLine>;
  governorateId: string;
  zoneId: string | null;
  deliveryFee: number;
  pricing: OrderPricing;
}

/**
 * بصمة المعاينة — ما راجعه الزبون بعينه: الأسطر بكمياتها وأسعارها، والوجهة
 * برسومها، وكل مبلغٍ يدفعه.
 *
 * [CRITICAL] المعاينة (`orderService.checkoutQuote`) تُرجعها، والإنشاء يعيد
 * حسابها تحت الأقفال من القيم التي سيحفظها. اختلافهما ⇒ `409 QUOTE_CHANGED`
 * ولا طلب: سطرٌ أُضيف من جهازٍ آخر، أو كميةٌ تغيّرت، أو رسومٌ عدّلتها الإدارة،
 * أو خصمٌ سقط — كلّها كانت تمرّ بصمت لأن `expectedPrices` يحرس سعر الوحدة وحده.
 *
 * فائض ترويج التوصيل (`deliveryDiscountExcess`) خارجها عمداً: قيدٌ للمتجر لا
 * يدفعه الزبون ولا يراه. الترتيب ثابت فلا تختلف بصمتان لترتيب الأسطر.
 */
export function quoteFingerprint(input: QuoteFingerprintInput): string {
  // اللون (087) يدخل السطر حين يوجد وحده، فبصمة عربةٍ بلا ألوان لا تتغيّر.
  const lines = input.lines
    .map((line) =>
      line.variantId
        ? ([line.productId, line.optionValue, line.quantity, line.unitPrice, line.variantId] as const)
        : ([line.productId, line.optionValue, line.quantity, line.unitPrice] as const),
    )
    .sort((a, b) => {
      if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
      const variantA = a[4] ?? '';
      const variantB = b[4] ?? '';
      if (variantA !== variantB) return variantA < variantB ? -1 : 1;
      const optionA = a[1] ?? '';
      const optionB = b[1] ?? '';
      if (optionA !== optionB) return optionA < optionB ? -1 : 1;
      return a[2] - b[2];
    });
  const canonical = JSON.stringify({
    v: 1,
    lines,
    governorateId: input.governorateId,
    zoneId: input.zoneId,
    deliveryFee: input.deliveryFee,
    productsTotal: input.pricing.productsTotal,
    discount: input.pricing.discount,
    loyaltyDiscount: input.pricing.loyaltyDiscount,
    deliveryDiscount: input.pricing.deliveryDiscount,
    total: input.pricing.total,
  });
  return `q1:${createHash('sha256').update(canonical).digest('hex')}`;
}
