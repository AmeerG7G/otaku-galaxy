-- 050_recompute_product_ratings.sql
--
-- التقييم وعدد التقييمات على المنتج قيمتان مشتقّتان من التقييمات المنشورة
-- (زناد `refresh_product_rating` في 009). وصلت إلى القاعدة قيمٌ ليست كذلك
-- من مصدرين:
--   1. `scripts/seed.ts` كان يزرع كل منتج بـ`rating = 4.5` بلا تقييم واحد —
--      نجومٌ مزيّفة على كتالوج التطوير كله.
--   2. `PATCH /admin/products/:id` كان يقبل `rating`/`reviewCount`، وصفحة
--      التعديل تعيد إرسال ما عرضته، فأي حفظٍ بعد نشر تقييم يعيد القيمة القديمة.
-- كلا المصدرين أُغلق في الشيفرة؛ هذه الهجرة تُعيد الأعمدة إلى الحقيقة
-- المشتقّة مرةً واحدة. آمنة للتكرار: النتيجة دالّة في جدول التقييمات وحده.

UPDATE products p
   SET rating = sub.avg_rating,
       review_count = sub.cnt
  FROM (
    SELECT product_id,
           ROUND(AVG(rating)::numeric, 1) AS avg_rating,
           COUNT(*)::int AS cnt
      FROM reviews
     WHERE status = 'approved' AND product_id IS NOT NULL
     GROUP BY product_id
  ) sub
 WHERE p.id = sub.product_id
   AND (p.rating IS DISTINCT FROM sub.avg_rating OR p.review_count <> sub.cnt);

-- من لا تقييم منشوراً له: لا نجوم ولا عدد.
UPDATE products p
   SET rating = NULL,
       review_count = 0
 WHERE NOT EXISTS (
         SELECT 1 FROM reviews r
          WHERE r.product_id = p.id AND r.status = 'approved'
       )
   AND (p.rating IS NOT NULL OR p.review_count <> 0);
