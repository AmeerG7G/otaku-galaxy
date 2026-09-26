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
  'rewardClaimed',
  'restockScheduled',
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
  rewardClaimed: 'مزيّة مستوى',
  restockScheduled: 'موعد توفر',
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

// ── بثّ الإشعارات ──

/** شرائح الجمهور — تطابق `AUDIENCE_SEGMENTS` على الخادم. */
export const AUDIENCE_SEGMENTS = [
  'birthday_today',
  'birthday_upcoming',
  'birthday_missing',
  'birthday_recent',
  'has_orders',
  'no_orders',
] as const

export type AudienceSegment = (typeof AUDIENCE_SEGMENTS)[number]

export const AUDIENCE_SEGMENT_LABELS: Record<AudienceSegment, string> = {
  birthday_today: 'عيد ميلادهم اليوم',
  birthday_upcoming: 'عيد ميلادهم قريباً',
  birthday_recent: 'مرّ عيد ميلادهم مؤخّراً',
  birthday_missing: 'لم يسجّلوا تاريخ ميلادهم',
  has_orders: 'لهم طلب مكتمل',
  no_orders: 'لا طلب مكتمل لهم',
}

/** الشرائح التي تعتمد على نافذة زمنية بالأيام. */
export const WINDOWED_SEGMENTS: AudienceSegment[] = [
  'birthday_upcoming',
  'birthday_recent',
]

export type BroadcastAudience =
  | { audience: 'all' }
  | { audience: 'users'; userIds: string[] }
  | { audience: 'segment'; segment: AudienceSegment; windowDays?: number }

export type BroadcastPayload = BroadcastAudience & {
  title: string
  body: string
}

/**
 * نتيجة البثّ.
 *
 * [CRITICAL] `recipients` عدد السجلات المنشأة **داخل التطبيق**، و`push`
 * يبقى `null` ما دام لا مزوّد إشعارات دفع مربوطاً. عرضهما كشيء واحد يجعل
 * المسؤول يظنّ أن الهواتف رنّت بينما لم يرنّ شيء.
 */
export interface BroadcastResult {
  recipients: number
  push: null | { provider: string; delivered: number; failed: number }
}
