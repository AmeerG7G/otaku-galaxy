-- 046_bilingual_content_and_user_language.sql
-- الكردية (سوراني) لغةً ثانيةً للمحتوى الذي يراه الزبون، ولغةَ تفضيلٍ للمستخدم.
--
-- ═══════════════ المبدأ ═══════════════
--
-- العمود القائم يبقى **العربية**، وهو المرجع والاحتياط. تُضاف بجانبه نسخة
-- كردية **قابلة للفراغ**. الفراغ ليس نقصاً مخفياً بل حالةٌ معلنة: الواجهة
-- تسقط إلى العربية، ولوحة التحكم تُظهر «الكردية ناقصة» فلا يختفي الخلل خلف
-- الاحتياط. لا عمود عربي يُمسّ، ولا صفٌّ يُنسخ، ولا معرّف ولا سعر ولا مخزون
-- ولا صورة تُكرَّر — اللغة تخصّ النصّ المقروء وحده.
--
-- رمز اللغة `ckb` لا `ku`: الأول هو المعيار (ISO 639-3) للكردية الوسطى
-- (سوراني) وهي لهجة التطبيق كما في `app_strings.dart`، والثاني رمزُ
-- المجموعة اللغوية كلها. والرمز `ckb` مستعمل أصلاً في `AppLanguage` وفي
-- تفضيلات المستخدمين المحفوظة، فتغييره كان سيُلغي اختيار كل من اختار
-- الكردية.
--
-- ═══════════════ ما لم يُترجَم، وسببه ═══════════════
--
-- `collections`   — المجموعات يسمّيها **الزبون** لنفسه (`user_id` إلزامي،
--                   و`UNIQUE(user_id, name)`). ترجمةُ اسمٍ كتبه صاحبه بيده
--                   ليست ترجمة بل تحريف. ليست محتوى إدارة.
-- `franchises`    — أسماء أعمال (Naruto، One Piece): أعلامٌ لا تُترجَم، وهي
--                   مفتاح المطابقة في البحث و`UNIQUE`.
-- `loyalty_levels`— جدولٌ متروك: سلّم المستويات صار ثابتاً في
--                   `domain/galaxyPoints.ts` ولا يُقرأ من القاعدة.
-- `visual_slots.label` — تسمية إدارية داخلية، لا تصل الزبون.
-- `notifications.title/body` — تُولَّد لا تُكتَب؛ تُترجَم بالقوالب لا بعمود.
-- لقطاتٌ لا تُؤلَّف: `order_items.product_name`, `reviews.product_name`,
--                   `points_ledger.label` — تُنسخ وقت الحدث لتجميد التاريخ.

-- ═══════════════ ١ · لغة المستخدم ═══════════════
--
-- بلا هذا العمود لا يعرف الخادم بأي لغة يخاطب الزبون، فكل إشعار يخرج
-- بالعربية مهما اختار المستخدم. الافتراضي `ar` يحفظ سلوك كل حساب قائم.
ALTER TABLE users
  ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'ar'
    CHECK (preferred_language IN ('ar', 'ckb'));

COMMENT ON COLUMN users.preferred_language IS
  'لغة المخاطبة المختارة صراحةً في التطبيق — تحكم الإشعارات والردود المترجَمة.';

-- ═══════════════ ٢ · محتوى الإدارة الذي يراه الزبون ═══════════════

ALTER TABLE products
  ADD COLUMN name_ckb        TEXT
    CHECK (name_ckb IS NULL OR char_length(btrim(name_ckb)) BETWEEN 2 AND 120),
  ADD COLUMN description_ckb TEXT;

ALTER TABLE categories
  ADD COLUMN name_ckb TEXT
    CHECK (name_ckb IS NULL OR char_length(btrim(name_ckb)) > 0);

ALTER TABLE subcategories
  ADD COLUMN name_ckb TEXT
    CHECK (name_ckb IS NULL OR char_length(btrim(name_ckb)) > 0);

-- عنوان البنر وحده نصٌّ يراه الزبون؛ لا عمود وصفٍ ولا زرّ دعوة في الجدول.
ALTER TABLE banners
  ADD COLUMN title_ckb TEXT;

-- أسماء المحافظات والمناطق تختلف فعلاً بالكردية (أربيل ⇄ هەولێر)، وتظهر
-- في الدفع وفي تفاصيل الطلب.
ALTER TABLE governorates
  ADD COLUMN name_ckb TEXT
    CHECK (name_ckb IS NULL OR char_length(btrim(name_ckb)) > 0);

ALTER TABLE governorate_zones
  ADD COLUMN name_ckb TEXT
    CHECK (name_ckb IS NULL OR char_length(btrim(name_ckb)) > 0);

-- خيارات المنتج تظهر للزبون اسماً وقيماً («اللون: أحمر»)، فتحتاج الاثنين.
-- `values_ckb` فارغة `{}` تعني «لا ترجمة» فتسقط إلى `values` كاملةً — لا
-- خلط بين قائمتين بطولين مختلفين.
ALTER TABLE product_options
  ADD COLUMN name_ckb   TEXT
    CHECK (name_ckb IS NULL OR char_length(btrim(name_ckb)) > 0),
  ADD COLUMN values_ckb TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(values_ckb) = 0 OR cardinality(values_ckb) = cardinality(values));

-- ═══════════════ ٣ · فهرس اكتمال الترجمة ═══════════════
--
-- لوحة التحكم تسأل «أي المنتجات بلا كردية؟» عند كل فتح. فهرسٌ جزئي على
-- الناقص وحده أصغر بكثير من فهرس على العمود كلّه، والسؤال لا يقع إلا عليه.
CREATE INDEX idx_products_missing_ckb
  ON products (created_at DESC)
  WHERE name_ckb IS NULL OR btrim(name_ckb) = '';
