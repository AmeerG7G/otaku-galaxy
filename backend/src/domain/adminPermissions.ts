/**
 * أقسام لوحة التحكم كصلاحيات مستقلة — المصدر الوحيد على الخادم.
 *
 * [SECURITY] الصلاحية تُفرض على الخادم مساراً مساراً (`requirePermission` في
 * `routes/admin.ts`)، لا بإخفاء بنود القائمة. اللوحة تقرأ القائمة نفسها من
 * `GET /admin/me` لتبني قائمتها، وإخفاءُ بندٍ هناك راحةٌ للمستخدم لا حاجز.
 *
 * القيم مخزَّنة في `users.admin_permissions` ومحصورة بقيد `CHECK` في الهجرة
 * ٠٦٨ بالقائمة نفسها حرفياً. إضافة قسمٍ جديد تعني: هنا، ثم هجرةٌ توسّع القيد،
 * ثم `admin/src/types/adminPermissions.ts` — واختبار `admin-permissions`
 * يقارن الثلاثة ويسقط إن اختلفت.
 *
 * المسؤول الأعلى (`is_super_admin`) لا يحمل قائمة: يملك كل شيء ضمناً، ولا
 * مسار يجعل أحداً مسؤولاً أعلى — الهجرة وحدها فعلت ذلك لمن كان مسؤولاً قبلها،
 * ثم `scripts/seedAdmin.ts` لأول مسؤول في بيئةٍ جديدة.
 */
export const ADMIN_SECTIONS = [
  'dashboard',
  'orders',
  'delivery',
  'products',
  'categories',
  'franchises',
  'offers',
  'restock',
  'customers',
  'account_requests',
  'points',
  'birthdays',
  'reviews',
  'notifications',
  'banners',
  'settings',
  'admins',
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

/** أسماء الأقسام كما تظهر في قائمة اللوحة — لرسائل الرفض وسجلّ النشاط. */
export const ADMIN_SECTION_LABELS: Record<AdminSection, string> = {
  dashboard: 'الرئيسية',
  orders: 'الطلبات',
  delivery: 'المحافظات والتوصيل',
  products: 'المنتجات',
  categories: 'الأقسام',
  franchises: 'الأنمي',
  offers: 'العروض',
  restock: 'طلبات التوفر',
  customers: 'الزبائن',
  account_requests: 'طلبات الحساب',
  points: 'نقاط المجرّة',
  birthdays: 'أعياد الميلاد',
  reviews: 'التقييمات',
  notifications: 'الإشعارات',
  banners: 'البنرات',
  settings: 'إعدادات المتجر',
  admins: 'المسؤولون',
};

export function isAdminSection(value: unknown): value is AdminSection {
  return typeof value === 'string' && (ADMIN_SECTIONS as readonly string[]).includes(value);
}

/**
 * القائمة كما تُخزَّن: بلا تكرار، بلا مجهول، بترتيب الأقسام الثابت.
 *
 * الترتيب الثابت يجعل مقارنة «قبل/بعد» في سجلّ النشاط مقارنةَ مجموعات لا
 * ترتيب، ويجعل الردّ حتمياً في الاختبارات.
 */
export function normalizePermissions(values: readonly unknown[]): AdminSection[] {
  const wanted = new Set(values.filter(isAdminSection));
  return ADMIN_SECTIONS.filter((section) => wanted.has(section));
}
