-- يعكس 082_admin_push_device_session.sql.
-- [SECURITY] بعد التراجع تعود أجهزة المسؤول تستقبل بعد انتهاء جلستها (سلوك ما قبل ٠٨٢).
-- لا بيانات تضيع غير مواعيد الجلسات (تُعاد عند التسجيل التالي).
ALTER TABLE admin_push_devices DROP COLUMN IF EXISTS session_expires_at;
DELETE FROM schema_migrations WHERE name = '082_admin_push_device_session.sql';
