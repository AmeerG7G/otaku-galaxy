import type { PointsReason } from '../types/points'

/** تسميات أسباب النقاط — مصدر واحد بين «نقاط المجرّة» وملف الزبائن. */
export const POINTS_REASON_LABELS: Record<PointsReason, string> = {
  order_received: 'استلام طلب',
  review_approved: 'تقييم معتمد',
  review_with_photo: 'تقييم مصوّر',
  manual: 'يدوي',
}

/** ألوان أسباب النقاط في الجداول. */
export const POINTS_REASON_COLORS: Record<PointsReason, string> = {
  order_received: 'blue',
  review_approved: 'green',
  review_with_photo: 'purple',
  manual: 'default',
}