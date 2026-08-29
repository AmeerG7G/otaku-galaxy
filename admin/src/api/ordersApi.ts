import { client, get } from './client'
import type { ApiEnvelope } from '../types/api'
import type {
  AdminOrder,
  AdminOrderList,
  ListOrdersParams,
  OrderStatus,
} from '../types/orders'

export function listOrders(params: ListOrdersParams): Promise<AdminOrderList> {
  return get<AdminOrderList>('/admin/orders', { params })
}

export function getOrder(id: string): Promise<AdminOrder> {
  return get<AdminOrder>(`/admin/orders/${id}`)
}

export interface OrderStatusUpdateResult {
  order: AdminOrder
  message: string
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  note?: string,
): Promise<OrderStatusUpdateResult> {
  const response = await client.patch<ApiEnvelope<AdminOrder>>(
    `/admin/orders/${id}/status`,
    { status, note },
  )
  return { order: response.data.data!, message: response.data.message ?? '' }
}
/** إعادة جدولة تذكير الاستلام: مهلة بالساعات أو لحظة صريحة (لا كليهما). */
export async function rescheduleReminder(
  id: string,
  payload: { delayHours: number } | { remindAt: string },
): Promise<AdminOrder> {
  const response = await client.patch<ApiEnvelope<AdminOrder>>(
    `/admin/orders/${id}/reminder`,
    payload,
  )
  return response.data.data!
}

/** إرسال تذكير الاستلام فوراً. الخادم يرفض التكرار بـREMINDER_ALREADY_SENT. */
export async function sendReminderNow(id: string): Promise<AdminOrder> {
  const response = await client.post<ApiEnvelope<AdminOrder>>(
    `/admin/orders/${id}/reminder/send-now`,
  )
  return response.data.data!
}
