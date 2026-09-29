-- 068_admin_hierarchy_and_audit.sql
-- مسؤولٌ أعلى ومسؤولون فرعيون بصلاحياتٍ لكل قسم، وسجلّ نشاطٍ للإدارة.
--
-- ═══════════════ القرار (2026-09-29، STEP 64) ═══════════════
--
-- كان في النظام دورٌ واحد `admin` يفتح كل شيء. المالك يريد:
--   • مسؤولاً أعلى يملك كل شيء، ويُنشئ مسؤولين فرعيين ويحدّد صلاحياتهم.
--   • كل قسمٍ من أقسام اللوحة صلاحيةً مستقلة تُفرض على الخادم.
--   • سجلاً يرى فيه المسؤول الأعلى ما غيّره الفرعيون.
--
-- ═══════════════ الأعمدة ═══════════════
--
-- المسؤول يبقى صفاً في `users` (`role = 'admin'`) — لا جدول ثانٍ للهوية:
-- تسجيل الدخول، ونسخة التوكن، والإيقاف كلها قائمة وتعمل للمسؤول الفرعي
-- كما تعمل لغيره. الجديد ثلاثة أعمدة:
--   is_super_admin     — المسؤول الأعلى. افتراضيّه FALSE: أي صفٍّ مسؤولٍ
--                         يُدرج لاحقاً بلا قرارٍ صريح لا يملك شيئاً (يفشل
--                         مغلقاً). لا مسار API يضبطه — هذه الهجرة وسكربت
--                         `seedAdmin` وحدهما.
--   admin_permissions  — أقسام المسؤول الفرعي، محصورة بقيدٍ بقائمة
--                         `domain/adminPermissions.ts` حرفياً.
--   admin_created_by   — من أنشأه (للعرض والتدقيق).
--
-- ═══════════════ المسؤولون القائمون ═══════════════
--
-- كل من هو `admin` اليوم يملك اللوحة كلها. يصير مسؤولاً أعلى هنا حتى لا
-- يفقد أحدٌ وصولاً بالنشر: السلوك القائم محفوظ حرفياً، والتقسيم يبدأ بأول
-- مسؤولٍ فرعي يُنشأ من اللوحة.

ALTER TABLE users
  ADD COLUMN is_super_admin    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN admin_permissions TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN admin_created_by  UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE users SET is_super_admin = TRUE WHERE role = 'admin';

ALTER TABLE users
  -- المسؤول الأعلى مسؤولٌ أولاً: تنزيل دوره إلى زبون دون سحب الصفة يفشل.
  ADD CONSTRAINT users_super_admin_is_admin
    CHECK (NOT is_super_admin OR role = 'admin'),
  -- صلاحياتٌ معروفة فقط. القائمة = ADMIN_SECTIONS، ويقارنهما اختبار.
  ADD CONSTRAINT users_admin_permissions_known
    CHECK (admin_permissions <@ ARRAY[
      'dashboard', 'orders', 'delivery', 'products', 'categories', 'franchises',
      'offers', 'restock', 'customers', 'account_requests', 'points', 'birthdays',
      'reviews', 'notifications', 'banners', 'settings', 'admins'
    ]::TEXT[]),
  -- الزبون لا يحمل صلاحيات إدارية، ولو كتبها أحدٌ مباشرةً في القاعدة.
  ADD CONSTRAINT users_admin_permissions_admin_only
    CHECK (role = 'admin' OR cardinality(admin_permissions) = 0),
  -- المسؤول الأعلى يملك كل شيء ضمناً؛ قائمةٌ بجانبه توحي بحدٍّ لا وجود له.
  ADD CONSTRAINT users_super_admin_no_list
    CHECK (NOT is_super_admin OR cardinality(admin_permissions) = 0);

-- ═══════════════ سجلّ نشاط الإدارة ═══════════════
--
-- صفٌّ لكل فعلٍ إداري ناجح يغيّر شيئاً. `actor_name` لقطةٌ وقت الفعل: حذفُ
-- المسؤول لاحقاً يُفرغ `actor_id` (SET NULL) ولا يمحو من فعل ماذا.
--
-- [SECURITY] `details` لا يحمل كلمة مرور ولا توكناً ولا تجزئةً أبداً. الكاتب
-- الوحيد `adminAuditRepo` يُسقط أي مفتاحٍ يشبهها قبل الكتابة، والاختبار
-- يبحث عن كلمة المرور المرسَلة حرفياً في كل صفوف السجلّ.
CREATE TABLE admin_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name  TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (char_length(action) BETWEEN 1 AND 160),
  target_type TEXT,
  target_id   TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_audit_log_created ON admin_audit_log (created_at DESC, id DESC);
CREATE INDEX idx_admin_audit_log_actor ON admin_audit_log (actor_id, created_at DESC, id DESC);
