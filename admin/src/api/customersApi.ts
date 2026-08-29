import { client, get } from './client'
import type { ApiEnvelope } from '../types/api'
import type {
  AdminCustomerListResponse,
  ToggleUserActiveResult,
} from '../types/customers'
import type { BirthdayCustomerList } from '../types/birthdays'

export interface ListCustomersParams {
  page?: number
  limit?: number
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
 * `filter=pending` يعرض المؤهَّلين الذين لم يسجّلوا بعد — «من لم يسجّل»
 * سؤالٌ إداري لا يجيب عنه عرضُ المسجَّلين وحدهم.
 */
export function listBirthdayCustomers(
  params: ListCustomersParams & { filter?: 'all' | 'registered' | 'pending' },
): Promise<BirthdayCustomerList> {
  return get<BirthdayCustomerList>('/admin/customers/birthdays', { params })
}
