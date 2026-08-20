export type BannerDestinationType =
  | 'product'
  | 'category'
  | 'subcategory'
  | 'none'

export interface AdminBanner {
  id: string
  imageUrl: string
  title: string | null
  destinationType: BannerDestinationType
  destinationValue: string | null
  sortOrder: number
  isActive: boolean
}

export interface AdminBannerListResponse {
  items: AdminBanner[]
}

export interface BannerCreatePayload {
  imageUrl: string
  title?: string | null
  destinationType?: BannerDestinationType
  destinationValue?: string | null
  sortOrder?: number
}

export interface BannerUpdatePayload {
  imageUrl?: string
  title?: string | null
  destinationType?: BannerDestinationType
  destinationValue?: string | null
  sortOrder?: number
}

export interface BannerAdminRow {
  id: string
  image_url: string
  title: string | null
  destination_type: BannerDestinationType
  destination_value: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}