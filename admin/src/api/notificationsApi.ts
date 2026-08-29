import { get } from './client'
import type {
  AdminNotificationList,
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
