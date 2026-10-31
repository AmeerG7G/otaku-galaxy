-- مزيّة مستوى واحدة لكل طلب (STEP 77) — حارسٌ في القاعدة خلف الخدمة.
--
-- الخدمة (`loyaltyRewardsService.levelRewardForOrder`) تختار مزيّة واحدة تحت
-- قفل صفوف الزبون. هذان الحارسان يمنعان أي مسارٍ آخر (أو خطأٍ لاحق) من حفظ
-- طلبٍ بمزيّتين:
--
--   ١) طلبٌ لا يحمل خصم مستوى وهدية مستوى معاً — زنادٌ لا CHECK.
--      [CRITICAL] CHECK (ولو `NOT VALID`) يُفحص على كل نسخة صفٍّ جديدة، وكل
--      UPDATE لأي عمود يُنشئ نسخة: طلبٌ قديم اجتمعا فيه (قبل هذه القاعدة) كان
--      سيعلق في حالته — قبوله أو رفضه أو تسليمه يفشل بـ23514. الزناد يُطلق عند
--      الإدراج وعند كتابة عمودَي المزيّة وحدهما (`UPDATE OF`)، فتغيير الحالة لا
--      يعيد الفحص، والتاريخ يبقى مقروءاً وقابلاً للتحديث كما حُفظ.
--
--   ٢) خصمٌ مستهلَك واحد على الأكثر لكل طلب. الإنشاء لم يستهلك قطّ أكثر من
--      خصمٍ في طلب (LIMIT 1 منذ 039)، فلا صفّ قائم يخالفه؛ لو وُجد يفشل
--      إنشاء الفهرس صراحةً ولا يُطبَّق شيء (الهجرة في معاملة).
--
-- التراجع: `DROP TRIGGER trg_orders_one_level_reward ON orders;
--           DROP FUNCTION orders_one_level_reward();
--           DROP INDEX uq_loyalty_reward_consumed_order;` — لا بيانات تُمسّ.

CREATE OR REPLACE FUNCTION orders_one_level_reward() RETURNS trigger AS $$
BEGIN
  IF NEW.loyalty_discount > 0 AND NEW.loyalty_gift_redemption_id IS NOT NULL THEN
    RAISE EXCEPTION 'order % carries a level discount and a level gift', NEW.id
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'orders_one_level_reward',
            TABLE = 'orders';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_one_level_reward
  BEFORE INSERT OR UPDATE OF loyalty_discount, loyalty_gift_redemption_id ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_one_level_reward();

CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_reward_consumed_order
  ON loyalty_reward_redemptions (consumed_order_id)
  WHERE consumed_order_id IS NOT NULL;
