-- يعكس 087_product_variants.sql.
-- [CRITICAL] يرفض العمل متى وُجد لونٌ واحد أو بندُ طلبٍ بلون: العكس حينها يمحو
-- مخزون كل لون ولقطات الألوان في الطلبات، ولا يعرف أي مخزونٍ يُعيده إلى المنتج.
-- قبل أول لون يعيد المخطّط كما كان بلا فقدان شيء. معاملةٌ واحدة: الكل أو لا شيء.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM product_variants)
     OR EXISTS (SELECT 1 FROM order_items WHERE variant_id IS NOT NULL) THEN
    RAISE EXCEPTION '087 rollback refused: colour variants or coloured order items exist';
  END IF;
END;
$$;
DROP INDEX IF EXISTS idx_order_items_variant;
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_variant_snapshot;
ALTER TABLE order_items
  DROP COLUMN IF EXISTS variant_color_hex,
  DROP COLUMN IF EXISTS variant_color_name_ckb,
  DROP COLUMN IF EXISTS variant_color_name,
  DROP COLUMN IF EXISTS variant_id;
ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_cart_product_variant_option_key;
ALTER TABLE cart_items DROP COLUMN IF EXISTS variant_id;
ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_cart_product_option_key
    UNIQUE NULLS NOT DISTINCT (cart_id, product_id, option_value);
DROP TRIGGER IF EXISTS trg_products_variant_stock_guard ON products;
DROP FUNCTION IF EXISTS guard_variant_product_stock();
DROP TABLE IF EXISTS product_variants;
DROP FUNCTION IF EXISTS sync_product_stock_from_variants();
DROP FUNCTION IF EXISTS touch_product_variant();
DELETE FROM schema_migrations WHERE name = '087_product_variants.sql';
COMMIT;
