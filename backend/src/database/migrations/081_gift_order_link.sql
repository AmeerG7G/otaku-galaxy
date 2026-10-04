-- ربط هدية المستوى بطلب بعينه.
--
-- عمود FK على جدول الطلبات يُثبّت الربط: الطلب يعرف أيّ هدية مزيّة مُفعَّلة
-- معه، والمؤشر الفريد الجزئي يمنع ربط هديتين طلبَين مختلفَين باستردادٍ واحد.
--
-- [CRITICAL] قيد migration 042 (loyalty_reward_gift_not_consumed) يبقى سليماً:
-- الهدية لا تُكتب consumed_at/consumed_order_id أبداً — تلك للخصومات وحدها.
-- الربط هنا (loyalty_gift_redemption_id) لا علاقة له بالاستهلاك؛ fulfilled_at
-- يبقى الدلالة الوحيدة على التسليم الفعلي للهدية.

ALTER TABLE orders
  ADD COLUMN loyalty_gift_redemption_id UUID
    REFERENCES loyalty_reward_redemptions(id)
    ON DELETE SET NULL;

-- المؤشر الجزئي: قيمتان غير NULL لا يمكن أن تكونا متطابقتَين ⇒ هديةٌ واحدة
-- لا يمكن إرفاقها بطلبَين، سواءً جرَّبه الزبون يدوياً أم نتج عن سباق.
CREATE UNIQUE INDEX orders_loyalty_gift_unique
  ON orders (loyalty_gift_redemption_id)
  WHERE loyalty_gift_redemption_id IS NOT NULL;
