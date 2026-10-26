import { client, get, post } from './client'
import type { ApiEnvelope } from '../types/api'
import type {
  AccountRequest,
  AccountRequestKind,
  AccountRequestListResponse,
  AccountRequestStatus,
} from '../types/accountRequests'

export interface ListAccountRequestsParams {
  page?: number
  limit?: number
  kind?: AccountRequestKind
  status?: AccountRequestStatus
  search?: string
}

export function listAccountRequests(
  params: ListAccountRequestsParams,
): Promise<AccountRequestListResponse> {
  return get<AccountRequestListResponse>('/admin/account-requests', { params })
}

export function getAccountRequest(id: string): Promise<AccountRequest> {
  return get<AccountRequest>(`/admin/account-requests/${id}`)
}

/** الموافقة على طلب **تسجيل** — تفعّل الحساب. طلب إعادة التعيين يُحسم بوضع كلمة مرور. */
export async function approveAccountRequest(
  id: string,
  note?: string,
): Promise<{ row: AccountRequest; message: string }> {
  const response = await client.post<ApiEnvelope<AccountRequest>>(
    `/admin/account-requests/${id}/approve`,
    note ? { note } : {},
  )
  return { row: response.data.data!, message: response.data.message ?? '' }
}

export async function rejectAccountRequest(
  id: string,
  note?: string,
): Promise<{ row: AccountRequest; message: string }> {
  const response = await client.post<ApiEnvelope<AccountRequest>>(
    `/admin/account-requests/${id}/reject`,
    note ? { note } : {},
  )
  return { row: response.data.data!, message: response.data.message ?? '' }
}

// re-export لتبقى الواجهة واحدة لمن يستورد من هنا
export { post }
