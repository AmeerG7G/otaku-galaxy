import { client, get, patch } from './client'
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
   * ذكر أو أنثى فقط (STEP 66) — الخادم يرفض أي قيمة ثالثة بـ400. الحسابات
   * القديمة بلا جنس تبقى في القائمة غير المرشَّحة ولا تُضمّ إلى أحد الجنسين.
   */
  gender?: CustomerGender
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
 * إكمال جنس حسابٍ قديم بلا جنس (D5) — ذكر أو أنثى، مرةً واحدة، بعد التحقّق من صاحب
 * الحساب عبر واتساب. لا يغيّر جنساً مضبوطاً (الخادم يرفض بـ409).
 */
export function completeCustomerGender(id: string, gender: CustomerGender) {
  return patch<{ id: string; gender: CustomerGender }>(`/admin/customers/${id}/gender`, { gender })
}

/** تعليم الحساب داخلياً/اختبارياً (D2) — للمسؤول الأعلى، بسببٍ مسجَّل. */
export function setCustomerInternal(id: string, input: { isInternal: boolean; reason: string }) {
  return patch<{ id: string; isInternalAccount: boolean; changed: boolean }>(`/admin/customers/${id}/internal`, input)
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

/**
 * تصحيح تاريخ ميلادٍ **محفوظ** (STEP 76 D1) — لصلاحية «أعياد الميلاد» وحدها.
 *
 * الزبون يضبط تاريخه مرةً واحدة؛ التصحيح بعده من هنا فقط، بسببٍ يُكتب في سجلّ
 * التدقيق مع القيمتين القديمة والجديدة. خصم الميلاد السنوي لا يتأثر.
 */
export function correctCustomerBirthday(
  id: string,
  input: { day: number; month: number; reason: string },
) {
  return patch<{ id: string; day: number; month: number; changed: boolean }>(
    `/admin/customers/${id}/birthday`,
    input,
  )
}
