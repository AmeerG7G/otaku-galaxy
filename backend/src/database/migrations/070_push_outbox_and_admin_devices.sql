-- 070_push_outbox_and_admin_devices.sql
-- صندوق صادر للإشعارات الفورية، وأجهزة المسؤولين، وتفضيلات إشعاراتهم.
--
-- ═══════════════ القرار (2026-09-29، STEP 64) ═══════════════
--
-- كان الدفع يحدث داخل الطلب نفسه، ولإشعارات المسؤول اليدوية وحدها: قبولُ
-- طلب، أو عودةُ منتج، أو اعتمادُ تقييم كانت تكتب سجلاً داخل التطبيق ولا تصل
-- الهاتف أبداً. والبثّ لآلاف الزبائن كان ينتظر FCM جهازاً جهازاً قبل الردّ.
--
-- ═══════════════ صندوق صادر (outbox) ═══════════════
--
-- كل إشعارٍ داخل التطبيق يُدرج — من أي موضع في الشيفرة، الآن أو لاحقاً —
-- يضيف صفاً هنا **في المعاملة نفسها** عبر الزناد أدناه: لا إشعار يُلتزم بلا
-- دفعه، ولا دفع لإشعارٍ تراجعت معاملته. مهمّة `pushOutboxJob` ترسل الصفوف
-- المستحقّة خارج الطلبات، تعيد المحاولة بتباعد، وتعطّل الرموز الميتة.
--
-- تفضيلات الزبون تُقرأ **وقت الإرسال** لا وقت الإدراج: من أطفأ العروض بعد
-- إنشاء البثّ وقبل خروجه لا يصله.
--
-- ═══════════════ فصل الزبون عن المسؤول ═══════════════
--
-- أجهزة المسؤولين في جدولٍ مستقل (`admin_push_devices`) لا في
-- `device_tokens`: دفعُ الزبون يقرأ `device_tokens` وحده، ودفعُ المسؤول يقرأ
-- هذا وحده. لا استعلام يخلط الجدولين، فلا يصل حدثٌ إداري هاتفَ زبون.

CREATE TABLE push_outbox (
  id              BIGSERIAL PRIMARY KEY,
  audience        TEXT NOT NULL CHECK (audience IN ('customer', 'admin')),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- إشعار الزبون الذي ولّد الصفّ؛ حذفُه (أو حذفُ طلبه) يسحب الدفع المعلَّق.
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  -- حدث المسؤول (`new_order`…) — للتفضيلات والتقارير.
  event_key       TEXT,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  data            JSONB NOT NULL DEFAULT '{}'::JSONB,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error      TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  CONSTRAINT push_outbox_customer_has_notification
    CHECK ((audience = 'customer') = (notification_id IS NOT NULL)),
  CONSTRAINT push_outbox_admin_has_event
    CHECK (audience = 'customer' OR event_key IS NOT NULL)
);

-- ما تلتقطه المهمّة: المعلَّق المستحقّ بترتيب وصوله.
CREATE INDEX idx_push_outbox_due ON push_outbox (next_attempt_at, id) WHERE status = 'pending';
-- تنظيف المحسوم القديم.
CREATE INDEX idx_push_outbox_done ON push_outbox (created_at) WHERE status <> 'pending';

CREATE FUNCTION enqueue_notification_push() RETURNS TRIGGER AS $$
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

CREATE TRIGGER trg_notifications_enqueue_push
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION enqueue_notification_push();

-- ═══════════════ أجهزة المسؤولين ═══════════════

CREATE TABLE admin_push_devices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE CHECK (char_length(token) BETWEEN 8 AND 4096),
  platform     TEXT NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_push_devices_user ON admin_push_devices (user_id) WHERE is_active;

CREATE TRIGGER trg_admin_push_devices_updated_at
  BEFORE UPDATE ON admin_push_devices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════ تفضيلات إشعارات المسؤول ═══════════════
--
-- صفٌّ لما غيّره المسؤول فقط؛ الغياب = مفعَّل. الحدث يصل من يملك قسمه
-- (أو الأعلى) ولم يُطفئه هنا.
CREATE TABLE admin_notification_prefs (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL CHECK (key IN ('new_order', 'account_request', 'restock_request')),
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TRIGGER trg_admin_notification_prefs_updated_at
  BEFORE UPDATE ON admin_notification_prefs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
