-- يعكس 085_pair_price.sql.
-- [CRITICAL] يمحو عروض «سعر القطعتين» من المنتجات ولقطاتها في الطلبات. مبالغ
-- الطلبات المحفوظة (`line_total`, `products_total`) تبقى كما هي — ما دفعه الزبون
-- لا يُعاد حسابه — لكن سبب الفرق عن `price × quantity` يُفقد. صدّرها أولاً إن
-- احتجت أثرها: `SELECT id, order_id, pair_price FROM order_items WHERE pair_price IS NOT NULL;`
-- معاملةٌ واحدة (انظر 084.down): الكل أو لا شيء.
BEGIN;
ALTER TABLE order_items DROP COLUMN IF EXISTS pair_price;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_pair_price_offer;
ALTER TABLE products DROP COLUMN IF EXISTS pair_price;
DELETE FROM schema_migrations WHERE name = '085_pair_price.sql';
COMMIT;
