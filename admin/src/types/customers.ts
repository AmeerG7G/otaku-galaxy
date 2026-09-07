/**
 * جنس الزبون كما هو مخزَّن — و`null` تعني «لم يُسأل»، لا «ذكر».
 *
 * الحسابات السابقة لهجرة `040_user_gender.sql` بقيت بلا قيمة عمداً؛ عرضها
 * تحت أحد الجنسين كان سيخترع معلومةً لا يملكها المتجر.
 */
export type CustomerGender = 'male' | 'female'

export interface AdminCustomer {
  id: string
  username: string
  /**
   * الرقم كاملاً بلا إخفاء — شاشةٌ خلف مصادقة المسؤول، والطاقم يحتاجه
   * للتواصل. لا يخرج هذا الحقل من مسارات `/admin`.
   */
  phone: string
  gender: CustomerGender | null
  avatarUrl: string | null
  isActive: boolean
  createdAt: string
  /** هل سجّل تاريخ ميلاده؟ */
  hasBirthday: boolean
  birthDay: number | null
  birthMonth: number | null
  /** رصيد نقاط المجرّة — مشتقٌّ من الدفتر على الخادم. */
  points: number
  ordersTotal: number
  ordersCompleted: number
  lastOrderAt: string | null
}

/**
 * تعداد الزبائن حسب الجنس — يحسبه الخادم على كامل المطابق للبحث.
 *
 * [CRITICAL] لا يُشتقّ من `items`: القائمة مقسَّمة إلى صفحات، وجمع صفحةٍ
 * واحدة كان سيعرض «الذكور: ٧» على متجرٍ فيه سبعمئة.
 */
export interface CustomerGenderCounts {
  total: number
  male: number
  female: number
  unknown: number
}

export interface AdminCustomerListResponse {
  items: AdminCustomer[]
  page: number
  limit: number
  total: number
  hasMore: boolean
  genderCounts: CustomerGenderCounts
}

/** ترشيح الجنس في اللوحة — `unknown` تعني الحسابات التي لم تُسأل. */
export type CustomerGenderFilter = 'all' | CustomerGender | 'unknown'

/** نصّ الجنس في اللوحة — `null` تُعرض «غير محدد» لا تُخمَّن. */
export const CUSTOMER_GENDER_LABELS: Record<CustomerGender, string> = {
  male: 'ذكر',
  female: 'أنثى',
}

export const UNKNOWN_GENDER_LABEL = 'غير محدد'

export function customerGenderLabel(gender: CustomerGender | null): string {
  return gender ? CUSTOMER_GENDER_LABELS[gender] : UNKNOWN_GENDER_LABEL
}

/** ترتيب قائمة الزبائن — يطابق `CUSTOMER_SORTS` على الخادم. */
export type CustomerSort =
  | 'newest'
  | 'oldest'
  | 'name'
  | 'points_desc'
  | 'orders_desc'
  | 'last_order'

export const CUSTOMER_SORT_LABELS: Record<CustomerSort, string> = {
  newest: 'الأحدث تسجيلاً',
  oldest: 'الأقدم تسجيلاً',
  name: 'الاسم (أ-ي)',
  points_desc: 'الأعلى نقاطاً',
  orders_desc: 'الأكثر طلبات',
  last_order: 'آخر طلب',
}

export interface ToggleUserActiveResult {
  id: string
  isActive: boolean
}
