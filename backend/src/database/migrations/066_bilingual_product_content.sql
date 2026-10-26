-- 066_bilingual_product_content.sql
-- محتوى المنتج بلغتين منفصلتين: اسمٌ ووصفٌ عربيان، واسمٌ ووصفٌ كرديان.
--
-- ═══════════════ القرار (2026-09-27) ═══════════════
--
-- كل منتج جديد يُنشأ بأربعة حقول مستقلة يكتبها المسؤول بيده: الاسم والوصف
-- بالعربية، والاسم والوصف بالكردية (سوراني). لا ترجمة آلية، ولا نصٌّ واحد
-- يحمل اللغتين.
--
-- ═══════════════ لماذا لا أعمدة `name_ar` جديدة ═══════════════
--
-- الأعمدة موجودة منذ الهجرة 046 بمعنىً معلَن: `name`/`description` هما
-- **العربية**، و`name_ckb`/`description_ckb` هما **الكردية**. نسخُ العربية
-- إلى عمودٍ جديد كان سيخلق مصدرين للنصّ نفسه يتباعدان عند أول تعديل،
-- وإعادةُ تسمية `name` تمسّ كل استعلام ولقطة طلب ودالّة بحث وكل اختبار
-- يُدرج منتجاً — بلا أي سلوك جديد. فتبقى الأعمدة، ويصير معناها موثَّقاً في
-- القاعدة نفسها (أدناه)، وصريحاً في الـAPI (`nameAr`/`descriptionAr`/
-- `nameCkb`/`descriptionCkb`).
--
-- الرمز `ckb` لا `ku`: انظر الهجرة 046 (`APP_LOCALES`، `users.preferred_language`).
--
-- ═══════════════ المنتجات القائمة ═══════════════
--
-- لا يُختلق نصٌّ كردي لأي منتج. ما لم يكتبه المسؤول (أو هجرة 047 للمنتجات
-- المزروعة) يبقى `NULL` — وهو الصورة **الوحيدة** لـ«ناقص»: الفراغ والمسافات
-- تُحوَّل إلى `NULL` هنا ويمنعها قيدٌ بعدها، فلا يلتبس «ناقص» بـ«مكتوبٌ فارغاً».
-- الإلزام بالأربعة يقع على **الإنشاء** في الـAPI لا في قيدٍ على الجدول:
-- قيدٌ يشترط الكردية (ولو `NOT VALID`) يُفحص في كل `UPDATE` للصفّ، فكان قبولُ
-- طلبٍ ينزّل مخزون منتجٍ قديم سيفشل لأن وصفه الكردي ناقص.

-- ═══════════════ ١ · معنى الأعمدة ═══════════════

COMMENT ON COLUMN products.name IS
  'اسم المنتج بالعربية — المرجع، إلزامي. يُعرض للزبون العربي وفي لوحة التحكم.';
COMMENT ON COLUMN products.description IS
  'وصف المنتج بالعربية. إلزاميٌّ للمنتجات الجديدة (الـAPI)؛ قد يكون فارغاً لمنتج قديم.';
COMMENT ON COLUMN products.name_ckb IS
  'اسم المنتج بالكردية (سوراني) كما كتبه المسؤول. NULL = ناقص (منتج قديم)، لا فراغ أبداً.';
COMMENT ON COLUMN products.description_ckb IS
  'وصف المنتج بالكردية (سوراني) كما كتبه المسؤول. NULL = ناقص (منتج قديم)، لا فراغ أبداً.';

-- ═══════════════ ٢ · «ناقص» صورةٌ واحدة: NULL ═══════════════
--
-- `name_ckb` محميٌّ أصلاً (046: بين حرفين و١٢٠ بعد القصّ). `description_ckb`
-- كان بلا قيد، فوصفٌ من مسافات كان سيُعدّ «مكتوباً» ويخرج للزبون سطراً فارغاً.

UPDATE products
   SET description_ckb = NULL
 WHERE description_ckb IS NOT NULL AND btrim(description_ckb) = '';

ALTER TABLE products
  ADD CONSTRAINT products_description_ckb_not_blank
    CHECK (description_ckb IS NULL OR btrim(description_ckb) <> '');

-- سؤال اللوحة «أي المنتجات بلا كردية؟» صار يشمل الوصف. الشرط هنا هو نفسه
-- حرفياً في `productRepo.list({ missingKurdish })` كي يستعمله المخطِّط.
DROP INDEX IF EXISTS idx_products_missing_ckb;
CREATE INDEX idx_products_missing_ckb
  ON products (created_at DESC)
  WHERE name_ckb IS NULL OR description_ckb IS NULL;

-- ═══════════════ ٣ · لقطة الاسم الكردي في الطلب والتقييم ═══════════════
--
-- `order_items.product_name` و`reviews.product_name` لقطتان تُجمَّدان وقت
-- الحدث (046). كانتا عربيتين وحدهما، فيرى الزبون الكردي طلباته عربية. تُضاف
-- اللقطة الكردية بجانبها وتُجمَّد معها وقت الطلب.
--
-- [CRITICAL] لا تعبئة للصفوف القديمة: نسخُ `products.name_ckb` **الحالي**
-- إلى طلبٍ قديم يعني كتابة تاريخٍ لم يحدث (الاسم ربما تغيّر منذ الطلب). NULL
-- هنا يعني «لم تُلتقط كردية وقت الطلب»، فيُعرض الاسم العربي الملتقَط.

ALTER TABLE order_items
  ADD COLUMN product_name_ckb TEXT
    CHECK (product_name_ckb IS NULL OR btrim(product_name_ckb) <> '');

ALTER TABLE reviews
  ADD COLUMN product_name_ckb TEXT
    CHECK (product_name_ckb IS NULL OR btrim(product_name_ckb) <> '');

COMMENT ON COLUMN order_items.product_name IS
  'لقطة اسم المنتج بالعربية وقت الطلب — لا تتغيّر بتعديل المنتج.';
COMMENT ON COLUMN order_items.product_name_ckb IS
  'لقطة اسم المنتج بالكردية وقت الطلب؛ NULL = لم تكن للمنتج كردية حينها (أو طلبٌ أقدم من 066).';

-- ═══════════════ ٤ · البحث بلغة الواجهة ═══════════════
--
-- 064 جمع الاسمين العربي والكردي في مستندٍ واحد، فكلمةٌ عربية في واجهةٍ
-- كردية تطابق منتجاً يُعرض باسمٍ كردي لا يحويها، ولم يكن الوصف يُبحث أصلاً.
-- الآن مستندٌ لكل لغة:
--   العربية  ← الاسم العربي + الوصف العربي.
--   الكردية  ← الاسم الكردي + الوصف الكردي، **وحقلٌ ناقص يحلّ محلّه عربيُّه**
--              — لأنه بالضبط ما تعرضه الواجهة الكردية لذلك المنتج القديم.
--              يُبحث فيما يُرى، فلا يكون منتجٌ ظاهرٌ في القسم مستحيلَ الإيجاد.
-- لا يجتمع عربيٌّ وكرديٌّ للحقل نفسه في مستندٍ واحد أبداً.
-- الطيّ (`search_fold`) هو نفسه من 064.

CREATE OR REPLACE FUNCTION product_search_text_ar(name TEXT, description TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT search_fold(COALESCE(name, '') || E'\n' || COALESCE(description, ''));
$$;

CREATE OR REPLACE FUNCTION product_search_text_ckb(
  name TEXT,
  description TEXT,
  name_ckb TEXT,
  description_ckb TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT search_fold(
    COALESCE(NULLIF(btrim(name_ckb), ''), name, '')
    || E'\n' ||
    COALESCE(NULLIF(btrim(description_ckb), ''), description, '')
  );
$$;

COMMENT ON FUNCTION product_search_text_ar(TEXT, TEXT) IS
  'مستند البحث العربي للمنتج: الاسم + الوصف بالعربية، مطويّين.';
COMMENT ON FUNCTION product_search_text_ckb(TEXT, TEXT, TEXT, TEXT) IS
  'مستند البحث الكردي للمنتج: الاسم + الوصف بالكردية؛ الحقل الناقص يحلّ محلّه العربي المعروض.';

-- trigram على كل مستند — نفس استراتيجية 064 (نمط «يحتوي» لا يخدمه B-tree).
CREATE INDEX IF NOT EXISTS idx_products_search_ar_trgm
  ON products USING GIN (product_search_text_ar(name, description) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_search_ckb_trgm
  ON products USING GIN (
    product_search_text_ckb(name, description, name_ckb, description_ckb) gin_trgm_ops
  );

-- مستند 064 المختلط لم يعد يقرؤه أي استعلام.
DROP INDEX IF EXISTS idx_products_search_trgm;
DROP FUNCTION IF EXISTS product_search_text(TEXT, TEXT);
