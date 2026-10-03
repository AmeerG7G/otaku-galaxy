-- يعكس 074_notification_campaigns.sql. يتطلّب عكس 075 أولاً.
-- [DATA] يُفقد سجلّ الحملات و`opened_at` وأعداد الأجهزة. بعد وجود بيانات حقيقية:
-- صدّرها أولاً (\copy notification_campaigns TO 'campaigns.csv' CSV HEADER)،
-- والأفضل: أعد نشر البناء السابق واترك الجداول.
CREATE OR REPLACE FUNCTION enqueue_notification_push() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO push_outbox (audience, user_id, notification_id, title, body, data)
  VALUES (
    'customer', NEW.user_id, NEW.id, NEW.title, COALESCE(NEW.body, ''),
    jsonb_strip_nulls(jsonb_build_object(
      'type',           NEW.type,
      'notificationId', NEW.id::TEXT,
      'orderId',        NEW.order_id::TEXT,
      'productId',      NEW.product_id::TEXT,
      'reviewId',       NEW.review_id::TEXT
    ))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP INDEX IF EXISTS idx_push_outbox_unrolled;
ALTER TABLE push_outbox
  DROP CONSTRAINT IF EXISTS push_outbox_rollup_settled,
  DROP COLUMN IF EXISTS rolled_up_at,
  DROP COLUMN IF EXISTS devices_transient,
  DROP COLUMN IF EXISTS devices_invalid,
  DROP COLUMN IF EXISTS devices_accepted,
  DROP COLUMN IF EXISTS campaign_id;
DROP INDEX IF EXISTS idx_notifications_opened_at;
DROP INDEX IF EXISTS idx_notifications_read_at;
DROP INDEX IF EXISTS idx_notifications_campaign;
ALTER TABLE notifications DROP COLUMN IF EXISTS opened_at, DROP COLUMN IF EXISTS campaign_id;
DROP TABLE IF EXISTS notification_campaigns;
DROP FUNCTION IF EXISTS guard_notification_campaign();
DELETE FROM schema_migrations WHERE name = '074_notification_campaigns.sql';
