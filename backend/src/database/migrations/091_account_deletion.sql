-- 091_account_deletion.sql — حذف الحساب بطلب صاحبه (STEP 78).
--
-- ═══ لماذا «شاهدٌ» لا `DELETE FROM users` ═══
-- `orders.user_id` مقيَّد بـ`ON DELETE RESTRICT` (006): الطلبات سجلٌّ ماليّ
-- يبقى، فلا يُحذف صفُّ زبونٍ له طلب. والقرار (المالك، 2026-10-31): الطلبات
-- تبقى **كاملةً** كما هي. لذلك يصير صفّ الحساب المحذوف شاهداً بلا بيانات
-- شخصية: الدور `deleted`، الرقم `NULL` (فيُحرَّر للتسجيل من جديد)، الاسم نصٌّ
-- ثابت، لا كلمة مرور صالحة، لا جنس ولا ميلاد ولا صورة.
--
-- الدور الجديد هو الحارس: كل استعلامٍ يقرأ «الزبائن» يرشّح بـ`role = 'customer'`
-- (القوائم، الجماهير، الإحصاءات، أعياد الميلاد…) فيُستبعد الشاهد منها كلها
-- بلا تعديل واحد. وزناد الجنس (072) لا يلزم إلا `customer`.
--
-- رقم الهجرة ٠٩١ لا ٠٨٩: ٠٨٩ و٠٩٠ محجوزان لفرع STEP 77 (fix/rewards-options-dates).

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('customer', 'admin', 'deleted'));

ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- الشاهد وحده بلا رقم، والشاهد وحده يحمل لحظة الحذف — والعكس.
ALTER TABLE users
  ADD CONSTRAINT users_deleted_shape CHECK (
    (role = 'deleted') = (deleted_at IS NOT NULL)
    AND (role = 'deleted') = (phone IS NULL)
  );

-- سجلّ الحذف: المرجع الذي يُعرض لصاحب الطلب، وسببه الاختياري، وما بقي.
-- [PRIVACY] لا رقم ولا اسم هنا — المعرّف وحده يربطه بالشاهد.
CREATE TABLE account_deletions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       TEXT NOT NULL UNIQUE CHECK (reference ~ '^DEL-[0-9A-HJKMNP-TV-Z]{10}$'),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason          TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500),
  retained_orders INTEGER NOT NULL CHECK (retained_orders >= 0),
  deleted_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_account_deletions_user ON account_deletions (user_id);
