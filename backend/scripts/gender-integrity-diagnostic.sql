-- gender-integrity-diagnostic.sql — للقراءة فقط. لا يغيّر شيئاً.
--
-- عقد المنتج (D5): جنس حساب الزبون إلزامي و∈ {male, female}، ولا حالة ثالثة.
-- هذا السكربت يعدّ الشذوذ (حسابات زبائن بلا جنس) في البيئة الحالية بحسب صنفها،
-- بلا أسماء ولا أرقام هواتف ولا معرّفات. يُشغَّل على كل بيئة قبل ترحيلها
-- (Gate M)، ومرةً أخيرة قبل إصدار القيد المُتحقَّق منه
-- `users_customer_gender_required` (لا يُصدر إلا والصنفان B وC صفر في كل بيئة).
--
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/gender-integrity-diagnostic.sql
--
-- الأصناف:
--   A — زبونٌ بلا جنس أُنشئ بعد تطبيق ٠٤٠ في هذه البيئة: يجب أن يكون صفراً. أي
--       صفٍّ هنا عطلٌ يُحقَّق فيه قبل أي ترحيل.
--   B — طلب تسجيلٍ غير مفعَّل بلا جنس: لا يُحسب زبوناً، ولا يُقبل حتى يُكمَل.
--   C — زبونٌ مفعَّل سبق ٠٤٠ بلا جنس: يُكمَل من مصدره (التطبيق يطلبه عند الدخول،
--       أو المسؤول بعد تحقّق واتساب). حتى ذلك الحين خارج تقسيم الجنس فقط.
--   D — من الصنفين B/C ما عُلِّم حساباً داخلياً/اختبارياً (يُستبعد من التحليلات).
--   E — حسابات المسؤولين بلا جنس: خارج العقد (لا تُنشأ بالتسجيل).

BEGIN READ ONLY;

WITH applied AS (
  SELECT applied_at FROM schema_migrations WHERE name = '040_user_gender.sql'
)
SELECT
  (SELECT applied_at FROM applied)                                       AS migration_040_applied_at,
  COUNT(*) FILTER (WHERE u.role = 'customer' AND u.gender IS NULL
                     AND u.created_at > (SELECT applied_at FROM applied)) AS class_a_post_040_defects,
  COUNT(*) FILTER (WHERE u.role = 'customer' AND u.gender IS NULL
                     AND u.phone_verified_at IS NULL)                     AS class_b_unverified,
  COUNT(*) FILTER (WHERE u.role = 'customer' AND u.gender IS NULL
                     AND u.phone_verified_at IS NOT NULL)                 AS class_c_activated_legacy,
  -- العمود يظهر مع ٠٧٣؛ قبله (التشغيل يسبق الترحيل) يُعدّ صفراً بلا خطأ.
  COUNT(*) FILTER (WHERE u.role = 'customer' AND u.gender IS NULL
                     AND (to_jsonb(u) ->> 'is_internal_account') = 'true') AS class_d_internal,
  COUNT(*) FILTER (WHERE u.role = 'admin' AND u.gender IS NULL)           AS class_e_admins_out_of_scope,
  COUNT(*) FILTER (WHERE u.role = 'customer' AND u.gender IS NULL
                     AND EXISTS (SELECT 1 FROM orders o
                                  WHERE o.user_id = u.id AND o.status = 'COMPLETED')) AS legacy_with_completed_orders,
  MIN(u.created_at) FILTER (WHERE u.role = 'customer' AND u.gender IS NULL) AS legacy_first_created,
  MAX(u.created_at) FILTER (WHERE u.role = 'customer' AND u.gender IS NULL) AS legacy_last_created
FROM users u;

ROLLBACK;
