-- يعكس 077_order_item_snapshots.sql.
-- [DATA] تُفقد لقطات القسم والسعر المعلَن — لا تُستعاد من الكتالوج الحالي أبداً.
-- بعد وجود طلباتٍ حقيقية: صدّرها أولاً
--   \copy (SELECT id, category_id, subcategory_id, list_price FROM order_items) TO 'item_snapshots.csv' CSV HEADER
-- والأفضل: أعد نشر البناء السابق واترك الأعمدة.
DROP TRIGGER IF EXISTS trg_order_items_catalog_snapshot ON order_items;
DROP FUNCTION IF EXISTS snapshot_order_item_catalog();
ALTER TABLE order_items
  DROP COLUMN IF EXISTS list_price,
  DROP COLUMN IF EXISTS subcategory_id,
  DROP COLUMN IF EXISTS category_id;
DELETE FROM schema_migrations WHERE name = '077_order_item_snapshots.sql';
