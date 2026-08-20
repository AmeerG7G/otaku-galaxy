import { client, get } from './client'
import type { ApiEnvelope } from '../types/api'
import type {
  AdminCustomerListResponse,
  ToggleUserActiveResult,
} from '../types/customers'

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