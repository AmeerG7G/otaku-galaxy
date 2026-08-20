export type OrderStatus =
  | 'PENDING_ADMIN_CONFIRMATION'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'REJECTED'

export interface OrderCustomer {
  id: string
  name: string
  phone: string
}

export interface OrderItem {
  productId: string
  productName: string
  imageUrl: string | null
  optionValue: string | null
  price: number
  quantity: number
  lineTotal: number
}

export interface AdminOrder {
  id: string
  number: string
  status: OrderStatus
  province: string
  deliveryFee: number
  fullAddress: string
  phone: string
  productsTotal: number
  discount: number
  total: number
  customer: OrderCustomer | null
  createdAt: string
  items: OrderItem[]
}

export interface StatusCounts {
  PENDING_ADMIN_CONFIRMATION: number
  CONFIRMED: number
  PREPARING: number
  OUT_FOR_DELIVERY: number
  COMPLETED: number
  REJECTED: number
}

export interface AdminOrderList {
  items: AdminOrder[]
  page: number
  limit: number
  total: number
  hasMore: boolean
  statusCounts: StatusCounts
}

export interface ListOrdersParams {
  status?: OrderStatus
  page?: number
  limit?: number
}