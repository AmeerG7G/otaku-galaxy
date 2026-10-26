-- 048_account_requests.sql
-- طلبات الحساب التي تديرها الإدارة: إنشاء حساب جديد، وإعادة تعيين كلمة المرور.
--
-- ═══════════════ القرار ═══════════════
--
-- لا رمز SMS ولا رمز بريد. التسجيل ينشئ **طلباً** تراه الإدارة في اللوحة،
-- تتحقّق من صاحبه عبر واتساب يدوياً، ثم توافق فيُفعَّل الحساب — أو ترفض
-- فيبقى الطلب في السجل. ونسيان كلمة المرور ينشئ طلباً كذلك: الإدارة تتحقّق
-- عبر واتساب ثم **تضع كلمة مرور جديدة دائمة** وتبلّغها الزبون. لا كلمة
-- مؤقّتة، لا `must_change_password`، لا شاشة إجبارية بعد الدخول.
--
-- ═══════════════ ما لا يُخزَّن هنا ═══════════════
--
-- كلمة المرور. طلبُ التسجيل لا يحمل شيئاً منها: التجزئة تعيش في
-- `users.password_hash` كما كانت، والحساب غير المفعَّل (`phone_verified_at
-- IS NULL`) هو آلية «الحساب المعلَّق» القائمة أصلاً — بوّابة الدخول ترفضه.
-- وطلبُ إعادة التعيين لا يحمل كلمةً لأن الإدارة هي من تضعها لاحقاً.
--
-- بيانات التعريف المرسَلة (الاسم، الجنس، المستوى) تُحفظ **كما أُرسلت** لا
-- كما هي في الحساب: الغرض أن تقارنها الإدارة بالمخزَّن، فلو حُلَّت مسبقاً
-- ضاع الفرق الذي يكشف المنتحل. تطابقُها **لا** يصادق أحداً ولا يغيّر شيئاً
-- آلياً — هي معلوماتٌ للمسؤول لا مصادقة.
--
-- المرفوض يبقى: السجل مرجعٌ للإدارة («هذا الرقم رُفض مرّتين»)، والحذف يُفقده.

CREATE TABLE account_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                 TEXT NOT NULL CHECK (kind IN ('registration', 'password_reset')),
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected')),
  -- الحساب المرتبط: لطلب التسجيل هو الصفّ المعلَّق نفسه؛ لإعادة التعيين هو
  -- ما وجده الخادم بالرقم إن وُجد — يبقى NULL لرقمٍ لا حساب له، ويبقى الطلب
  -- لتراه الإدارة وترفضه (ردٌّ واحد للزبون في الحالتين — لا تعداد للأرقام).
  user_id              UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_phone      TEXT NOT NULL,
  submitted_username   TEXT NOT NULL CHECK (char_length(submitted_username) BETWEEN 2 AND 40),
  submitted_gender     TEXT CHECK (submitted_gender IS NULL OR submitted_gender IN ('male', 'female')),
  -- مفتاح المستوى الذي يدّعيه الطالب (`beginner`…`legend`) — إعادة التعيين فقط.
  submitted_level_key  TEXT,
  admin_note           TEXT,
  resolved_at          TIMESTAMPTZ,
  resolved_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- المحسوم يحمل وقتاً ومسؤولاً؛ المعلَّق لا يحملهما.
  CHECK ((status = 'pending') = (resolved_at IS NULL))
);

-- طلبٌ معلَّق واحد لكل (نوع، رقم): إعادة الإرسال تستأنف الطلب القائم بدل
-- أن تكدّس نسخاً أمام الإدارة. الفهرس جزئي فلا يمنع تكرار المحسوم في السجل.
CREATE UNIQUE INDEX ux_account_requests_pending
  ON account_requests (kind, submitted_phone)
  WHERE status = 'pending';

-- اللوحة تسأل «المعلَّق أولاً، الأحدث أولاً» عند كل فتح.
CREATE INDEX idx_account_requests_status_created
  ON account_requests (status, created_at DESC);

-- ملفّ الزبون يعرض تاريخ طلباته.
CREATE INDEX idx_account_requests_user
  ON account_requests (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE account_requests IS
  'طلبات إنشاء الحساب وإعادة تعيين كلمة المرور — تُحسم يدوياً من اللوحة بعد تحقّق واتساب. لا تحمل كلمات مرور.';
