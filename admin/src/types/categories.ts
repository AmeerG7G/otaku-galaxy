export interface AdminSubcategory {
  id: string
  name: string
  /** الاسم الكردي (اختياري، 046) — `null` = لا ترجمة، الزبون الكردي يرى العربي. */
  nameCkb: string | null
  sortOrder: number
  isActive: boolean
}

export interface AdminCategory {
  id: string
  name: string
  /** الاسم الكردي (اختياري، 046) — `null` = لا ترجمة، الزبون الكردي يرى العربي. */
  nameCkb: string | null
  imageUrl: string | null
  sortOrder: number
  isActive: boolean
  subcategories: AdminSubcategory[]
}

export interface AdminCategoryListResponse {
  items: AdminCategory[]
}

export interface CategoryCreatePayload {
  name: string
  nameCkb?: string | null
  imageUrl?: string | null
  sortOrder?: number
}

export interface CategoryUpdatePayload {
  name?: string
  /** `null` يمسح الترجمة الكردية؛ الغائب لا يُمسّ. */
  nameCkb?: string | null
  imageUrl?: string | null
  sortOrder?: number
  isActive?: boolean
}

export interface SubcategoryCreatePayload {
  categoryId: string
  name: string
  nameCkb?: string | null
  sortOrder?: number
}

export interface CategoryAdminRow {
  id: string
  name: string
  image_url: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SubcategoryCreateResult {
  id: string
  name: string
}