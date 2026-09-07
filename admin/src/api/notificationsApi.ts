import { get, post } from './client'
import type {
  AdminNotificationList,
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

/** بثّ إشعار إلى جمهور: الكل، زبائن محدَّدون، أو شريحة. */
export function broadcastNotification(
  payload: BroadcastPayload,
): Promise<BroadcastResult> {
  return post<BroadcastResult>('/admin/notifications/broadcast', payload)
}

/** حجم الجمهور قبل الإرسال — لا بثّ أعمى. */
export function previewAudience(
  audience: BroadcastAudience,
): Promise<{ recipients: number }> {
  return post<{ recipients: number }>('/admin/notifications/audience', audience)
}
