import type { AppNotification } from './types';

/**
 * Where a notification leads on this site — the same destinations the app
 * opens (order, review, product). Only ids the API sent, only when they are
 * UUIDs; an unknown destination is simply no link.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function notificationHref(notification: Pick<AppNotification, 'orderId' | 'productId' | 'reviewId' | 'type'>): string | null {
  if (notification.orderId && UUID.test(notification.orderId)) return `/orders/${notification.orderId}`;
  if (notification.productId && UUID.test(notification.productId)) return `/p/${notification.productId}`;
  if (notification.type === 'rewardClaimed') return '/points';
  return null;
}
