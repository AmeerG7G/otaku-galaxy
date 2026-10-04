import { get, post } from './client'
import type {
  AdminNotificationList,
  Campaign,
  CampaignList,
  BroadcastAudience,
  BroadcastPayload,
  BroadcastResult,
  NotificationStats,
  NotificationType,
} from '../types/notifications'

export interface ListNotificationsParams {
  page?: number
  limit?: number
  type?: NotificationType
  userId?: string
  read?: boolean
}

/** الإشعارات كما تقرأها الإدارة — قراءة فقط. */
export function listNotifications(
  params: ListNotificationsParams,
): Promise<AdminNotificationList> {
  return get<AdminNotificationList>('/admin/notifications', { params })
}

export function getNotificationStats(): Promise<NotificationStats> {
  return get<NotificationStats>('/admin/notifications/stats')
}

/**
 * بثّ إشعار إلى جمهور: الكل، زبائن محدَّدون، أو شريحة.
 *
 * `idempotencyKey` مطلوب (CA-7): مفتاحٌ واحد لكل جلسة كتابة، يُعاد كما هو عند
 * إعادة المحاولة — فإعادةٌ بعد انقطاع الردّ تعيد الحملة نفسها لا حملةً ثانية.
 */
export function broadcastNotification(
  payload: BroadcastPayload,
  idempotencyKey: string,
): Promise<BroadcastResult> {
  return post<BroadcastResult>('/admin/notifications/broadcast', payload, {
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** سجلّ الحملات — أعدادٌ ووصفٌ للجمهور، لا قائمة مستلمين. */
export function listCampaigns(params: { page?: number; limit?: number; kind?: 'broadcast' | 'manual' }) {
  return get<CampaignList>('/admin/notifications/campaigns', { params })
}

export function getCampaign(id: string) {
  return get<Campaign>(`/admin/notifications/campaigns/${id}`)
}

/** حجم الجمهور قبل الإرسال — لا بثّ أعمى. */
export function previewAudience(
  audience: BroadcastAudience,
): Promise<{ recipients: number }> {
  return post<{ recipients: number }>('/admin/notifications/audience', audience)
}
