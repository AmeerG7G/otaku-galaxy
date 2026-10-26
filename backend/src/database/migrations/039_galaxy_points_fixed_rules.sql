-- 039_galaxy_points_fixed_rules.sql
-- نقاط المجرّة: من نظام قابل للضبط إلى قواعد تجارية ثابتة.
--
-- كانت قيم المنح تُقرأ من `store_settings` وكان السلّم جدولاً كامل الصلاحيات
-- (`loyalty_levels`) يُنشئ المسؤول فيه ما يشاء ويحذف. النتيجة أن ما يراه
-- الزبون في شاشته رهنٌ بمن فتح اللوحة آخر مرة، وأن «قاعدة العمل» لم يكن لها
-- تعريف واحد يمكن الرجوع إليه. القواعد الآن مثبَّتة في
-- `src/domain/galaxyPoints.ts`، وهذه الهجرة تزيل ما كان يسمح بتجاوزها
-- وتضيف ما تحتاجه القواعد الجديدة.
--
-- الدفتر (`points_ledger`) لا يُمَسّ: لا صفّ يُعاد كتابته ولا رصيد يُعاد
-- حسابه. المستوى مشتقٌّ من الرصيد لحظة القراءة، فزبونٌ رصيده ١٦٠ نقطة كسبها
-- تحت النظام القديم يفتح مزيّة المئة تحت السلّم الجديد بلا أي تدخّل.

-- ═══════════ ١) صور التقييم: من صورة واحدة إلى ١–٥ ═══════════
--
-- مكافأة الصور مقطوعة (٥ نقاط للتقييم مهما بلغ عدد الصور)، والسقف خمسٌ
-- تفرضه القاعدة لا الواجهة: تحقّقُ فلاتر وحده يسقط أمام استدعاء مباشر.

ALTER TABLE reviews
  ADD COLUMN photo_urls TEXT[] NOT NULL DEFAULT '{}';

-- نقل الصور القائمة قبل إسقاط العمود القديم — لا تُفقد صورة واحدة.
UPDATE reviews
   SET photo_urls = ARRAY[btrim(photo_url)]
 WHERE photo_url IS NOT NULL AND btrim(photo_url) <> '';

ALTER TABLE reviews
  ADD CONSTRAINT reviews_photo_urls_max_five
    CHECK (cardinality(photo_urls) <= 5),
  -- عنصر فارغ في المصفوفة صورةٌ لا وجود لها؛ الرفض هنا يمنع «صورة» بيضاء
  -- تُحتسب في المكافأة.
  ADD CONSTRAINT reviews_photo_urls_no_blanks
    CHECK (NOT ('' = ANY(photo_urls)));

-- الفهرس القديم مبنيّ على `photo_url`، فيجب إسقاطه قبل العمود.
DROP INDEX IF EXISTS idx_reviews_community;

ALTER TABLE reviews DROP COLUMN photo_url;

CREATE INDEX idx_reviews_community
  ON reviews (created_at DESC)
  WHERE status = 'approved' AND cardinality(photo_urls) > 0;

-- ═══════════ ٢) تقييم واحد لكل زبون لكل منتج — إلى الأبد ═══════════
--
-- كان القيد `(order_id, product_id)`: أي أن شراء المنتج نفسه مرة ثانية يفتح
-- تقييماً ثانياً ومكافأة ثانية. القاعدة التجارية أن للمنتج تقييماً واحداً من
-- كل زبون مهما تكرّر الشراء.
--
-- [CRITICAL] الصفوف المخالفة تُذكر ولا تُحذف. حذف تقييم زبون لتمرير هجرة
-- إتلافُ بيانات حقيقية لقرارٍ يخصّ البشر لا المُهاجِر.
DO $$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(format('user=%s product=%s (%s تقييمات)', user_id, product_id, n), E'\n')
    INTO offenders
    FROM (
      SELECT user_id, product_id, COUNT(*) AS n
        FROM reviews
       WHERE product_id IS NOT NULL
       GROUP BY user_id, product_id
      HAVING COUNT(*) > 1
    ) d;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION E'DUPLICATE_REVIEWS_BLOCK_MIGRATION\n%', offenders
      USING HINT = 'يوجد زبائن لهم أكثر من تقييم لنفس المنتج. قرّر أيها يبقى قبل تطبيق الهجرة — لا تُحذف تلقائياً.';
  END IF;
END $$;

ALTER TABLE reviews DROP CONSTRAINT reviews_order_id_product_id_key;

CREATE UNIQUE INDEX uq_reviews_user_product
  ON reviews (user_id, product_id)
  WHERE product_id IS NOT NULL;

-- ═══════════ ٣) مزايا المستويات: مطالبة واحدة لا تتكرّر ═══════════
--
-- [CRITICAL] `UNIQUE (user_id, level_key)` هو الحارس الحقيقي، لا شرطٌ في
-- الخدمة. الضغطة المزدوجة والطلبان المتزامنان وإعادةُ المحاولة بعد انقطاع
-- الشبكة كلها تصل الخادم كطلبين حقيقيين؛ فحصُ «هل طالب من قبل؟» ثم الإدراج
-- يمرّ منه اثنان معاً. القيد يجعل الثاني مستحيلاً لا بعيد الاحتمال.

CREATE TABLE loyalty_reward_redemptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- مفتاح المستوى من `GALAXY_LEVELS` — نصّ مستقر لا مفتاح أجنبي: السلّم صار
  -- شيفرةً لا جدولاً، ومفتاحٌ أجنبي إلى جدول محذوف لا معنى له.
  level_key         TEXT NOT NULL CHECK (level_key IN (
                      'explorer', 'voyager', 'warrior', 'champion', 'star', 'legend'
                    )),
  kind              TEXT NOT NULL CHECK (kind IN ('discount', 'gift')),

  -- لقطة المزيّة لحظة المطالبة. القيم ثابتة في الشيفرة، لكن حفظها هنا يجعل
  -- كل استرداد مقروءاً بذاته بعد سنوات بلا الرجوع إلى إصدار الخادم وقتها.
  percent           INTEGER CHECK (percent IS NULL OR (percent > 0 AND percent <= 100)),
  cap_amount        NUMERIC(12,2) CHECK (cap_amount IS NULL OR cap_amount >= 0),
  gift_amount       NUMERIC(12,2) CHECK (gift_amount IS NULL OR gift_amount >= 0),

  claimed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- الخصم: الطلب الذي استُهلك فيه. يبقى NULL حتى يُستهلك فعلاً.
  consumed_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  consumed_at       TIMESTAMPTZ,

  -- الهدية: لحظة تسليم المسؤول لها ومن سلّمها. تبقى NULL حتى فعلٍ صريح منه؛
  -- المطالبة وحدها ليست تسليماً.
  fulfilled_at      TIMESTAMPTZ,
  fulfilled_by      UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, level_key),

  -- شكل المزيّة متّسق مع نوعها: خصمٌ بنسبة وسقف، أو هدية بقيمة. الخلط
  -- («خصم بقيمة هدية») حالةٌ لا يعرف القارئ كيف يفسّرها.
  CONSTRAINT loyalty_reward_shape CHECK (
    (kind = 'discount' AND percent IS NOT NULL AND cap_amount IS NOT NULL AND gift_amount IS NULL)
    OR
    (kind = 'gift' AND gift_amount IS NOT NULL AND percent IS NULL AND cap_amount IS NULL)
  ),

  -- الهدية لا تُستهلك في طلب، والخصم لا يُسلَّم يدوياً. كلٌّ في مساره.
  CONSTRAINT loyalty_reward_gift_not_consumed CHECK (
    kind <> 'gift' OR (consumed_order_id IS NULL AND consumed_at IS NULL)
  ),
  CONSTRAINT loyalty_reward_discount_not_fulfilled CHECK (
    kind <> 'discount' OR (fulfilled_at IS NULL AND fulfilled_by IS NULL)
  ),

  -- الاستهلاك والتسليم: الطابع الزمني والمرجع يُضبطان معاً أو لا يُضبطان.
  CONSTRAINT loyalty_reward_consumed_pair CHECK (
    (consumed_order_id IS NULL) = (consumed_at IS NULL)
  ),
  CONSTRAINT loyalty_reward_fulfilled_pair CHECK (
    (fulfilled_at IS NULL) = (fulfilled_by IS NULL)
  )
);

CREATE INDEX idx_loyalty_redemptions_user ON loyalty_reward_redemptions (user_id);

-- طابور الهدايا في لوحة التحكم: غير المسلَّمة أولاً وأقدمها أولاً.
CREATE INDEX idx_loyalty_redemptions_pending_gifts
  ON loyalty_reward_redemptions (claimed_at)
  WHERE kind = 'gift' AND fulfilled_at IS NULL;

-- الخصم الجاهز للاستهلاك — يقرأه إنشاء الطلب.
CREATE INDEX idx_loyalty_redemptions_open_discount
  ON loyalty_reward_redemptions (user_id, claimed_at)
  WHERE kind = 'discount' AND consumed_order_id IS NULL;

CREATE TRIGGER trg_loyalty_redemptions_updated_at
  BEFORE UPDATE ON loyalty_reward_redemptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════ ٤) لقطة خصم المزيّة على الطلب ═══════════
--
-- `discount` يبقى **مجموع** خصومات المنتجات (ميلاد + مزيّة) لأنه ما تطرحه
-- قيمةُ الشراء المؤهَّلة. هذا العمود تفصيلٌ للقراءة والتدقيق: كم من ذلك
-- المجموع جاء من مزيّة مستوى. نفس نمط `delivery_discount` في هجرة ٠١٩.
ALTER TABLE orders
  ADD COLUMN loyalty_discount NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (loyalty_discount >= 0),
  -- الجزء لا يتجاوز الكل.
  ADD CONSTRAINT orders_loyalty_discount_within_discount
    CHECK (loyalty_discount <= discount);

-- ═══════════ ٥) إزالة الضبط المُلغى ═══════════
--
-- السلّم صار شيفرةً ثابتة، فالجدول وأداةُ حراستِه لا مكان لهما. ما يُحذف هنا
-- بياناتُ **ضبط** لا بيانات زبائن: لا رصيد ولا حركة دفتر تتأثر.
DROP TRIGGER IF EXISTS trg_loyalty_levels_base ON loyalty_levels;
DROP TRIGGER IF EXISTS trg_loyalty_levels_updated_at ON loyalty_levels;
DROP TABLE IF EXISTS loyalty_levels;
DROP FUNCTION IF EXISTS assert_base_loyalty_level();

-- قيم المنح لم تعد تُقرأ من الإعدادات. تُحذف الصفوف كي لا يبقى في القاعدة
-- رقمٌ يبدو أنه يؤثّر وهو لا يؤثّر — وهو أسوأ من غيابه.
DELETE FROM store_settings
 WHERE key IN (
   'points_order_received',
   'points_review_approved',
   'points_review_with_photo'
 );
