export interface AdminGovernorate {
  id: string
  name: string
  deliveryFee: number
  isActive: boolean
}

export interface AdminGovernorateListResponse {
  items: AdminGovernorate[]
}

export interface GovernorateCreatePayload {
  name: string
  deliveryFee: number
}

export interface GovernorateUpdatePayload {
  name?: string
  deliveryFee?: number
}

export interface GovernorateAdminRow {
  id: string
  name: string
  delivery_fee: number
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}