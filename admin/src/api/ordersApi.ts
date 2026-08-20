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