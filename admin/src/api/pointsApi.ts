import { get, post } from './client'
import type {
  CustomerPoints,
  GalaxyPointsRules,
  GiftClaimsPage,
  PointsSummary,
} from '../types/points'

/**
 * نقاط عميل واحد — قراءة فقط.
 *
 * لا يوجد مسار تعديل عمداً: كل حركة في الدفتر مشتقّة من حدث حقيقي ومحميّة
 * بفهرس فريد يمنع تكرارها. منحٌ يدوي بلا حدث يكسر ذلك الضمان.
 */
export function getCustomerPoints(id: string): Promise<CustomerPoints> {
  return get<CustomerPoints>(`/admin/customers/${id}/points`)
}

export function getPointsSummary(): Promise<PointsSummary> {
  return get<PointsSummary>('/admin/points/summary')
}

// ── قواعد نقاط المجرّة ──
//
// [NOTE] حُذفت `createLoyaltyLevel` و`updateLoyaltyLevel` و`deleteLoyaltyLevel`
// و`listLoyaltyLevels`. السلّم وقيم المنح قرار تجاري ثابت في الخادم، ولا
// مسار يكتبه. القراءة تبقى: المسؤول يحتاج معرفة القواعد ليجيب زبائنه.

export function getGalaxyPointsRules(): Promise<GalaxyPointsRules> {
  return get<GalaxyPointsRules>('/admin/galaxy-points/rules')
}

// ── مطالبات الهدايا ──

export function listGiftClaims(params: {
  pending?: boolean
  page?: number
  limit?: number
}): Promise<GiftClaimsPage> {
  const query = new URLSearchParams()
  if (params.pending) query.set('pending', 'true')
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  const suffix = query.toString()
  return get<GiftClaimsPage>(
    `/admin/loyalty-rewards${suffix ? `?${suffix}` : ''}`,
  )
}

/** تعليم هدية بأنها سُلّمت — فعلٌ صريح، ومرة واحدة. */
export function fulfilGiftClaim(id: string) {
  return post<unknown>(`/admin/loyalty-rewards/${id}/fulfil`, {})
}
