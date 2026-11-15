-- 093_whatsapp_signup_sessions.sql — التحقق التلقائي عبر واتساب (WHATSAPP_VERIFY_MODE=auto).
--
-- ═══ ما هذا الجدول ═══
-- جلسة تحقّقٍ واحدة لكل ضغطة «تحقّق عبر واتساب». الزبون يرسل من واتسابه
-- رسالةً تحمل رمزاً، والخادم يطابق **رقم المرسِل** برقم الجلسة. لا حساب يُنشأ
-- ولا كلمة مرور تُخزَّن هنا — الاسم والجنس وكلمة المرور تُرسل بعد التحقق
-- (`complete`) وتُكتب في `users` في المعاملة نفسها التي تفعّل الرقم.
--
-- ═══ ما لا يمسّه ═══
-- لا تعديل على `users` ولا `account_requests` ولا أي جدولٍ قائم. المفاتيح
-- الأجنبية تخرج **من** هذا الجدول فقط، فإسقاطه (scripts/rollback/093_…) لا
-- يمسّ بيانات الحسابات.
--
-- [SECURITY] الرمز والسرّ يُخزَّنان تجزئةً وحدها:
--   code_hash   = HMAC-SHA256(WHATSAPP_TOKEN_PEPPER, الرمز المطبَّع) — للبحث بالرمز.
--   secret_hash = SHA-256(سرّ العميل، ٢٥٦ بت) — يملكه التطبيق/الموقع وحده.
-- `sender_ref` معرّف واتساب الخاص بالعمل (BSUID) — للربط بردّ مشاركة الرقم
-- فقط، ولا يُعتمد هويةً أبداً.

CREATE TABLE whatsapp_signup_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone              TEXT NOT NULL CHECK (phone ~ '^\+9647[5-9][0-9]{8}$'),
  code_hash          BYTEA NOT NULL UNIQUE,
  secret_hash        BYTEA NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'awaiting_contact', 'verified', 'completed', 'dead')),
  dead_reason        TEXT CHECK (dead_reason IN ('mismatch', 'phone_taken', 'attempts', 'blocked')),
  locale             TEXT NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar', 'ckb')),
  provider           TEXT NOT NULL,
  sender_ref         TEXT,
  mismatch_count     SMALLINT NOT NULL DEFAULT 0 CHECK (mismatch_count >= 0),
  complete_attempts  SMALLINT NOT NULL DEFAULT 0 CHECK (complete_attempts >= 0),
  ip_hash            BYTEA,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL,
  contact_deadline   TIMESTAMPTZ,
  verified_at        TIMESTAMPTZ,
  verified_via       TEXT CHECK (verified_via IN ('sender', 'contact_request')),
  completed_at       TIMESTAMPTZ,
  user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  account_request_id UUID REFERENCES account_requests(id) ON DELETE SET NULL,
  -- الحالة وطوابعها وحدةٌ واحدة: لا «متحقَّق» بلا لحظة تحقّق، ولا «مكتمل» بلا لحظة إكمال،
  -- ولا لحظة تحقّق لجلسةٍ ما زالت تنتظر. الميتة قد تكون ماتت قبل التحقق أو بعده.
  CHECK (status NOT IN ('verified', 'completed') OR (verified_at IS NOT NULL AND verified_via IS NOT NULL)),
  CHECK (status NOT IN ('pending', 'awaiting_contact') OR (verified_at IS NULL AND verified_via IS NULL)),
  CHECK ((verified_at IS NULL) = (verified_via IS NULL)),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CHECK ((status = 'dead') = (dead_reason IS NOT NULL)),
  CHECK (status <> 'awaiting_contact' OR (sender_ref IS NOT NULL AND contact_deadline IS NOT NULL))
);

CREATE INDEX idx_wa_signup_phone_created ON whatsapp_signup_sessions (phone, created_at DESC);
CREATE INDEX idx_wa_signup_ip_created ON whatsapp_signup_sessions (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;
CREATE INDEX idx_wa_signup_awaiting_ref ON whatsapp_signup_sessions (sender_ref, created_at DESC)
  WHERE status = 'awaiting_contact';
CREATE INDEX idx_wa_signup_request ON whatsapp_signup_sessions (account_request_id)
  WHERE account_request_id IS NOT NULL;
CREATE INDEX idx_wa_signup_user ON whatsapp_signup_sessions (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_wa_signup_created ON whatsapp_signup_sessions (created_at);

COMMENT ON TABLE whatsapp_signup_sessions IS
  'جلسات التحقق التلقائي عبر واتساب — لا كلمات مرور ولا رموز صريحة. تُحذف بعد ٣٠ يوماً (المكتملة ٩٠).';
