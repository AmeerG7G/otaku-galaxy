-- 055_temporary_slot_image.sql
-- صورةٌ مؤقّتة فوق الصورة الدائمة، وفتحةُ شاشة انقطاع الاتصال.
--
-- قرار منتج (2026-09-20، يُحدّث قرار الهجرة ٠٥٤): للموضع صورةٌ **دائمة**
-- واحدة (`image_url`)، ويجوز للمسؤول أن يضع فوقها صورةً **مؤقّتة** واحدة
-- إلى لحظةٍ محدّدة (`temporary_until`). ما يراه الزبون في أي لحظة صورةٌ
-- واحدة: المؤقّتة ما لم تنتهِ، وإلا الدائمة، وإلا الرسم المضمَّن.
-- ليست قائمة صور ولا تدويراً: عمودان للدائمة وثلاثة للمؤقّتة في الصفّ نفسه،
-- والانتهاء يعيد الدائمة **تلقائياً** بلا كتابة — القاعدة تُقاس عند القراءة
-- (`temporary_until > now()`) فلا مؤقّتٌ ولا مهمّة تنظيف يمكن أن تتأخّر.
--
-- [CRITICAL] المؤقّتة لا تلمس الدائمة أبداً: وضعُها أو انتهاؤها أو إزالتها
-- يكتب أعمدتها الثلاثة وحدها. والعكس صحيح: استبدال الدائمة أثناء مؤقّتةٍ
-- سارية لا يُظهرها إلا حين تنتهي المؤقّتة.
--
-- المنطقة الزمنية: `TIMESTAMPTZ` لحظةٌ مطلقة كسائر مواعيد المشروع
-- (`products.restock_at`)؛ اللوحة تحوّل اليوم المختار إلى لحظة انتهائه
-- وترسلها ISO-8601 بإزاحتها، والخادم يقارنها بـ`now()` — لا حسابَ أيامٍ
-- على العميل ولا افتراضَ منطقةٍ في القاعدة.

-- ═══ ١) أعمدة الصورة المؤقّتة ═══
ALTER TABLE visual_slots
  ADD COLUMN temporary_image_url TEXT
    CHECK (temporary_image_url IS NULL OR char_length(btrim(temporary_image_url)) > 0),
  ADD COLUMN temporary_media_id  UUID REFERENCES media_files(id) ON DELETE SET NULL,
  ADD COLUMN temporary_until     TIMESTAMPTZ,
  -- الصورة ولحظة انتهائها معاً أو لا شيء: مؤقّتةٌ بلا نهاية هي دائمةٌ
  -- متنكّرة، ونهايةٌ بلا صورة لا معنى لها.
  ADD CONSTRAINT visual_slots_temporary_pair
    CHECK ((temporary_image_url IS NULL) = (temporary_until IS NULL));

-- ═══ ٢) فتحة شاشة انقطاع الاتصال ═══
-- كانت مستبعَدة عمداً («تُعرض حين لا شبكة»). صارت فتحةً بقرار منتج
-- (2026-09-20) لأن المعمارية تجعل ذلك آمناً: صورة الفتحة تُقرأ من ذاكرة
-- القرص التي يملؤها التطبيق عند الإقلاع (`prefetch`/`warmRestored`)، وكل
-- مسار فشل — لا صورة على القرص، أول تشغيلٍ على الإطلاق — ينتهي إلى الرسم
-- المضمَّن نفسه الذي كان يُعرض دائماً. الشاشة لا تفرغ في أي حال.
INSERT INTO visual_slots (slot_key, label, location, group_key, sort_order)
VALUES ('offline_gate_character',
        'شخصية عدم الاتصال بالإنترنت',
        'شاشة انقطاع الاتصال — الرسم أعلى اللوحة (تُعرض حين لا إنترنت)',
        'connectivity', 0)
ON CONFLICT (slot_key) DO NOTHING;

-- ═══ ٣) أسماء تقول الشاشة والحالة بصيغةٍ واحدة ═══
-- «شخصية لا نتائج» تُقرأ بصعوبة بين أربعين اسماً؛ الصيغة «شخصية <الشاشة>
-- <الحالة>» تجعل السؤال «أيّ شاشة؟» مجاباً من الاسم وحده. النصّ المزروع
-- وحده يُصحَّح — اسمٌ عدّله المسؤول بيده لا يُمسّ (كما في ٠٥٣ و٠٥٤).
UPDATE visual_slots SET label = 'شخصية نتائج البحث الفارغة'
 WHERE slot_key = 'empty_search_character' AND label = 'شخصية لا نتائج';
UPDATE visual_slots SET label = 'شخصية الطلبات الفارغة'
 WHERE slot_key = 'empty_orders_character' AND label = 'شخصية لا طلبات';
UPDATE visual_slots SET label = 'شخصية قائمة الأقسام الفارغة'
 WHERE slot_key = 'empty_categories_character' AND label = 'شخصية لا توجد أقسام';

-- ═══ ٤) إثباتات ═══
DO $$
DECLARE
  n INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM visual_slots WHERE slot_key = 'offline_gate_character') THEN
    RAISE EXCEPTION '055: فتحة انقطاع الاتصال لم تُنشأ — تراجعٌ كامل';
  END IF;
  -- لا صفّ يبدأ بمؤقّتةٍ سارية: الهجرة تضيف الإمكانية ولا تضع صوراً.
  SELECT COUNT(*) INTO n FROM visual_slots WHERE temporary_image_url IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION '055: % صورة مؤقّتة ظهرت من العدم — تراجعٌ كامل', n;
  END IF;
  SELECT COUNT(*) - COUNT(DISTINCT slot_key) INTO n FROM visual_slots;
  IF n <> 0 THEN
    RAISE EXCEPTION '055: مفاتيح مكرّرة (%)', n;
  END IF;
END $$;
