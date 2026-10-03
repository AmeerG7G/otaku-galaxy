-- يعكس 072_customer_gender_guard.sql. لا بيانات تُفقد: الزناد حارسٌ فقط.
DROP TRIGGER IF EXISTS trg_users_customer_gender_guard ON users;
DROP FUNCTION IF EXISTS enforce_customer_gender();
DELETE FROM schema_migrations WHERE name = '072_customer_gender_guard.sql';
