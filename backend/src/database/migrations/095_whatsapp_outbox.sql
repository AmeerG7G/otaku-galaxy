-- 095_whatsapp_outbox.sql — ردود واتساب الصادرة (طلب مشاركة الرقم، تأكيد الإنشاء).
--
-- معالجة الويبهوك لا تستدعي Meta داخل الطلب: تكتب صفّاً هنا وتردّ 200 فوراً،
-- ومهمّةٌ دورية (`jobs/whatsappOutboxJob.ts`) ترسل وتعيد المحاولة. ردٌّ واحد
-- من كل نوع لكل جلسة (`UNIQUE (session_id, kind)`) — لا إغراق لرقم أحد.
-- المستلِم يُقرأ من الجلسة عند الإرسال، فلا رقم ولا معرّف مكرَّر هنا.

CREATE TABLE whatsapp_outbox (
  id                  BIGSERIAL PRIMARY KEY,
  session_id          UUID NOT NULL REFERENCES whatsapp_signup_sessions(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN ('contact_request', 'confirmation')),
  status              TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  attempts            SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_message_id TEXT,
  last_error_code     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at             TIMESTAMPTZ,
  UNIQUE (session_id, kind)
);

CREATE INDEX idx_wa_outbox_due ON whatsapp_outbox (next_attempt_at) WHERE status = 'queued';

COMMENT ON TABLE whatsapp_outbox IS
  'ردود واتساب الصادرة للتحقق التلقائي — تُرسلها مهمّة دورية. تُحذف مع جلستها.';
