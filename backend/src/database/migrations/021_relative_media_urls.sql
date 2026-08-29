-- 021_relative_media_urls.sql
-- توحيد تمثيل روابط الوسائط: مرجع نسبي بدل رابط مطلق مخبوز وقت الرفع.
--
-- كانت الصور تُخزَّن بالشكل `http://localhost:4000/uploads/...` لأن سائق
-- التخزين كان يلصق `PUBLIC_BASE_URL` بالمفتاح. هذا يعمل على المتصفح وسطح
-- المكتب فقط: على الهاتف `localhost` هو الهاتف نفسه، فكل صورة يرفعها
-- المسؤول تفشل في التطبيق — وهو بالضبط عرض «الصور لا تظهر في فلاتر».
--
-- بعد هذه الهجرة يبقى في القاعدة مرجع نسبي واحد، ويحوّله كل عميل إلى مطلق
-- مقابل الأصل الذي يعرفه. الروابط الخارجية الكاملة (بذور placehold.co مثلاً)
-- لا تُمَس: الشرط يطابق مسار /uploads/ فقط.

-- يقصّ أي أصل http(s) يسبق `/uploads/`، مهما كان المضيف أو المنفذ، فتشمل
-- المعالجة قواعد بيانات ضُبط فيها PUBLIC_BASE_URL على عنوان شبكة محلية.
CREATE OR REPLACE FUNCTION media_ref_to_relative(raw TEXT) RETURNS TEXT AS $$
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN RETURN raw; END IF;
  RETURN regexp_replace(btrim(raw), '^https?://[^/]+(/uploads/)', '\1');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

UPDATE media_files    SET url       = media_ref_to_relative(url)       WHERE url LIKE 'http%/uploads/%';
UPDATE product_images SET url       = media_ref_to_relative(url)       WHERE url LIKE 'http%/uploads/%';
UPDATE categories     SET image_url = media_ref_to_relative(image_url) WHERE image_url LIKE 'http%/uploads/%';
UPDATE banners        SET image_url = media_ref_to_relative(image_url) WHERE image_url LIKE 'http%/uploads/%';
UPDATE franchises     SET image_url = media_ref_to_relative(image_url) WHERE image_url LIKE 'http%/uploads/%';
UPDATE users          SET avatar_url = media_ref_to_relative(avatar_url) WHERE avatar_url LIKE 'http%/uploads/%';
UPDATE reviews        SET photo_url = media_ref_to_relative(photo_url) WHERE photo_url LIKE 'http%/uploads/%';
UPDATE order_items    SET image_url = media_ref_to_relative(image_url) WHERE image_url LIKE 'http%/uploads/%';
