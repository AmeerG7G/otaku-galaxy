-- 071_analytics_permission.sql
-- قسم صلاحية جديد: «التحليلات» (`analytics`).
--
-- ═══════════════ القرار (2026-10-03، STEP 67، D4) ═══════════════
--
-- صفحة التحليلات تكشف أرقام المتجر التاريخية: الإيراد شهراً بشهر، الزبائن،
-- المحافظات، والأداء التسويقي. هذه أرقامٌ حسّاسة تجارياً، فلها قسمٌ مستقل لا
-- يُمنح ضمناً لمن يملك «الرئيسية». مؤشرات الرئيسية القائمة تبقى تحت قسم
-- `dashboard` كما هي (D4) — هذا القسم للصفحة الجديدة وبياناتها وحدها.
--
-- لا تعبئة: المسؤول الأعلى يملكه ضمناً، والمسؤولون الفرعيون لا يملكونه حتى
-- يمنحه الأعلى صراحةً (الفشل مغلق). القائمة هنا = `ADMIN_SECTIONS` حرفياً،
-- واختبار `admin-permissions` يقارن آخر تعريفٍ لهذا القيد بالقائمتين.

ALTER TABLE users DROP CONSTRAINT users_admin_permissions_known;

ALTER TABLE users
  ADD CONSTRAINT users_admin_permissions_known
    CHECK (admin_permissions <@ ARRAY[
      'dashboard', 'analytics', 'orders', 'delivery', 'products', 'categories', 'franchises',
      'offers', 'restock', 'customers', 'account_requests', 'points', 'birthdays',
      'reviews', 'notifications', 'banners', 'settings', 'admins'
    ]::TEXT[]);
