-- 035_banner_ordering.sql
-- ترقيم البنرات بلا تكرار داخل الموضع الواحد.
--
-- الترتيب سلوك الظهور: 0 = البنر الأساسي. الهجرة ٠٣٠ جعلت sort_order قابلاً
-- للتحرير لكنه ليس فريداً، فيبقى باب التكرار مفتوحاً. هنا تُنضَّط البنرات
-- النشطة ترتيباً حتمياً (الترتيب ثم الأقدم إنشاءً) وتُسنَد أرقام متتابعة، ثم
-- يُغلَق فهرس فريد جزئي الباب أمام أي تكرار مستقبلي — خطأ منطق إعادة الترتيب
-- يتحول إلى خطأ صريح لا إلى سلوك غامض.

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY placement ORDER BY sort_order, created_at
         ) - 1 AS new_order
  FROM banners
  WHERE is_active = TRUE
)
UPDATE banners b
SET sort_order = r.new_order
FROM ranked r
WHERE b.id = r.id;

CREATE UNIQUE INDEX uq_banners_placement_order
  ON banners (placement, sort_order) WHERE is_active = TRUE;