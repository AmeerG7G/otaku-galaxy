import { client, get } from './client'
import type { ApiEnvelope } from '../types/api'
import type {
  AdminCustomerListResponse,
  CustomerGender,
  CustomerSort,
  ToggleUserActiveResult,
} from '../types/customers'
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
  sort?: CustomerSort
}

export function listCustomers(
  params: ListCustomersParams,
): Promise<AdminCustomerListResponse> {
  return get<AdminCustomerListResponse>('/admin/users', { params })
}

export async function toggleUserActive(
  id: string,
): Promise<{ row: ToggleUserActiveResult; message: string }> {
  const response = await client.patch<ApiEnvelope<ToggleUserActiveResult>>(
    `/admin/users/${id}/active`,
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
