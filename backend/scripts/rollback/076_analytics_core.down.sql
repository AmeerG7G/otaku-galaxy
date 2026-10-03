-- يعكس 076_analytics_core.sql.
-- [DATA] يُفقد كل ملخّصٍ تاريخي، وحالة إغلاق الأشهر، وسجلّ إعادة البناء. الملخّصات
-- اليومية/الشهرية تُعاد بناؤها من المصادر بـ`analytics:rebuild`، أما ما يعتمد على
-- مصادر مطهَّرة (أيام النشاط بعد ٤٠٠ يوم) فلا يُستعاد. بعد وجود بيانات حقيقية:
-- لا تعكس — أعد نشر البناء السابق واترك الجداول.
DROP INDEX IF EXISTS idx_users_customer_verified;
DROP INDEX IF EXISTS idx_order_status_history_status_created;
DROP INDEX IF EXISTS idx_orders_delivered_at;
DROP TRIGGER IF EXISTS trg_notification_daily_engagement_closed ON notification_daily_engagement;
DROP TABLE IF EXISTS analytics_rebuild_log;
DROP TABLE IF EXISTS analytics_monthly_search_terms;
DROP TABLE IF EXISTS analytics_monthly_governorate;
DROP TABLE IF EXISTS analytics_monthly_orders;
DROP TABLE IF EXISTS analytics_monthly_customers;
DROP TABLE IF EXISTS analytics_daily_activity;
DROP TABLE IF EXISTS analytics_daily_governorate;
DROP TABLE IF EXISTS analytics_daily_category;
DROP TABLE IF EXISTS analytics_daily_product;
DROP TABLE IF EXISTS analytics_daily_sales;
DROP TABLE IF EXISTS analytics_periods;
DROP FUNCTION IF EXISTS forbid_change_analytics_rebuild_log();
DROP FUNCTION IF EXISTS analytics_guard_closed();
DROP FUNCTION IF EXISTS analytics_guard_period();
DROP VIEW IF EXISTS analytics_business_customers;
DROP VIEW IF EXISTS analytics_business_orders;
DROP VIEW IF EXISTS analytics_order_scope;
DELETE FROM schema_migrations WHERE name = '076_analytics_core.sql';
