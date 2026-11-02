-- يعكس 075_notification_daily_stats.sql. يتطلّب عكس 076 أولاً (حارس الشهر المغلق).
-- [DATA] يُفقد الإحصاء اليومي الدائم — وهو تاريخٌ لا يُستعاد من الصندوق بعد
-- تطهيره. لا تعكس بعد وجود بيانات حقيقية: أعد نشر البناء السابق واترك الجداول.
DROP TABLE IF EXISTS notification_daily_engagement;
DROP TABLE IF EXISTS notification_daily_stats;
DROP FUNCTION IF EXISTS forbid_change_notification_daily_stats();
DELETE FROM schema_migrations WHERE name = '075_notification_daily_stats.sql';
