export interface ProductOption {
  id: string
  name: string
  values: string[]
}

export interface Product {
  id: string
  name: string
  description: string
  price: number
  stock: number
  categoryId: string
  subcategoryId: string | null
  images: string[]
  options: ProductOption[]
  isActive: boolean
  isOffer: boolean
  isSelected: boolean
  rating: number | null
  reviewCount: number
  /** السعر قبل الخصم — يُشتق منه السعر المشطوب ونسبة الخصم. */
  previousPrice: number | null
  discountPercent: number | null
  hasDeliveryPromo: boolean
  /** قيمة خصم التوصيل عن كل قطعة — القيمة المعتمدة في حساب الطلب. */
  deliveryPromoAmount: number
  franchiseIds: string[]
  createdAt: string
  updatedAt: string
}

export interface ProductListResponse {
  items: Product[]
  page: number
  limit: number
  total: number
  hasMore: boolean
}

export interface ListProductsParams {
  page?: number
  limit?: number
}

export interface ProductOptionInput {
  name: string
  values: string[]
}

export interface ProductCreatePayload {
  name: string
  description?: string
  price: number
  categoryId: string
  subcategoryId?: string | null
  stock: number
  images?: string[]
  options?: ProductOptionInput[]
  isOffer?: boolean
  isSelected?: boolean
  previousPrice?: number | null
  hasDeliveryPromo?: boolean
  deliveryPromoAmount?: number
  franchiseIds?: string[]
}

export interface ProductUpdatePayload {
  name?: string
  description?: string
  price?: number
  categoryId?: string
  subcategoryId?: string | null
  stock?: number
  images?: string[]
  options?: ProductOptionInput[]
  isOffer?: boolean
  isSelected?: boolean
  isActive?: boolean
  rating?: number | null
  reviewCount?: number
  previousPrice?: number | null
  hasDeliveryPromo?: boolean
  deliveryPromoAmount?: number
  franchiseIds?: string[]
}

export interface PublicProduct {
  id: string
  name: string
  description: string
  price: number
  stock: number
  images: string[]
  options: ProductOption[]
  categoryId: string
  subcategoryId: string | null
  rating: number | null
  reviewCount: number
  isOffer: boolean
  isSelected: boolean
  previousPrice: number | null
  discountPercent: number | null
  hasDeliveryPromo: boolean
  deliveryPromoAmount: number
  franchiseIds: string[]
}

export interface ProductFormDraft {
  name: string
  description: string
  price: number
  stock: number
  categoryId: string
  subcategoryId: string | null
  images: string[]
  options: ProductOptionInput[]
  isActive: boolean
  isOffer: boolean
  isSelected: boolean
  rating: number | null
  reviewCount: number
  previousPrice: number | null
  hasDeliveryPromo: boolean
  deliveryPromoAmount: number
  franchiseIds: string[]
}