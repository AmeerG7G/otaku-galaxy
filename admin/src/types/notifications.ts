/** أنواع الإشعارات — تطابق قيد `notifications.type` في القاعدة. */
export const NOTIFICATION_TYPES = [
  'orderAccepted',
  'orderRejected',
  'deliveryUpdate',
  'receiptReminder',
  'reviewApproved',
  'reviewRejected',
  'backInStock',
  'promotion',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/** تسميات عربية للعرض — لا تُستعمل في أي منطق. */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  orderAccepted: 'قبول طلب',
  orderRejected: 'رفض طلب',
  deliveryUpdate: 'تحديث توصيل',
  receiptReminder: 'تذكير تقييم',
  reviewApproved: 'اعتماد تقييم',
  reviewRejected: 'رفض تقييم',
  backInStock: 'عاد للمخزون',
  promotion: 'إعلان',
}

export interface AdminNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  read: boolean
  readAt: string | null
  createdAt: string
  userId: string
  username: string
  phone: string
  orderId: string | null
  reviewId: string | null
  productId: string | null
}

export interface AdminNotificationList {
  items: AdminNotification[]
  page: number
  limit: number
  total: number
  hasMore: boolean
}

export interface NotificationTypeStat {
  type: NotificationType
  total: number
  unread: number
}

export interface NotificationStats {
  total: number
  unread: number
  recipients: number
  byType: NotificationTypeStat[]
}
