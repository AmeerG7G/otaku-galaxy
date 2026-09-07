/** عميل في سجلّ أعياد الميلاد — يقرأ نفس أعمدة `users` التي يكتبها التطبيق. */
export interface BirthdayCustomer {
  id: string
  username: string
  phone: string
  avatarUrl: string | null
  birthDay: number | null
  birthMonth: number | null
  /** لحظة التسجيل — تُثبت أن الطلب لن يُعرض على العميل مجدداً. */
  birthdaySetAt: string | null
  /** مشتقّة من `birthday_set_at` على الخادم — لا حقل حالة مكرّر. */
  isRegistered: boolean
  /** أقرب عيد قادم بتقويم المتجر (null لمن لم يسجّل). */
  nextBirthday: string | null
  daysUntilBirthday: number | null
  completedOrders: number
  discountUsedThisYear: boolean
  isActive: boolean
}

/**
 * مرشِّحات سجلّ أعياد الميلاد — تطابق `BIRTHDAY_FILTERS` على الخادم.
 *
 * `pending` = مؤهَّل (له طلب مكتمل) ولم يسجّل بعد.
 * `missing` = كل من لم يسجّل، مؤهَّلاً كان أو لا.
 */
export type BirthdayFilter =
  | 'all'
  | 'registered'
  | 'pending'
  | 'missing'
  | 'today'
  | 'upcoming'
  | 'recent'

export const BIRTHDAY_FILTER_LABELS: Record<BirthdayFilter, string> = {
  today: 'أعياد اليوم',
  upcoming: 'أعياد قادمة',
  recent: 'أعياد مؤخّراً',
  missing: 'لم يسجّل ميلاده',
  registered: 'المسجَّلون',
  pending: 'مؤهَّل ولم يسجّل',
  all: 'الكل',
}

export interface BirthdayCounts {
  registered: number
  missing: number
  today: number
  upcoming: number
  recent: number
  windowDays: number
}

export interface BirthdayCustomerList {
  items: BirthdayCustomer[]
  page: number
  limit: number
  total: number
  hasMore: boolean
  counts: BirthdayCounts
  /** منطقة المتجر الزمنية التي حُسب بها «اليوم». */
  timezone: string
}
