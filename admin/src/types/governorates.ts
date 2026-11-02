export interface AdminGovernorate {
  id: string
  name: string
  /** الاسم الكردي (اختياري، 046) — `null` = لا ترجمة، الزبون الكردي يرى العربي. */
  nameCkb: string | null
  deliveryFee: number
  isActive: boolean
}

export interface AdminGovernorateListResponse {
  items: AdminGovernorate[]
}

export interface GovernorateCreatePayload {
  name: string
  nameCkb?: string | null
  deliveryFee: number
}

export interface GovernorateUpdatePayload {
  name?: string
  /** `null` يمسح الترجمة الكردية؛ الغائب لا يُمسّ. */
  nameCkb?: string | null
  deliveryFee?: number
  isActive?: boolean
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