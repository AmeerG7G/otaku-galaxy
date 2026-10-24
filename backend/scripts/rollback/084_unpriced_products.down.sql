-- يعكس 084_unpriced_products.sql.
-- [CRITICAL] يفشل عمداً إن بقي منتجٌ بلا سعر: لا يُختلق له سعر. سعّره من اللوحة
-- أو احذفه أولاً — `SELECT id, name FROM products WHERE price IS NULL;`
-- [CRITICAL] معاملةٌ واحدة: `psql -f` يكمل بعد الخطأ افتراضياً، فكان فشل
-- `SET NOT NULL` يترك القيد محذوفاً وسجلّ الهجرة ممحوّاً — قاعدةٌ «متراجعة» فيها
-- أسعارٌ NULL تقرؤها الشيفرة القديمة صفراً. الآن: الكل أو لا شيء.
-- شغّله: psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/rollback/084_unpriced_products.down.sql
BEGIN;
ALTER TABLE products ALTER COLUMN price SET NOT NULL;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_previous_price_needs_price;
DELETE FROM schema_migrations WHERE name = '084_unpriced_products.sql';
COMMIT;
