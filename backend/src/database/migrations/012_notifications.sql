-- 012_notifications.sql
-- إشعارات المتجر لكل عميل. الأنواع تطابق NotificationType في تطبيق فلاتر.
-- ملاحظة مقصودة: لا إشعارات لنقاط المجرّة ولا لعيد الميلاد.

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN (
               'orderAccepted', 'orderRejected', 'deliveryUpdate', 'receiptReminder',
               'reviewApproved', 'reviewRejected', 'backInStock', 'promotion'
             )),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  -- ربط اختياري بالكيان المعني (طلب/تقييم/منتج) لفتحه من الإشعار لاحقاً.
  order_id   UUID REFERENCES orders(id) ON DELETE CASCADE,
  review_id  UUID REFERENCES reviews(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread
  ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
