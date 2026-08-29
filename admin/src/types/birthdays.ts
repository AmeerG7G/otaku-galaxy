/** عميل سجّل تاريخ ميلاده — يقرأ نفس أعمدة `users` التي يكتبها التطبيق. */
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
  completedOrders: number
  discountUsedThisYear: boolean
  isActive: boolean
}

export interface BirthdayCustomerList {
  items: BirthdayCustomer[]
  page: number
  limit: number
  total: number
  hasMore: boolean
}
