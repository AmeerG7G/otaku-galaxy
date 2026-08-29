-- 023_media_category_purpose.sql
-- غرض «صورة قسم» في سجل الوسائط.
--
-- كانت لوحة الإدارة ترفع صور الأقسام بالغرض `banner` لأن القيد لم يعرف
-- غرضاً للأقسام. النتيجة صفوف مضلِّلة في `media_files` وملفات تُكتب تحت
-- `uploads/banner/` رغم أنها صور أقسام — يصعب معها التنظيف أو الإحصاء.

ALTER TABLE media_files DROP CONSTRAINT IF EXISTS media_files_purpose_check;
ALTER TABLE media_files
  ADD CONSTRAINT media_files_purpose_check
    CHECK (purpose IN ('product', 'review', 'avatar', 'banner', 'franchise', 'category'));

-- الملفات المرفوعة سابقاً لا تُنقل على القرص: مفتاح التخزين جزء من الرابط
-- المحفوظ في `categories.image_url`، ونقله يكسر صوراً تعمل. تُصحَّح التسمية
-- فقط لما يمكن نسبته للأقسام بيقين.
UPDATE media_files m
   SET purpose = 'category'
 WHERE m.purpose = 'banner'
   AND EXISTS (SELECT 1 FROM categories c WHERE c.image_url = m.url);
