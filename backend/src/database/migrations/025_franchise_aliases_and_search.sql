-- 025_franchise_aliases_and_search.sql
-- البحث بالأنمي: العميل يكتب «قاتل الشياطين» فتظهر منتجات Demon Slayer.
--
-- كان البحث يطابق `products.name` وحده. الأنمي بُعد تصنيف قائم منذ الهجرة
-- ٠١٤ (`franchises` + `product_franchises`) لكن لا شيء في مسار البحث كان
-- يقرؤه، فمنتجٌ اسمه «قلادة فضية» ينتمي لـDemon Slayer لا يظهر لمن يبحث
-- عن الأنمي إطلاقاً — البيانات موجودة والوصول إليها مفقود.
--
-- والاسم الواحد لا يكفي: للأنمي اسم إنجليزي وآخر عربي (وأحياناً ياباني
-- منقول)، والعميل العراقي يكتب أيّها اتفق. لذلك مرادفات لا حقل ثانٍ:
-- الأسماء البديلة مفتوحة العدد، يضيفها المسؤول من لوحة التحكم بلا هجرة.

ALTER TABLE franchises
  ADD COLUMN alt_names TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN franchises.alt_names IS
  'أسماء بديلة يطابقها البحث (عربي/إنجليزي/نقحرة). الاسم الأساسي غير مكرر هنا.';

-- نصّ البحث لكل امتياز: الاسم الأساسي + المرادفات في سلسلة واحدة.
-- دالة بدل عمود محسوب لأن `alt_names` مصفوفة، وتسطيحها في الاستعلام مباشرةً
-- يجعل كل استدعاء يعيد كتابة نفس المنطق.
CREATE OR REPLACE FUNCTION franchise_search_text(name TEXT, alt_names TEXT[])
RETURNS TEXT AS $$
  SELECT btrim(name) || ' ' || COALESCE(array_to_string(alt_names, ' '), '');
$$ LANGUAGE sql IMMUTABLE;

CREATE INDEX IF NOT EXISTS idx_franchises_name_trgm
  ON franchises USING GIN (name gin_trgm_ops);

-- الوصل من الامتياز إلى منتجاته هو ما يمشي عليه البحث، والفهرس المعاكس
-- (franchise → product) موجود منذ ٠١٤؛ هذا يكمل الاتجاه الآخر.
CREATE INDEX IF NOT EXISTS idx_product_franchises_product
  ON product_franchises (product_id);

-- مرادفات عربية للامتيازات المعروفة الموجودة أصلاً في القاعدة.
-- تُضاف فقط للصفوف التي لا مرادفات لها بعد، فلا تُمحى إضافات المسؤول عند
-- إعادة تشغيل الهجرات.
UPDATE franchises SET alt_names = ARRAY['قاتل الشياطين', 'Kimetsu no Yaiba']
 WHERE alt_names = '{}' AND name ILIKE '%demon slayer%';
UPDATE franchises SET alt_names = ARRAY['ون بيس', 'قطعة واحدة']
 WHERE alt_names = '{}' AND name ILIKE '%one piece%';
UPDATE franchises SET alt_names = ARRAY['هجوم العمالقة', 'Shingeki no Kyojin']
 WHERE alt_names = '{}' AND name ILIKE '%attack on titan%';
UPDATE franchises SET alt_names = ARRAY['جوجوتسو كايسن', 'حرب السحرة']
 WHERE alt_names = '{}' AND name ILIKE '%jujutsu%';
UPDATE franchises SET alt_names = ARRAY['ناروتو']
 WHERE alt_names = '{}' AND name ILIKE '%naruto%';
