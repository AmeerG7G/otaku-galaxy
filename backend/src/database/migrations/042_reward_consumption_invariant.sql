-- 042_reward_consumption_invariant.sql
-- «هل استُهلكت المزيّة؟» يجيب عنه الطابع الزمني لا رابط الطلب.
--
-- العطل الذي يعالجه هذا الملف ظهر عند حذف طلب: مفتاح `consumed_order_id`
-- معرَّف `ON DELETE SET NULL`، فحذفُ الطلب كان يُفرغه بينما يبقى
-- `consumed_at` مضبوطاً — فيسقط القيد المزدوج `(consumed_order_id IS NULL)
-- = (consumed_at IS NULL)` ويُرفض الحذف بخطأ قاعدة.
--
-- [CRITICAL] والأخطر أن الفحص المنطقي كان معلّقاً بالرابط نفسه: استعلام
-- «الخصم المفتوح» يشترط `consumed_order_id IS NULL`. لو نجح الحذف لعادت
-- مزيّةٌ أُنفقت فعلاً إلى قائمة المتاح، فيستهلكها صاحبها مرة ثانية — أي
-- كسرُ ضمانة «مرة واحدة» عبر حدثٍ لا علاقة له بالمزايا أصلاً.
--
-- التصحيح: `consumed_at` وحده هو الحقيقة. رابط الطلب أثرٌ للتدقيق يجوز أن
-- يضيع إن حُذف الطلب — تماماً كما يفقد `points_ledger.order_id` رابطَه ويبقى
-- مقدار النقاط، وكما يبقى التقييم بلا `product_id` بعد حذف المنتج.

ALTER TABLE loyalty_reward_redemptions
  DROP CONSTRAINT loyalty_reward_consumed_pair;

-- الاتجاه الباقي وحده هو الصحيح: رابطُ طلبٍ يستلزم طابعاً زمنياً. العكس لا
-- يستلزم شيئاً، لأن الرابط قد يُمحى بحذف الطلب بعد الاستهلاك.
ALTER TABLE loyalty_reward_redemptions
  ADD CONSTRAINT loyalty_reward_consumed_needs_timestamp
    CHECK (consumed_order_id IS NULL OR consumed_at IS NOT NULL);

-- الهدية ما زالت لا تُستهلك في طلب — يُعاد التعبير عنه بالطابع أيضاً.
ALTER TABLE loyalty_reward_redemptions
  DROP CONSTRAINT loyalty_reward_gift_not_consumed;
ALTER TABLE loyalty_reward_redemptions
  ADD CONSTRAINT loyalty_reward_gift_not_consumed
    CHECK (kind <> 'gift' OR (consumed_order_id IS NULL AND consumed_at IS NULL));

-- الفهرس يتبع التعريف الجديد لـ«مفتوح».
DROP INDEX IF EXISTS idx_loyalty_redemptions_open_discount;
CREATE INDEX idx_loyalty_redemptions_open_discount
  ON loyalty_reward_redemptions (user_id, claimed_at)
  WHERE kind = 'discount' AND consumed_at IS NULL;
