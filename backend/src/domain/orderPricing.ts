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
