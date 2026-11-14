-- يعكس 095_whatsapp_outbox.sql — يُسقط صندوق ردود واتساب وحده.
-- لا يمسّ `users` ولا `account_requests`: الصفوف هنا ردودٌ تشغيلية لا بيانات حساب.
BEGIN;
DROP INDEX IF EXISTS idx_wa_outbox_due;
DROP TABLE IF EXISTS whatsapp_outbox;
DELETE FROM schema_migrations WHERE name = '095_whatsapp_outbox.sql';
COMMIT;
