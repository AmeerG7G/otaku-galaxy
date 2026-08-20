export interface AdminSubcategory {
  id: string
  name: string
  sortOrder: number
}

export interface AdminCategory {
  id: string
  name: string
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
  imageUrl?: string | null
  sortOrder?: number
}

export interface CategoryUpdatePayload {
  name?: string
  imageUrl?: string | null
  sortOrder?: number
}

export interface SubcategoryCreatePayload {
  categoryId: string
  name: string
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