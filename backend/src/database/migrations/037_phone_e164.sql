-- تحويل أرقام الهاتف المخزَّنة إلى الصيغة الدولية المعتمدة E.164.
--
-- [CRITICAL] الخادم صار يطبّع كل رقم وارد إلى `+9647XXXXXXXXX` قبل أن
-- يخزّنه أو يقارنه. بلا هذه الهجرة يبقى في القاعدة تمثيلٌ ثانٍ للرقم نفسه:
-- المستخدم القديم مخزَّن بـ`07701234567`، وطلب دخوله يصل مطبَّعاً
-- `+9647701234567`، فلا يتطابقان ويُقفل خارج حسابه. التحويل هنا ليس تجميلاً
-- بل شرطُ ألّا ينكسر أي حساب قائم.
--
-- تغييرُ المخطّط هنا **مفروض لا اختياري**: الجداول الثلاثة تحمل قيد
-- `CHECK (phone ~ '^07[0-9]{9}$')`، فتحويل البيانات وحده يرتطم به. القيد
-- يُستبدل بنظيره على الصيغة الجديدة — لا يُحذف بلا بديل، فالقاعدة تبقى
-- حارسةً للشكل كما كانت.
--
-- الأمان:
--   * التحويل **حسابي بحت**: نزع الصفر ووضع `+964` مكانه. لا حذف، لا دمج،
--     لا اشتقاق من بيانات أخرى، ولا لمس لأي عمود آخر.
--   * الشرط `~ '^07[0-9]{9}$'` يجعلها **مُقاوِمة لإعادة التشغيل**: الصفوف
--     المحوَّلة سلفاً لا تطابقه فلا تُمَسّ مرة ثانية.
--   * فحصان مسبقان يوقفان الهجرة برسالة مفهومة بدل أن ترتطم بقيد وتترك
--     القاعدة نصف محوَّلة.
--   * الملف كله ينفَّذ داخل معاملة واحدة (انظر `scripts/migrate.ts`)، فإما
--     أن يتم بكامله أو لا يتم منه شيء.

-- ١) صفوف لا يمكن تحويلها إلى الصيغة المعتمدة — تُذكر بدل أن تُتجاهل.
DO $$
DECLARE
  bad_rows int;
BEGIN
  SELECT count(*) INTO bad_rows FROM (
    SELECT phone FROM users              WHERE phone !~ '^07[5-9][0-9]{8}$' AND phone !~ '^\+9647[5-9][0-9]{8}$'
    UNION ALL
    SELECT phone FROM verification_codes WHERE phone !~ '^07[5-9][0-9]{8}$' AND phone !~ '^\+9647[5-9][0-9]{8}$'
    UNION ALL
    SELECT phone FROM orders             WHERE phone !~ '^07[5-9][0-9]{8}$' AND phone !~ '^\+9647[5-9][0-9]{8}$'
  ) t;

  IF bad_rows > 0 THEN
    RAISE EXCEPTION
      'تعذّر تحويل أرقام الهاتف: % صفاً بصيغة لا تنتمي إلى نطاقات المحمول العراقية (075–079). عالِجها يدوياً قبل الترقية.',
      bad_rows;
  END IF;
END $$;

-- ٢) تصادم محتمل: رقمان مختلفان ينتهيان إلى الصيغة الدولية نفسها.
DO $$
DECLARE
  clashes int;
BEGIN
  SELECT count(*) INTO clashes FROM (
    SELECT CASE WHEN phone ~ '^0' THEN '+964' || substring(phone from 2) ELSE phone END AS canonical
    FROM users
    GROUP BY 1 HAVING count(*) > 1
  ) t;

  IF clashes > 0 THEN
    RAISE EXCEPTION
      'تعذّر تحويل أرقام الهاتف: % رقماً سيتصادم مع رقم قائم على قيد التفرّد. عالِج التكرار يدوياً أولاً.',
      clashes;
  END IF;
END $$;

-- ٣) رفع القيود القديمة قبل الكتابة.
ALTER TABLE users              DROP CONSTRAINT IF EXISTS users_phone_check;
ALTER TABLE verification_codes DROP CONSTRAINT IF EXISTS verification_codes_phone_check;
ALTER TABLE orders             DROP CONSTRAINT IF EXISTS orders_phone_check;

-- ٤) التحويل.
UPDATE users
   SET phone = '+964' || substring(phone from 2)
 WHERE phone ~ '^07[0-9]{9}$';

UPDATE verification_codes
   SET phone = '+964' || substring(phone from 2)
 WHERE phone ~ '^07[0-9]{9}$';

-- رقم التواصل المسجَّل مع الطلب — نسخة وقت الطلب لا مرجعٌ إلى `users`،
-- فيجب أن يُحوَّل هو الآخر وإلا اختلف تمثيل الرقم بين الحساب وطلباته.
UPDATE orders
   SET phone = '+964' || substring(phone from 2)
 WHERE phone ~ '^07[0-9]{9}$';

-- ٥) القيد الجديد — نفس القاعدة التي يطبّقها `normalizeIraqiPhone`:
--    `+964` ثم `7` ثم خانة من نطاقات المحمول المخصَّصة ثم ثمانية أرقام.
ALTER TABLE users
  ADD CONSTRAINT users_phone_check CHECK (phone ~ '^\+9647[5-9][0-9]{8}$');
ALTER TABLE verification_codes
  ADD CONSTRAINT verification_codes_phone_check CHECK (phone ~ '^\+9647[5-9][0-9]{8}$');
ALTER TABLE orders
  ADD CONSTRAINT orders_phone_check CHECK (phone ~ '^\+9647[5-9][0-9]{8}$');
