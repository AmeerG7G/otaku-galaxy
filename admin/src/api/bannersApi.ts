import { client, get } from './client'
import type { ApiEnvelope } from '../types/api'
import type {
  AdminBannerListResponse,
  BannerAdminRow,
  BannerCreatePayload,
  BannerUpdatePayload,
} from '../types/banners'

export function listAdminBanners(): Promise<AdminBannerListResponse> {
  return get<AdminBannerListResponse>('/admin/banners')
}

export async function createBanner(
  payload: BannerCreatePayload,
): Promise<{ row: BannerAdminRow; message: string }> {
  const response = await client.post<ApiEnvelope<BannerAdminRow>>(
    '/admin/banners',
    payload,
  )
  return { row: response.data.data!, message: response.data.message ?? '' }
}

export async function updateBanner(
  id: string,
  payload: BannerUpdatePayload,
): Promise<{ row: BannerAdminRow; message: string }> {
  const response = await client.patch<ApiEnvelope<BannerAdminRow>>(
    `/admin/banners/${id}`,
    payload,
  )
  return { row: response.data.data!, message: response.data.message ?? '' }
}

export async function deleteBanner(id: string): Promise<string> {
  const response = await client.delete<ApiEnvelope<{ id: string }>>(
    `/admin/banners/${id}`,
  )
  return response.data.message ?? ''
}