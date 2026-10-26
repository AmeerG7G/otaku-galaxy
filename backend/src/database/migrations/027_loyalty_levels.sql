-- 027_loyalty_levels.sql
-- مستويات الأوتاكو: من ثوابت في تطبيق فلاتر إلى بيانات يديرها المسؤول.
--
-- كانت المستويات الأربعة `enum` في `otaku_level.dart`: الاسم والعتبة
-- والمزية كلها مخبوزة في التطبيق. تغيير مزيّةٍ واحدة كان يستلزم إصداراً
-- جديداً على المتجرين وانتظار تحديث كل زبون — أي أن قراراً تجارياً يومياً
-- كان محكوماً بدورة نشر تطبيق.
--
-- الدفتر لا يُمَسّ: المستوى مشتقٌّ من الرصيد لحظة القراءة، والرصيد مجموع
-- حركات الدفتر. تعديل عتبة يغيّر ما يُعرض من الآن فصاعداً، ولا يعيد كتابة
-- حركة واحدة في التاريخ.

CREATE TABLE loyalty_levels (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  -- أقل رصيد يفتح المستوى. فريدة: عتبتان متساويتان تجعلان «المستوى الحالي»
  -- سؤالاً بلا جواب واحد.
  required_points    INTEGER NOT NULL UNIQUE CHECK (required_points >= 0),
  reward             TEXT NOT NULL DEFAULT '' CHECK (char_length(reward) <= 120),
  reward_description TEXT NOT NULL DEFAULT '' CHECK (char_length(reward_description) <= 300),
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- الترتيب مشتقٌّ من العتبة لا عمودٌ ثانٍ: «الترتيب» و«العتبة» لو انفصلا
-- لأمكن أن يتناقضا، ويصير سلّم المستويات نازلاً بينما الأرقام صاعدة.
CREATE INDEX idx_loyalty_levels_threshold ON loyalty_levels (required_points);

CREATE TRIGGER trg_loyalty_levels_updated_at
  BEFORE UPDATE ON loyalty_levels FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- القيم الابتدائية هي **نفس** قيم التطبيق الحالية حرفياً، فترقية الخادم
-- لا تغيّر ما يراه أي زبون مفتوحٌ عنده التطبيق الآن.
INSERT INTO loyalty_levels (name, required_points, reward, reward_description)
VALUES
  ('أوتاكو جديد',    0,   'بداية الرحلة',            'أهلاً بك في مجرّة الأوتاكو — اجمع النقاط وارتقِ.'),
  ('أوتاكو فعّال',    30,  'خصم على الطلبات',         'مزايا خصم تُعلن عنها الإدارة.'),
  ('أوتاكو ذهبي',    80,  'هدية مع الطلب',           'هدية صغيرة تُرفق مع طلبك.'),
  ('أسطورة المجرّة', 160, 'وصول مبكر للتشكيلات',     'ترى التشكيلات الجديدة قبل غيرك.')
ON CONFLICT (required_points) DO NOTHING;

-- [CRITICAL] لا بد من مستوى عند الصفر، وإلا وقف الزبون الجديد (رصيده صفر)
-- خارج السلّم كله ولم يُعرض له مستوى إطلاقاً. يُفرض على مستوى القاعدة لا
-- بالاتفاق: أي حذف أو تعطيل يُفرغ الصفر يُرفض.
CREATE OR REPLACE FUNCTION assert_base_loyalty_level() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM loyalty_levels WHERE is_active = TRUE AND required_points = 0
  ) THEN
    RAISE EXCEPTION 'BASE_LEVEL_REQUIRED'
      USING HINT = 'يجب أن يبقى مستوى نشط عند صفر نقطة.';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_loyalty_levels_base
  AFTER INSERT OR UPDATE OR DELETE ON loyalty_levels
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_base_loyalty_level();
