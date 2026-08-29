import { get } from './client'
import type { CustomerPoints, PointsSummary } from '../types/points'

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
