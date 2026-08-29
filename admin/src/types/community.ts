export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface AdminReview {
  id: string
  productId: string
  productName: string
  orderId: string
  rating: number
  comment: string
  photoUrl: string | null
  status: ReviewStatus
  rejectionReason: string | null
  customerName: string
  createdAt: string
  userId: string
  hasPhoto: boolean
}

export interface AdminReviewListResponse {
  items: AdminReview[]
  page: number
  limit: number
  total: number
  hasMore: boolean
}

export interface ModerateReviewPayload {
  status: 'approved' | 'rejected'
  rejectionReason?: string
}

export interface Franchise {
  id: string
  name: string
  imageUrl: string | null
  sortOrder: number
  isActive: boolean
  productCount: number
}

export interface FranchiseCreatePayload {
  name: string
  imageUrl?: string | null
  sortOrder?: number
}

export interface FranchiseUpdatePayload {
  name?: string
  imageUrl?: string | null
  sortOrder?: number
  isActive?: boolean
}

export interface DeliveryZone {
  id: string
  governorateId: string
  name: string
  deliveryFee: number
  sortOrder: number
  isActive: boolean
}

export interface ZoneCreatePayload {
  governorateId: string
  name: string
  deliveryFee: number
  sortOrder?: number
}

export interface ZoneUpdatePayload {
  name?: string
  deliveryFee?: number
  sortOrder?: number
  isActive?: boolean
}

export interface StoreSettings {
  social_tiktok: string
  social_instagram: string
  social_whatsapp: string
}

export type OrderStatusKey =
  | 'PENDING_ADMIN_CONFIRMATION'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'REJECTED'

export interface DashboardStats {
  orders: { total: number; byStatus: Record<OrderStatusKey, number> }
  revenue: { completed: number; inProgress: number; completedThisMonth: number }
  products: { total: number; active: number; lowStock: number; outOfStock: number }
  customers: { total: number }
  reviews: { pending: number }
  lowStockProducts: {
    id: string
    name: string
    stock: number
    price: number
    imageUrl: string | null
  }[]
}
