import { client, get } from './client'
import type { ApiEnvelope } from '../types/api'
import type {
  AdminGovernorateListResponse,
  GovernorateAdminRow,
  GovernorateCreatePayload,
  GovernorateUpdatePayload,
} from '../types/governorates'

export function listAdminGovernorates(): Promise<AdminGovernorateListResponse> {
  return get<AdminGovernorateListResponse>('/admin/governorates')
}

export async function createGovernorate(
  payload: GovernorateCreatePayload,
): Promise<{ row: GovernorateAdminRow; message: string }> {
  const response = await client.post<ApiEnvelope<GovernorateAdminRow>>(
    '/admin/governorates',
    payload,
  )
  return { row: response.data.data!, message: response.data.message ?? '' }
}

export async function updateGovernorate(
  id: string,
  payload: GovernorateUpdatePayload,
): Promise<{ row: GovernorateAdminRow; message: string }> {
  const response = await client.patch<ApiEnvelope<GovernorateAdminRow>>(
    `/admin/governorates/${id}`,
    payload,
  )
  return { row: response.data.data!, message: response.data.message ?? '' }
}