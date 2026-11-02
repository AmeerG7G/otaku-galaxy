-- 074_notification_campaigns.sql
-- هوية دائمة للبثّ: الحملة صفٌّ واحد، وإشعاراتها المتعدّدة تشير إليه.
--
-- ═══════════════ القرار (2026-10-03، STEP 67) ═══════════════
--
-- كان البثّ يكتب N صفّاً في `notifications` بلا رابطٍ يجمعها: لا عدّاد
-- «مقبولة لدى FCM / فشلت / تُخطّيت» لكل بثّ، وإعادةُ الضغط بعد انقطاع الردّ
-- تبثّ ثانيةً (CA-7: at-least-once). الآن:
--   • `notification_campaigns` — عنوان، نصّ، وصفُ الجمهور (لا قائمة مستلمين
--     ولا أرقام)، وعدد المستلمين، ومن أنشأها؛ و`idempotency_key` فريد يجعل
--     إعادة الطلب نفسه تعيد الحملة نفسها بلا سجلٍّ ثانٍ؛
--   • `notifications.campaign_id` + `push_outbox.campaign_id` (الزناد ينسخه)؛
--   • `notifications.opened_at` — نقرة إشعار الدفع التي فتحت التطبيق (أول كتابة
--     تفوز). «القراءة داخل التطبيق» هي `read_at` القائمة؛
--   • أعداد الأجهزة على صفّ الصندوق (`devices_*`) بدل «جهاز واحد على الأقل»؛
--   • `rolled_up_at` — الصفّ لُخِّص في الإحصاء اليومي الدائم (٠٧٥) قبل أن يُسمح
--     بحذفه من الصندوق.
--
-- [CRITICAL] المصطلحات: قبولُ FCM للرسالة ليس «وصولاً». لا عمود هنا يدّعي
-- التسليم أو العرض على الجهاز.
--
-- الحملة لا تُحذف: سجلٌّ تاريخي. عدّاداتها المجمَّدة (`frozen_at`) تُكتب مرة
-- واحدة حين تُلخَّص كل صفوفها، ولا تتغيّر بعدها.

CREATE TABLE notification_campaigns (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                   TEXT NOT NULL CHECK (kind IN ('broadcast', 'manual')),
  title                  TEXT NOT NULL,
  body                   TEXT NOT NULL DEFAULT '',
  audience_type          TEXT NOT NULL CHECK (audience_type IN ('all', 'users', 'segment')),
  audience_segment       TEXT,
  audience_window_days   INTEGER CHECK (audience_window_days IS NULL OR audience_window_days > 0),
  -- لـ`users`: كم زبوناً اختير — العدد وحده، لا المعرّفات.
  audience_user_count    INTEGER CHECK (audience_user_count IS NULL OR audience_user_count >= 0),
  recipients             INTEGER NOT NULL CHECK (recipients >= 0),
  created_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key        UUID NOT NULL UNIQUE,
  accepted               INTEGER CHECK (accepted IS NULL OR accepted >= 0),
  failed                 INTEGER CHECK (failed IS NULL OR failed >= 0),
  skipped_not_configured INTEGER CHECK (skipped_not_configured IS NULL OR skipped_not_configured >= 0),
  skipped_pref           INTEGER CHECK (skipped_pref IS NULL OR skipped_pref >= 0),
  skipped_no_devices     INTEGER CHECK (skipped_no_devices IS NULL OR skipped_no_devices >= 0),
  devices_accepted       INTEGER CHECK (devices_accepted IS NULL OR devices_accepted >= 0),
  devices_invalid        INTEGER CHECK (devices_invalid IS NULL OR devices_invalid >= 0),
  devices_transient      INTEGER CHECK (devices_transient IS NULL OR devices_transient >= 0),
  frozen_at              TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_campaigns_segment_pair
    CHECK ((audience_type = 'segment') = (audience_segment IS NOT NULL)),
  CONSTRAINT notification_campaigns_frozen_complete
    CHECK (frozen_at IS NULL OR (accepted IS NOT NULL AND failed IS NOT NULL
           AND skipped_not_configured IS NOT NULL AND skipped_pref IS NOT NULL
           AND skipped_no_devices IS NOT NULL AND devices_accepted IS NOT NULL
           AND devices_invalid IS NOT NULL AND devices_transient IS NOT NULL))
);

CREATE INDEX idx_notification_campaigns_created ON notification_campaigns (created_at DESC, id DESC);

-- سجلٌّ تاريخي: لا حذف، ولا تعديل بعد التجميد.
CREATE FUNCTION guard_notification_campaign() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'notification campaigns are permanent history';
  END IF;
  -- الهوية والمحتوى ثابتان دائماً.
  IF (NEW.kind, NEW.title, NEW.body, NEW.audience_type, NEW.audience_segment,
      NEW.audience_window_days, NEW.audience_user_count, NEW.recipients,
      NEW.idempotency_key, NEW.created_at)
     IS DISTINCT FROM
     (OLD.kind, OLD.title, OLD.body, OLD.audience_type, OLD.audience_segment,
      OLD.audience_window_days, OLD.audience_user_count, OLD.recipients,
      OLD.idempotency_key, OLD.created_at) THEN
    RAISE EXCEPTION 'notification campaign identity is immutable';
  END IF;
  -- المنشئ قد يُفرَّغ وحده (حذف حساب المسؤول: ON DELETE SET NULL)، ولا يُستبدل.
  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL THEN
    RAISE EXCEPTION 'notification campaign creator is immutable';
  END IF;
  -- العدّادات المجمَّدة لا تتغيّر.
  IF OLD.frozen_at IS NOT NULL
     AND (NEW.accepted, NEW.failed, NEW.skipped_not_configured, NEW.skipped_pref,
          NEW.skipped_no_devices, NEW.devices_accepted, NEW.devices_invalid,
          NEW.devices_transient, NEW.frozen_at)
         IS DISTINCT FROM
         (OLD.accepted, OLD.failed, OLD.skipped_not_configured, OLD.skipped_pref,
          OLD.skipped_no_devices, OLD.devices_accepted, OLD.devices_invalid,
          OLD.devices_transient, OLD.frozen_at) THEN
    RAISE EXCEPTION 'notification campaign % is frozen', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notification_campaigns_guard
  BEFORE UPDATE OR DELETE ON notification_campaigns
  FOR EACH ROW EXECUTE FUNCTION guard_notification_campaign();

ALTER TABLE notifications
  ADD COLUMN campaign_id UUID REFERENCES notification_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN opened_at   TIMESTAMPTZ;

CREATE INDEX idx_notifications_campaign ON notifications (campaign_id) WHERE campaign_id IS NOT NULL;
-- التفاعل يُؤرَّخ بيوم حدوثه (قراءة/فتح) لا بيوم الإنشاء.
CREATE INDEX idx_notifications_read_at ON notifications (read_at) WHERE read_at IS NOT NULL;
CREATE INDEX idx_notifications_opened_at ON notifications (opened_at) WHERE opened_at IS NOT NULL;

ALTER TABLE push_outbox
  ADD COLUMN campaign_id       UUID REFERENCES notification_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN devices_accepted  INTEGER NOT NULL DEFAULT 0 CHECK (devices_accepted >= 0),
  ADD COLUMN devices_invalid   INTEGER NOT NULL DEFAULT 0 CHECK (devices_invalid >= 0),
  ADD COLUMN devices_transient INTEGER NOT NULL DEFAULT 0 CHECK (devices_transient >= 0),
  ADD COLUMN rolled_up_at      TIMESTAMPTZ,
  -- لا يُلخَّص صفٌّ لم يُحسم بعد.
  ADD CONSTRAINT push_outbox_rollup_settled CHECK (rolled_up_at IS NULL OR status <> 'pending');

-- ما ينتظر التلخيص: المحسوم غير الملخَّص.
CREATE INDEX idx_push_outbox_unrolled ON push_outbox (created_at) WHERE rolled_up_at IS NULL;

-- الزناد نفسه (٠٧٠) يحمل الآن هوية الحملة إلى الصندوق.
CREATE OR REPLACE FUNCTION enqueue_notification_push() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO push_outbox (audience, user_id, notification_id, campaign_id, title, body, data)
  VALUES (
    'customer', NEW.user_id, NEW.id, NEW.campaign_id, NEW.title, COALESCE(NEW.body, ''),
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
