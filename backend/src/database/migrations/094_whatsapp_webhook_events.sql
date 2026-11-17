-- 094_whatsapp_webhook_events.sql — منع التكرار لأحداث مزوّد واتساب.
--
-- Meta تعيد إرسال الحدث نفسه عند أي ردٍّ غير 200 (حتى سبعة أيام)، وقد تكرّره
-- بلا سبب. المفتاح (المزوّد، معرّف الرسالة `wamid…`) يجعل المعالجة الثانية
-- لا أثر لها. السجلّ تشغيليّ: لا رقم هاتف ولا نصّ رسالة ولا حمولة خام.

CREATE TABLE whatsapp_webhook_events (
  provider     TEXT NOT NULL,
  event_id     TEXT NOT NULL CHECK (char_length(event_id) BETWEEN 1 AND 256),
  event_type   TEXT NOT NULL,
  outcome      TEXT,
  session_id   UUID REFERENCES whatsapp_signup_sessions(id) ON DELETE SET NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

CREATE INDEX idx_wa_webhook_events_received ON whatsapp_webhook_events (received_at);

COMMENT ON TABLE whatsapp_webhook_events IS
  'أحداث واتساب المعالَجة (منع التكرار + أثر تشغيلي). بلا بيانات شخصية. تُحذف بعد ١٤ يوماً.';
