-- يعكس 084_unpriced_products.sql.
-- [CRITICAL] يفشل عمداً إن بقي منتجٌ بلا سعر: لا يُختلق له سعر. سعّره من اللوحة
-- أو احذفه أولاً — `SELECT id, name FROM products WHERE price IS NULL;`
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_previous_price_needs_price;
ALTER TABLE products ALTER COLUMN price SET NOT NULL;
DELETE FROM schema_migrations WHERE name = '084_unpriced_products.sql';
