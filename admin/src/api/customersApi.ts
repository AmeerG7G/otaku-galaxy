import { client, get } from './client'
import type { ApiEnvelope } from '../types/api'
import type {
  AdminCustomerDetail,
  AdminCustomerListResponse,
  CustomerGender,
  CustomerSort,
  ToggleUserActiveResult,
} from '../types/customers'
import type { SetCustomerPasswordResult } from '../types/accountRequests'
import type { BirthdayCustomerList, BirthdayFilter } from '../types/birthdays'

/**
 * معايير قائمة الزبائن.
 *
 * كلها تُرسَل إلى الخادم ولا يُرشَّح شيء في المتصفح: القائمة تنمو بلا سقف،
 * وترشيحها هنا يعني تحميلها كاملةً على كل حرف يكتبه المسؤول.
 */
export interface ListCustomersParams {
  page?: number
  limit?: number
  search?: string
  isActive?: boolean
  hasBirthday?: boolean
  hasOrders?: boolean
  minPoints?: number
  maxPoints?: number
  /**
   * ترشيح الجنس — يجري في القاعدة كبقية المعايير.
   *
   * `unknown` تطابق `gender IS NULL`؛ لا تُحذف الحسابات القديمة من القائمة
   * ولا تُضمّ إلى أحد الجنسين.
   */
  gender?: CustomerGender | 'unknown'
  /** ترشيح بمستوى المجرّة — يُحوَّل إلى مدى نقاطٍ على الخادم. */
  levelKey?: string
  sort?: CustomerSort
}

export function listCustomers(
  params: ListCustomersParams,
): Promise<AdminCustomerListResponse> {
  return get<AdminCustomerListResponse>('/admin/users', { params })
}

/** ملفّ الزبون الكامل — لا تجزئة ولا توكن فيه أبداً. */
export function getCustomerDetail(id: string): Promise<AdminCustomerDetail> {
  return get<AdminCustomerDetail>(`/admin/customers/${id}`)
}

/**
 * المسؤول يضع كلمة مرور جديدة **دائمة** بعد تحقّق واتساب.
 *
 * الكلمة تُرسَل مرّةً وتُجزَّأ على الخادم؛ الردّ لا يحملها. `requestId`
 * اختياري: يُحسم به طلب إعادة التعيين المعلَّق المرتبط بهذا الحساب وحده.
 */
export async function setCustomerPassword(
  id: string,
  input: { newPassword: string; requestId?: string; note?: string },
): Promise<{ row: SetCustomerPasswordResult; message: string }> {
  const response = await client.patch<ApiEnvelope<SetCustomerPasswordResult>>(
    `/admin/customers/${id}/password`,
    input,
  )
  return { row: response.data.data!, message: response.data.message ?? '' }
}

/**
 * حظر/تفعيل زبون إلى الحالة التي قرّرها المسؤول في النافذة.
 *
 * الحالة المقصودة تُرسل صراحةً: طلبٌ بلا جسم يقلب ما في القاعدة أياً كان،
 * فضغطتا «حظر» من شاشتين (أو إعادة الضغط بعد مهلة) كانتا تُفعّلان الزبون.
 */
export async function setUserActive(input: {
  id: string
  isActive: boolean
}): Promise<{ row: ToggleUserActiveResult; message: string }> {
  const response = await client.patch<ApiEnvelope<ToggleUserActiveResult>>(
    `/admin/users/${input.id}/active`,
    { isActive: input.isActive },
  )
  return { row: response.data.data!, message: response.data.message ?? '' }
}

/**
 * سجلّ أعياد الميلاد.
 *
 * «اليوم» و«قريباً» يحسبهما الخادم بمنطقة المتجر الزمنية — لا بساعة متصفح
 * المسؤول، وإلا اختلف ما يراه عن الجمهور الذي يستهدفه الإشعار فعلاً.
 */
export function listBirthdayCustomers(params: {
  page?: number
  limit?: number
  filter?: BirthdayFilter
  windowDays?: number
}): Promise<BirthdayCustomerList> {
  return get<BirthdayCustomerList>('/admin/customers/birthdays', { params })
}
