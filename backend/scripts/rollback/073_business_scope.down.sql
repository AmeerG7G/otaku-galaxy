-- يعكس 073_business_scope.sql.
-- [DATA] يُفقد تعليم الحسابات الداخلية ولقطات `placed_by_role`. بعد وجود بيانات
-- حقيقية: صدّرها أولاً —
--   \copy (SELECT id FROM users WHERE is_internal_account) TO 'internal_accounts.csv' CSV
--   \copy (SELECT id, placed_by_role FROM orders) TO 'orders_placed_by_role.csv' CSV
-- والأفضل بعد البيانات: أعد نشر البناء السابق واترك الأعمدة (الشيفرة القديمة تتجاهلها).
-- يتطلّب عكس 076 أولاً (العروض تعتمد على هذه الأعمدة).
DROP TRIGGER IF EXISTS trg_orders_placed_by_role ON orders;
DROP FUNCTION IF EXISTS snapshot_order_placed_by_role();
ALTER TABLE orders DROP COLUMN IF EXISTS placed_by_role;
ALTER TABLE users DROP COLUMN IF EXISTS is_internal_account;
DELETE FROM schema_migrations WHERE name = '073_business_scope.sql';
