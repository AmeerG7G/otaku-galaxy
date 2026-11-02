-- 030_banner_placement.sql
-- البنرات تعرف أين تظهر في الرئيسية.
--
-- كانت الرئيسية تعرض ثلاث كتل بصرية بثلاثة مصادر مختلفة: لوحة البطل
-- مخبوزة في الكود، وشريط البطاقتين الترويجيتين مخبوزاً أيضاً، وشريطُ بنرات
-- من الخادم أسفلهما. النتيجة أن المسؤول يملك أضعفها ولا يملك أبرزها —
-- يرفع بنراً فيظهر في الشريط الثالث، بينما اللوحة الكبيرة التي تملأ أعلى
-- الشاشة لا سبيل له إليها إلا بإصدار تطبيق.
--
-- بعد هذه الهجرة مصدر واحد: جدول البنرات، ولكل بنر موضعه.
--   hero  — اللوحة الكبيرة أعلى الرئيسية (واحدة تُعرض: الأولى ترتيباً).
--   promo — الشريط الأفقي تحتها (عدد مفتوح، يُعاد ترتيبه).
-- والشريط الثالث حُذف من الواجهة، فلم يعد هناك موضع بلا صاحب.

ALTER TABLE banners
  ADD COLUMN placement TEXT NOT NULL DEFAULT 'promo'
    CHECK (placement IN ('hero', 'promo')),
  -- سطر ثانٍ تحت العنوان — تعرضه لوحة البطل والبطاقة الترويجية.
  ADD COLUMN subtitle TEXT NOT NULL DEFAULT '';

-- الوجهة تقبل الأنمي أيضاً: بُعد التصنيف صار قائماً منذ الهجرة ٠١٤، ولم
-- يكن للبنر سبيل إلى الإشارة إليه.
ALTER TABLE banners DROP CONSTRAINT IF EXISTS banners_destination_type_check;
ALTER TABLE banners
  ADD CONSTRAINT banners_destination_type_check
    CHECK (destination_type IN ('product', 'category', 'subcategory', 'anime', 'none'));

-- فهرس لكل موضع: الرئيسية تسأل عن موضع بعينه لا عن كل البنرات.
DROP INDEX IF EXISTS idx_banners_active;
CREATE INDEX idx_banners_placement
  ON banners (placement, sort_order) WHERE is_active = TRUE;

-- البنرات القائمة كانت تُعرض في الشريط الثالث المحذوف. تُنقل إلى الشريط
-- الترويجي بدل أن تختفي: المسؤول رفعها ليراها الزبون، وحذف موضعها لا يعني
-- حذف عمله.
UPDATE banners SET placement = 'promo' WHERE placement IS NULL;
