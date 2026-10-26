-- 054_fixed_single_image_slots.sql
-- موضعٌ واحد = فتحةٌ واحدة = صورةٌ ثابتة واحدة.
--
-- قرار منتج (2026-09-20): شخصيات الواجهة صورٌ ثابتة يبدّلها المسؤول صورةً
-- بصورة. لا تدوير يومي، ولا مجموعة صور، ولا صورة مؤقّتة، ولا إيقافٌ مؤقّت.
-- الفتحة تحمل صورتها في صفّها (`image_url` + `media_id`)، والفتحة بلا
-- صورة تعني «الرسم المضمَّن في التطبيق» — كما كانت الفتحة بلا صور نشطة.
--
-- والفتحة **موضعٌ** لا شخصية: الشخصية نفسها قد تظهر في شاشتين، لكن لكل
-- شاشة فتحتُها المستقلة فلا يغيّر المسؤول واحدةً فتتغيّر الأخرى. الفتحات
-- الأربع التي كانت تخدم أكثر من موضع تُجزَّأ هنا، وتنسخ كلُّ فتحةٍ جديدة
-- صورةَ أصلها فلا يتغيّر بكسلٌ عند الزبون بعد الترقية.
--
-- [CRITICAL] سلامة البيانات — ما يُثبته هذا الملف بنفسه (يرمي فيتراجع كلّه):
--   • كل فتحة كان لها صورةٌ نشطة معروضة تحمل الصورة نفسها بعد النسخ.
--   • كل الفتحات الجديدة موجودة وتحمل صورة أصلها.
--   • لا مفتاح مكرّر ولا فتحة يتيمة.
--   • `media_files` لا تُمَسّ: القيد الوحيد بين `visual_slot_images`
--     و`media_files` هو `ON DELETE SET NULL` من جهة الصور، فإسقاط جدول الصور
--     لا يحذف سجلَّ وسائطٍ ولا ملفاً على القرص (يُثبت بعدّ السجلات قبل/بعد).
-- ما يُفقد عمداً: صفوف الصور **الموقوفة** (بقايا الاستبدالات السابقة) — لم
-- تكن تُعرض عند أحد، وملفاتها وسجلّاتها في `media_files` باقية.

-- ═══ ٠) تجميد العدد المرجعي للوسائط ═══
CREATE TEMP TABLE _m054_media_before AS SELECT COUNT(*)::bigint AS n FROM media_files;

-- ═══ ١) عمودا الصورة الثابتة ═══
ALTER TABLE visual_slots
  ADD COLUMN image_url TEXT
    CHECK (image_url IS NULL OR char_length(btrim(image_url)) > 0),
  ADD COLUMN media_id  UUID REFERENCES media_files(id) ON DELETE SET NULL;

-- ═══ ٢) الصورة المعروضة الآن تصير الصورة الثابتة ═══
-- «المعروضة الآن» في النمط الثابت هي الأولى النشطة بالترتيب (`sort_order`
-- ثم `created_at` — ترتيب `listPublished` حرفياً). فتحةُ تدويرٍ يومي —
-- إن وُجدت — تُثبَّت على أولى صورها بالترتيب نفسه: الاختيار الحتمي الوحيد
-- الذي لا يعتمد على تاريخ تشغيل الهجرة. الفتحة الموقوفة (`is_active = FALSE`)
-- لم تكن تصل التطبيق، فتبقى بلا صورة — ما يراه الزبون لا يتغيّر.
UPDATE visual_slots s
   SET image_url = i.url,
       media_id  = i.media_id
  FROM (SELECT DISTINCT ON (slot_id) slot_id, url, media_id
          FROM visual_slot_images
         WHERE is_active = TRUE
         ORDER BY slot_id, sort_order, created_at) AS i
 WHERE i.slot_id = s.id
   AND s.is_active = TRUE;

DO $$
DECLARE
  missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing
    FROM visual_slots s
   WHERE s.is_active = TRUE
     AND s.image_url IS NULL
     AND EXISTS (SELECT 1 FROM visual_slot_images i
                  WHERE i.slot_id = s.id AND i.is_active = TRUE);
  IF missing > 0 THEN
    RAISE EXCEPTION '054: % فتحة لها صورة نشطة لم تُنسخ — تراجعٌ كامل', missing;
  END IF;
END $$;

-- ═══ ٣) تجزئة الفتحات المشتركة ═══
-- إعادة التسمية تُبقي الصفّ (وصورته ومعرّفه)؛ الفتحة الشقيقة تُدرج نسخةً
-- تحمل الصورة نفسها. الاسم والوصف يُكتبان بلا شرط: معنى الصفّ تغيّر (صار
-- موضعاً واحداً) فوصفه القديم — ولو عدّله المسؤول — لم يعد صحيحاً.

-- ── إنشاء الحساب: الترويسة · شاشة الانتظار بعد الطلب ──
UPDATE visual_slots
   SET slot_key = 'register_header_character',
       label    = 'شخصية إنشاء الحساب — الترويسة',
       location = 'شاشة إنشاء الحساب — الترويسة أعلى النموذج'
 WHERE slot_key = 'register_character';

INSERT INTO visual_slots (slot_key, label, location, group_key, sort_order, image_url, media_id)
SELECT 'register_pending_character',
       'شخصية «بانتظار الموافقة» — إنشاء الحساب',
       'شاشة «بانتظار الموافقة» بعد إرسال طلب إنشاء الحساب',
       'auth', 4, image_url, media_id
  FROM visual_slots WHERE slot_key = 'register_header_character'
ON CONFLICT (slot_key) DO NOTHING;

-- ── استعادة كلمة المرور: الترويسة · شاشة الانتظار بعد الطلب ──
UPDATE visual_slots
   SET slot_key = 'forgot_password_header_character',
       label    = 'شخصية استعادة كلمة المرور — الترويسة',
       location = 'شاشة استعادة كلمة المرور — الترويسة أعلى النموذج'
 WHERE slot_key = 'forgot_password_character';

INSERT INTO visual_slots (slot_key, label, location, group_key, sort_order, image_url, media_id)
SELECT 'forgot_password_pending_character',
       'شخصية «بانتظار الموافقة» — استعادة كلمة المرور',
       'شاشة «بانتظار الموافقة» بعد إرسال طلب استعادة كلمة المرور',
       'auth', 7, image_url, media_id
  FROM visual_slots WHERE slot_key = 'forgot_password_header_character'
ON CONFLICT (slot_key) DO NOTHING;

-- ── رسم زاوية بطاقة النموذج (فوق زر الإجراء): شاشة لكل فتحة ──
UPDATE visual_slots
   SET slot_key = 'login_cta_character',
       label    = 'شخصية زاوية بطاقة تسجيل الدخول',
       location = 'شاشة تسجيل الدخول — زاوية بطاقة النموذج فوق زر الإجراء'
 WHERE slot_key = 'auth_cta_character';

INSERT INTO visual_slots (slot_key, label, location, group_key, sort_order, image_url, media_id)
SELECT 'register_cta_character',
       'شخصية زاوية بطاقة إنشاء الحساب',
       'شاشة إنشاء الحساب — زاوية بطاقة النموذج فوق زر الإجراء',
       'auth', 3, image_url, media_id
  FROM visual_slots WHERE slot_key = 'login_cta_character'
ON CONFLICT (slot_key) DO NOTHING;

INSERT INTO visual_slots (slot_key, label, location, group_key, sort_order, image_url, media_id)
SELECT 'forgot_password_cta_character',
       'شخصية زاوية بطاقة استعادة كلمة المرور',
       'شاشة استعادة كلمة المرور — زاوية بطاقة النموذج فوق زر الإجراء',
       'auth', 6, image_url, media_id
  FROM visual_slots WHERE slot_key = 'login_cta_character'
ON CONFLICT (slot_key) DO NOTHING;

-- ── دعوة الزائر لتسجيل الدخول: السلة · المفضلة (مجموعة التسوّق) ──
UPDATE visual_slots
   SET slot_key  = 'cart_guest_prompt_character',
       label     = 'شخصية دعوة الزائر — السلة',
       location  = 'تبويب السلة — بطاقة دعوة الزائر لتسجيل الدخول',
       group_key = 'shopping'
 WHERE slot_key = 'guest_prompt_character';

INSERT INTO visual_slots (slot_key, label, location, group_key, sort_order, image_url, media_id)
SELECT 'favorites_guest_prompt_character',
       'شخصية دعوة الزائر — المفضلة',
       'تبويب المفضلة — بطاقة دعوة الزائر لتسجيل الدخول',
       'shopping', 4, image_url, media_id
  FROM visual_slots WHERE slot_key = 'cart_guest_prompt_character'
ON CONFLICT (slot_key) DO NOTHING;

-- ترتيب العرض داخل المجموعتين بعد التجزئة — رحلة الزبون لا الأبجدية.
UPDATE visual_slots SET sort_order = v.o
  FROM (VALUES
    ('login_character', 0), ('login_cta_character', 1),
    ('register_header_character', 2), ('register_cta_character', 3), ('register_pending_character', 4),
    ('forgot_password_header_character', 5), ('forgot_password_cta_character', 6), ('forgot_password_pending_character', 7),
    ('empty_cart_character', 0), ('cart_guest_prompt_character', 1), ('cart_checkout_character', 2),
    ('empty_favorites_character', 3), ('favorites_guest_prompt_character', 4),
    ('categories_header_character', 5), ('empty_categories_character', 6),
    ('category_products_header_character', 7), ('empty_category_products_character', 8),
    ('product_detail_character', 9), ('product_detail_reviews_character', 10)
  ) AS v(k, o)
 WHERE visual_slots.slot_key = v.k;

-- ═══ ٤) أوصافٌ كانت تخالف الكود (تدقيق 2026-09-20) ═══
-- `category_products_header_character`: ترويسة شاشة منتجات القسم متدرّجة بلا
-- رسم؛ المستهلك الفعلي هو حالة «القسم بلا منتجات إطلاقاً». وفتحة تبويب
-- المجموعات صارت حالته الفارغة (الخطوة ٤٩)، وفتحة التقييمات هي لوحة «لا
-- تقييمات». النصّ المزروع وحده يُصحَّح — وصفٌ عدّله المسؤول بيده لا يُمسّ.
UPDATE visual_slots
   SET label    = 'شخصية القسم بلا منتجات',
       location = 'شاشة منتجات القسم — حين لا منتجات في القسم كلّه'
 WHERE slot_key = 'category_products_header_character'
   AND location = 'شاشة منتجات القسم — الترويسة';

UPDATE visual_slots
   SET label    = 'شخصية القسم الفرعي الفارغ',
       location = 'شاشة منتجات القسم — حين لا منتجات في القسم الفرعي المختار'
 WHERE slot_key = 'empty_category_products_character'
   AND location = 'شاشة منتجات القسم — حين لا منتجات';

UPDATE visual_slots
   SET label    = 'شخصية «مجموعاتي» الفارغة',
       location = 'المفضلة ← تبويب «مجموعاتي» — حين لا مجموعات بعد'
 WHERE slot_key = 'collections_tab_character'
   AND location = 'تبويب المجموعات — اللوحة';

UPDATE visual_slots
   SET label    = 'شخصية «لا تقييمات بعد»',
       location = 'تفاصيل المنتج ← قسم التقييمات — حين لا تقييمات بعد'
 WHERE slot_key = 'product_reviews_character'
   AND location = 'قسم تقييمات المنتج — اللوحة';

-- ═══ ٥) إثباتات قبل الإسقاط ═══
DO $$
DECLARE
  expected TEXT[] := ARRAY[
    'register_header_character', 'register_pending_character',
    'forgot_password_header_character', 'forgot_password_pending_character',
    'login_cta_character', 'register_cta_character', 'forgot_password_cta_character',
    'cart_guest_prompt_character', 'favorites_guest_prompt_character'];
  retired  TEXT[] := ARRAY[
    'register_character', 'forgot_password_character',
    'auth_cta_character', 'guest_prompt_character'];
  k TEXT;
  n INTEGER;
  src TEXT;
  dst TEXT;
BEGIN
  FOREACH k IN ARRAY expected LOOP
    IF NOT EXISTS (SELECT 1 FROM visual_slots WHERE slot_key = k) THEN
      RAISE EXCEPTION '054: الفتحة % لم تُنشأ — تراجعٌ كامل', k;
    END IF;
  END LOOP;
  FOREACH k IN ARRAY retired LOOP
    IF EXISTS (SELECT 1 FROM visual_slots WHERE slot_key = k) THEN
      RAISE EXCEPTION '054: المفتاح المشترك % ما يزال موجوداً — تراجعٌ كامل', k;
    END IF;
  END LOOP;
  -- كل فتحة شقيقة تحمل صورة أصلها حرفياً (أو لا صورة إن لم يكن للأصل صورة).
  FOR src, dst IN
    SELECT * FROM (VALUES
      ('register_header_character',        'register_pending_character'),
      ('forgot_password_header_character', 'forgot_password_pending_character'),
      ('login_cta_character',              'register_cta_character'),
      ('login_cta_character',              'forgot_password_cta_character'),
      ('cart_guest_prompt_character',      'favorites_guest_prompt_character')
    ) AS pairs(s, d)
  LOOP
    IF (SELECT image_url FROM visual_slots WHERE slot_key = src)
       IS DISTINCT FROM
       (SELECT image_url FROM visual_slots WHERE slot_key = dst) THEN
      RAISE EXCEPTION '054: % لا تحمل صورة % — تراجعٌ كامل', dst, src;
    END IF;
  END LOOP;
  -- لا مفتاح مكرّر (القيد الفريد يحرسه، والعدّ يوثّقه).
  SELECT COUNT(*) - COUNT(DISTINCT slot_key) INTO n FROM visual_slots;
  IF n <> 0 THEN
    RAISE EXCEPTION '054: مفاتيح مكرّرة (%)', n;
  END IF;
END $$;

-- ═══ ٦) إسقاط سلوك التدوير والصور المتعدّدة ═══
ALTER TABLE visual_slots
  DROP COLUMN rotation_mode,
  DROP COLUMN is_active;

-- لا `CASCADE`: لا شيء يعتمد على الجدول سوى قيوده هو، والإسقاط الصريح يفشل
-- بصوتٍ عالٍ لو استجدّ اعتمادٌ لم يُحسب.
DROP TABLE visual_slot_images;

-- ═══ ٧) الوسائط لم تُمَسّ ═══
DO $$
DECLARE
  before_n BIGINT;
  after_n  BIGINT;
  dangling INTEGER;
BEGIN
  SELECT n INTO before_n FROM _m054_media_before;
  SELECT COUNT(*) INTO after_n FROM media_files;
  IF before_n <> after_n THEN
    RAISE EXCEPTION '054: عدد سجلّات الوسائط تغيّر (% ← %) — تراجعٌ كامل', before_n, after_n;
  END IF;
  -- مرجعٌ مرفوع بلا سجلّ وسائط حالةٌ سابقة للهجرة (سجلٌّ حُذف بعد الربط)،
  -- لا شيء صنعته الهجرة: تُعلَن لا تُوقِف — الملف ما يزال يُخدم إن وُجد.
  SELECT COUNT(*) INTO dangling
    FROM visual_slots s
   WHERE s.image_url LIKE '/uploads/%'
     AND NOT EXISTS (SELECT 1 FROM media_files m WHERE m.url = s.image_url);
  IF dangling > 0 THEN
    RAISE NOTICE '054: % صورة ثابتة تشير إلى مرفوعٍ بلا سجلّ وسائط (سابقٌ للهجرة)', dangling;
  END IF;
END $$;

DROP TABLE _m054_media_before;
