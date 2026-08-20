export type Role = 'customer' | 'admin'

export interface PublicUser {
  id: string
  username: string
  phone: string
  avatarUrl: string | null
  role: Role
  createdAt: string
}

export interface LoginResult {
  token: string
  user: PublicUser
}

export interface ApiEnvelope<T> {
  success: boolean
  data: T | null
  message: string | null
  error?: { code: string; details?: unknown } | null
}

export interface Paginated<T> {
  items: T[]
  page: number
  limit: number
  total: number
  hasMore: boolean
}