import type { OrderStatus } from '../types/orders'

export const ORDER_STATUSES: OrderStatus[] = [
  'PENDING_ADMIN_CONFIRMATION',
  'CONFIRMED',
  'PREPARING',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
  'REJECTED',
]

/**
 * مراحل دورة الطلب كما يعيشها المتجر اليوم — وهي ما تُبنى عليه العدّادات
 * والتبويبات. القبولُ يخرج الطلب للتوصيل مباشرةً، فلم تعد «قيد التجهيز» أو
 * «تم تأكيده» مرحلةً يمرّ بها طلب جديد؛ بقيتا حالتين قديمتين تظهر تبويبهما
 * فقط إن بقي فيهما طلب.
 */
export const ORDER_STAGES: OrderStatus[] = [
  'PENDING_ADMIN_CONFIRMATION',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
]

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_ADMIN_CONFIRMATION: 'طلب جديد',
  CONFIRMED: 'مؤكَّد (قديم)',
  PREPARING: 'قيد التجهيز',
  OUT_FOR_DELIVERY: 'قيد التوصيل',
  COMPLETED: 'تم التسليم',
  REJECTED: 'مرفوض',
}

/** ألوان الحالة — مصدر واحد بدل تكرارها في كل جدول. */
export const STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING_ADMIN_CONFIRMATION: 'gold',
  CONFIRMED: 'default',
  PREPARING: 'blue',
  OUT_FOR_DELIVERY: 'cyan',
  COMPLETED: 'green',
  REJECTED: 'red',
}

export interface StatusAction {
  to: OrderStatus
  label: string
}

const STATUS_ACTIONS: Record<OrderStatus, StatusAction[]> = {
  // «تأكيد الطلب» هو الإرسال للتوصيل — خطوة واحدة تُخرج الطلب وتُعلم العميل.
  PENDING_ADMIN_CONFIRMATION: [
    { to: 'OUT_FOR_DELIVERY', label: 'تأكيد الطلب' },
    { to: 'REJECTED', label: 'رفض الطلب' },
  ],
  // مسار موروث لطلبات وقفت عند «تم تأكيده» قبل الدمج.
  CONFIRMED: [
    { to: 'PREPARING', label: 'نقل إلى التجهيز' },
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