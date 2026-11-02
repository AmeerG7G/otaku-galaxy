-- يعكس 088_restock_variant_subscriptions.sql — يُسقط ما أنشأته وحده: الجدول
-- وفهرسيه وقيده (تسقط معه). لا يمسّ `restock_subscriptions` ولا `product_variants`.
-- [CRITICAL] يرفض العمل متى وُجد اشتراكٌ بلون: العكس حينها يمحو طلبات زبائن
-- ينتظرون إشعاراً بصمت. من أراد العكس رغم ذلك يحذف تلك الصفوف عن قصدٍ أولاً.
-- معاملةٌ واحدة: الكل أو لا شيء.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM restock_variant_subscriptions) THEN
    RAISE EXCEPTION '088 rollback refused: colour restock subscriptions exist';
  END IF;
END;
$$;
DROP INDEX IF EXISTS idx_restock_variant_subscriptions_product;
DROP INDEX IF EXISTS idx_restock_variant_subscriptions_variant;
DROP TABLE IF EXISTS restock_variant_subscriptions;
DELETE FROM schema_migrations WHERE name = '088_restock_variant_subscriptions.sql';
COMMIT;
