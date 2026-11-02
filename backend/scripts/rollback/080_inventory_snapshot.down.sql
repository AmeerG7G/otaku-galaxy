-- يعكس 080_inventory_snapshot.sql.
-- [DATA] تُفقد لقطات المخزون اليومية — لا تُستعاد (المخزون الحالي ليس تاريخاً).
-- بعد وجود بيانات: \copy inventory_daily_snapshot TO 'inventory.csv' CSV HEADER أولاً.
DROP TABLE IF EXISTS inventory_daily_snapshot;
DROP FUNCTION IF EXISTS forbid_change_inventory_snapshot();
DELETE FROM schema_migrations WHERE name = '080_inventory_snapshot.sql';
