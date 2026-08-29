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

/**
 * حذف محافظة.
 *
 * الخادم يرفض بـ409 ما دامت طلبات أو مناطق توصيل مرتبطة بها — الطلب سجلٌّ
 * تاريخي لا يجوز أن يفقد محافظته.
 */
export async function deleteGovernorate(id: string): Promise<{ message: string }> {
  const response = await client.delete<ApiEnvelope<{ id: string }>>(
    `/admin/governorates/${id}`,
  )
  return { message: response.data.message ?? '' }
}
