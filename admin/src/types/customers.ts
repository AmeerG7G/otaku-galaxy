export interface AdminCustomer {
  id: string
  username: string
  phone: string
  avatarUrl: string | null
  isActive: boolean
  createdAt: string
}

export interface AdminCustomerListResponse {
  items: AdminCustomer[]
  page: number
  limit: number
  total: number
}

export interface ToggleUserActiveResult {
  id: string
  isActive: boolean
}