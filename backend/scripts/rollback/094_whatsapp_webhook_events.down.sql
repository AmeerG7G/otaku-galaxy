-- يعكس 094_whatsapp_webhook_events.sql — يُسقط سجلّ منع التكرار وحده.
-- بلا بيانات شخصية فيه؛ لا شيء خارجه يعتمد عليه.
BEGIN;
DROP INDEX IF EXISTS idx_wa_webhook_events_received;
DROP TABLE IF EXISTS whatsapp_webhook_events;
DELETE FROM schema_migrations WHERE name = '094_whatsapp_webhook_events.sql';
COMMIT;
