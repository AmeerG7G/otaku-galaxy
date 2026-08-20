import type { OrderStatus } from '../types/orders'

export const ORDER_STATUSES: OrderStatus[] = [
  'PENDING_ADMIN_CONFIRMATION',
  'CONFIRMED',
  'PREPARING',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
  'REJECTED',
]

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_ADMIN_CONFIRMATION: 'بانتظار تأكيد الإدارة',
  CONFIRMED: 'تم تأكيده',
  PREPARING: 'قيد التجهيز',
  OUT_FOR_DELIVERY: 'قيد التوصيل',
  COMPLETED: 'مكتمل',
  REJECTED: 'مرفوض',
}

export interface StatusAction {
  to: OrderStatus
  label: string
}

const STATUS_ACTIONS: Record<OrderStatus, StatusAction[]> = {
  PENDING_ADMIN_CONFIRMATION: [
    { to: 'CONFIRMED', label: 'تأكيد الطلب' },
    { to: 'REJECTED', label: 'رفض الطلب' },
  ],
  CONFIRMED: [
    { to: 'PREPARING', label: 'بدء التجهيز' },
    { to: 'REJECTED', label: 'رفض الطلب' },
  ],
  PREPARING: [
    { to: 'OUT_FOR_DELIVERY', label: 'إرسال للتوصيل' },
    { to: 'REJECTED', label: 'رفض الطلب' },
  ],
  OUT_FOR_DELIVERY: [
    { to: 'COMPLETED', label: 'تحديد كمكتمل' },
    { to: 'REJECTED', label: 'رفض الطلب' },
  ],
  COMPLETED: [],
  REJECTED: [],
}

export function statusActions(status: OrderStatus): StatusAction[] {
  return STATUS_ACTIONS[status]
}

export function isOrderStatus(value: string | null): value is OrderStatus {
  return value !== null && (ORDER_STATUSES as string[]).includes(value)
}