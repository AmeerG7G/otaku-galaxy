-- يعكس 078_purchase_costs.sql.
-- [DATA] يُفقد سجلّ تكاليف الشراء الذي أدخله المالك ولقطات تكلفة البنود — وهي لا
-- تُستعاد. بعد وجود بيانات حقيقية: صدّرها أولاً
--   \copy product_cost_entries TO 'product_cost_entries.csv' CSV HEADER
--   \copy (SELECT id, unit_cost, cost_entry_id, cost_captured_at FROM order_items WHERE cost_entry_id IS NOT NULL) TO 'item_costs.csv' CSV HEADER
-- والأفضل: أعد نشر البناء السابق واترك الجداول.
DROP TRIGGER IF EXISTS trg_order_items_cost_snapshot ON order_items;
DROP FUNCTION IF EXISTS guard_order_item_cost_snapshot();
DROP INDEX IF EXISTS idx_order_items_cost_entry;
ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_cost_snapshot_complete,
  DROP COLUMN IF EXISTS cost_captured_at,
  DROP COLUMN IF EXISTS cost_entry_id,
  DROP COLUMN IF EXISTS unit_cost;
DROP TABLE IF EXISTS product_cost_entries;
DROP FUNCTION IF EXISTS guard_product_cost_entry();
DELETE FROM schema_migrations WHERE name = '078_purchase_costs.sql';
