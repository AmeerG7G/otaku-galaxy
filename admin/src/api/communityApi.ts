import { get, patch, post, remove } from './client'
import type {
  AdminReviewListResponse,
  DashboardStats,
  DeliveryZone,
  Franchise,
  FranchiseCreatePayload,
  FranchiseUpdatePayload,
  ModerateReviewPayload,
  ReviewStatus,
  StoreSettings,
  ZoneCreatePayload,
  ZoneUpdatePayload,
} from '../types/community'

// ── لوحة التحكم ──

export function fetchDashboardStats(): Promise<DashboardStats> {
  return get<DashboardStats>('/admin/stats')
}

// ── مراجعة التقييمات ──

export function listAdminReviews(params: {
  status?: ReviewStatus
  page?: number
  limit?: number
}): Promise<AdminReviewListResponse> {
  return get<AdminReviewListResponse>('/admin/reviews', { params })
}

export function moderateReview(id: string, payload: ModerateReviewPayload) {
  return patch<{ id: string; status: ReviewStatus }>(`/admin/reviews/${id}/moderate`, payload)
}

// ── الأنمي/الامتيازات ──

export function listFranchises(): Promise<{ items: Franchise[] }> {
  return get<{ items: Franchise[] }>('/admin/franchises')
}

export function createFranchise(payload: FranchiseCreatePayload) {
  return post<Franchise>('/admin/franchises', payload)
}

export function updateFranchise(id: string, payload: FranchiseUpdatePayload) {
  return patch<Franchise>(`/admin/franchises/${id}`, payload)
}

/** كم منتجاً (نشطاً أو موقوفاً) مرتبطاً بالأنمي — ما يقوله تأكيد الحذف. */
export function franchiseUsage(id: string) {
  return get<{ id: string; productCount: number }>(`/admin/franchises/${id}/usage`)
}

/**
 * حذف الأنمي ولو ارتبط بمنتجات (STEP 64 §6.2): يُفكّ الارتباط وتبقى المنتجات
 * وصورها. الردّ عدد المنتجات التي فُكّ ارتباطها.
 */
export function deleteFranchise(id: string) {
  return remove<{ id: string; unlinkedProducts: number }>(`/admin/franchises/${id}`)
}



// ── مناطق التوصيل ──

export function listZones(): Promise<{ items: DeliveryZone[] }> {
  return get<{ items: DeliveryZone[] }>('/admin/zones')
}

export function createZone(payload: ZoneCreatePayload) {
  return post<DeliveryZone>('/admin/zones', payload)
}

export function updateZone(id: string, payload: ZoneUpdatePayload) {
  return patch<DeliveryZone>(`/admin/zones/${id}`, payload)
}

export function deleteZone(id: string) {
  return remove<null>(`/admin/zones/${id}`)
}

// ── إعدادات المتجر ──

export function fetchSettings(): Promise<StoreSettings> {
  return get<StoreSettings>('/admin/settings')
}

export function updateSettings(payload: Partial<StoreSettings>) {
  return patch<StoreSettings>('/admin/settings', payload)
}
