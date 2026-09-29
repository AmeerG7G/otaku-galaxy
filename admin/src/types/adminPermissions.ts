/**
 * أقسام اللوحة كصلاحيات — مرآة `backend/src/domain/adminPermissions.ts`.
 *
 * [SECURITY] الخادم يفرض الصلاحية على كل مسار؛ ما هنا يبني القائمة ويحجب
 * الصفحات راحةً للمسؤول لا حاجزاً. `backend/tests/admin-permissions.test.ts`
 * يقارن هذه القائمة بقائمة الخادم وقيد الهجرة ٠٦٨ حرفاً بحرف.
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
] as const

export type AdminSection = (typeof ADMIN_SECTIONS)[number]

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
}

/** مجموعات نموذج الصلاحيات — بترتيب القائمة الجانبية نفسه. */
export const ADMIN_SECTION_GROUPS: { label: string; sections: AdminSection[] }[] = [
  { label: 'عام', sections: ['dashboard'] },
  { label: 'العمليات', sections: ['orders', 'delivery'] },
  { label: 'الكتالوج', sections: ['products', 'categories', 'franchises', 'offers', 'restock'] },
  { label: 'الزبائن', sections: ['customers', 'account_requests', 'points', 'birthdays', 'reviews'] },
  { label: 'المحتوى والتسويق', sections: ['notifications', 'banners'] },
  { label: 'الإعدادات', sections: ['settings', 'admins'] },
]

/** ملفّ المسؤول الحالي من `GET /admin/me`. */
export interface AdminProfile {
  id: string
  username: string
  phone: string
  isSuperAdmin: boolean
  permissions: AdminSection[]
}

/** هل يملك المسؤول أحد الأقسام؟ الأعلى يملك كل شيء. */
export function canAccess(
  profile: Pick<AdminProfile, 'isSuperAdmin' | 'permissions'> | null | undefined,
  ...sections: AdminSection[]
): boolean {
  if (!profile) return false
  if (profile.isSuperAdmin) return true
  return sections.some((section) => profile.permissions.includes(section))
}

/** مسؤولٌ فرعي كما يراه المسؤول الأعلى. */
export interface SubAdmin {
  id: string
  username: string
  phone: string
  isActive: boolean
  permissions: AdminSection[]
  createdAt: string
  updatedAt: string
  createdByName: string | null
  lastActivityAt: string | null
}

/** صفّ سجلّ النشاط — `details` بلا أسرار (يُنقّيه الخادم). */
export interface AuditEntry {
  id: string
  actorId: string | null
  actorName: string
  action: string
  targetType: string | null
  targetId: string | null
  details: Record<string, unknown>
  createdAt: string
}

/** أسماء الأفعال الدلالية في سجلّ النشاط. الأفعال العامّة تُعرض بمسارها. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'admin.created': 'إنشاء مسؤول',
  'admin.deleted': 'حذف مسؤول',
  'admin.enabled': 'تفعيل مسؤول',
  'admin.disabled': 'إيقاف مسؤول',
  'admin.permissions_changed': 'تغيير صلاحيات',
  'admin.profile_updated': 'تعديل بيانات مسؤول',
  'admin.password_reset': 'إعادة تعيين كلمة مرور مسؤول',
  'admin.self.profile_updated': 'تعديل ملفّه',
  'admin.self.password_changed': 'تغيير كلمة مروره',
  'settings.updated': 'تعديل إعدادات المتجر',
  'settings.app_version_updated': 'تعديل إجبار التحديث',
  'franchise.deleted': 'حذف أنمي',
}

export type AdminPushEvent = 'new_order' | 'account_request' | 'restock_request'

export const ADMIN_PUSH_EVENT_LABELS: Record<AdminPushEvent, string> = {
  new_order: 'طلب جديد',
  account_request: 'طلب حساب أو إعادة تعيين',
  restock_request: 'طلب توفّر منتج',
}
