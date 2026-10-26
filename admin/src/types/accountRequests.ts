import type { CustomerGender } from './customers'

/**
 * طلبات الحساب التي تحسمها الإدارة — إنشاءٌ وإعادةُ تعيين.
 *
 * ═══ القرار ═══ لا رمز SMS ولا بريد. الزبون يقدّم طلباً؛ المسؤول يتحقّق
 * منه عبر واتساب **يدوياً** ثم يحسمه من هنا. لا شيء في اللوحة يتظاهر بأن
 * التحقّق آلي: الطلب يحمل ما أُرسل، ولقطةً من الحساب المخزَّن ليقارن
 * المسؤول بنفسه.
 */
export type AccountRequestKind = 'registration' | 'password_reset'
export type AccountRequestStatus = 'pending' | 'approved' | 'rejected'

export interface AccountRequestAccount {
  id: string
  username: string
  phone: string
  gender: CustomerGender | null
  isActive: boolean
  isVerified: boolean
  levelKey: string | null
  levelNumber: number | null
  points: number | null
  createdAt: string
}

/** إشاراتٌ للعين لا قرار: المسؤول يقارن بنفسه ويسأل عبر واتساب. */
export interface AccountRequestMatch {
  username: boolean
  gender: boolean
  level: boolean
}

export interface AccountRequest {
  id: string
  kind: AccountRequestKind
  status: AccountRequestStatus
  submitted: {
    phone: string
    username: string
    gender: CustomerGender | null
    levelKey: string | null
  }
  /** الحساب المرتبط — `null` لرقمٍ لا حساب له. */
  account: AccountRequestAccount | null
  match: AccountRequestMatch | null
  adminNote: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface AccountRequestListResponse {
  items: AccountRequest[]
  page: number
  limit: number
  total: number
  hasMore: boolean
  pending: Record<AccountRequestKind, number>
}

export const ACCOUNT_REQUEST_KIND_LABELS: Record<AccountRequestKind, string> = {
  registration: 'إنشاء حساب',
  password_reset: 'إعادة تعيين كلمة المرور',
}

export const ACCOUNT_REQUEST_STATUS_LABELS: Record<AccountRequestStatus, string> = {
  pending: 'قيد المراجعة',
  approved: 'موافَق عليه',
  rejected: 'مرفوض',
}

/** نتيجة وضع كلمة المرور — لا كلمة فيها بأي صورة. */
export interface SetCustomerPasswordResult {
  customerId: string
  request: { id: string; status: AccountRequestStatus } | null
}
