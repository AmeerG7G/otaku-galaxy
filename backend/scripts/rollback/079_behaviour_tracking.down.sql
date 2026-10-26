-- يعكس 079_behaviour_tracking.sql.
-- [DATA] تُفقد العدّادات اليومية وحِقب التتبّع. بعد وجود بيانات: صدّرها أولاً
-- (\copy product_daily_counters TO 'counters.csv' CSV HEADER)،
-- والأفضل: أطفئ التتبّع (ANALYTICS_TRACKING_ENABLED=false) واترك الجداول.
DROP TABLE IF EXISTS analytics_tracking_epochs;
DROP TABLE IF EXISTS user_daily_activity;
DROP TABLE IF EXISTS search_daily_terms;
DROP TABLE IF EXISTS product_daily_counters;
DELETE FROM schema_migrations WHERE name = '079_behaviour_tracking.sql';
