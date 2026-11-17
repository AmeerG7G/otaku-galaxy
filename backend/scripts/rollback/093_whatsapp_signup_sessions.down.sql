-- يعكس 093_whatsapp_signup_sessions.sql — يُسقط جلسات التحقق عبر واتساب وحدها.
--
-- [CRITICAL] الحسابات التي فُعِّلت عبر واتساب **تبقى** كما هي: صفوف `users`
-- و`account_requests` كتبها المسار العادي للتسجيل، والمفاتيح الأجنبية تخرج من
-- هذا الجدول لا إليه. ما يضيع بالإسقاط هو أثرُ «فُعِّل عبر واتساب» وحده — صدّره
-- قبل التشغيل إن أردت الاحتفاظ به (deploy/README.md).
-- يُشغَّل بعد 095 و094 (ترتيب العكس): كلاهما يشير إلى هذا الجدول.
BEGIN;
DROP INDEX IF EXISTS idx_wa_signup_phone_created;
DROP INDEX IF EXISTS idx_wa_signup_ip_created;
DROP INDEX IF EXISTS idx_wa_signup_awaiting_ref;
DROP INDEX IF EXISTS idx_wa_signup_request;
DROP INDEX IF EXISTS idx_wa_signup_user;
DROP INDEX IF EXISTS idx_wa_signup_created;
DROP TABLE IF EXISTS whatsapp_signup_sessions;
DELETE FROM schema_migrations WHERE name = '093_whatsapp_signup_sessions.sql';
COMMIT;
