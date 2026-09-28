export interface ProductOption {
  id: string
  name: string
  values: string[]
}

export interface Product {
  id: string
  /** العربية على مسارات الإدارة — حقلٌ قديم؛ النموذج يقرأ `nameAr` صراحةً. */
  name: string
  description: string
  /**
   * محتوى المنتج بلغتين — أربعة حقول مستقلة (هجرة ٠٦٦).
   *
   * `nameAr`/`descriptionAr` العربية، و`nameCkb`/`descriptionCkb` الكردية
   * (سوراني، الرمز `ckb`). الكردية `null` = **ناقصة** (منتج أقدم من الإلزام)،
   * لا نصٌّ فارغ ولا عربيٌّ منسوخ.
   */
  nameAr: string
  descriptionAr: string
  nameCkb: string | null
  descriptionCkb: string | null
  /** هل ينقص المنتجَ اسمٌ أو وصفٌ كردي؟ — حكم الخادم. */
  kurdishMissing: boolean
  price: number
  stock: number
  /**
   * موعد التوفر المتوقَّع — ISO-8601 أو `null` («بلا موعد»).
   *
   * حقل `products.restock_at` القائم نفسه؛ الحالة المعروضة للزبون
   * مشتقّة منه ومن `stock` ولا تُخزَّن.
   */
  restockAt?: string | null
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
  /** بحث بجزء من الاسم — على الخادم (`ILIKE` مهرَّب)، يشمل المعطّل. */
  q?: string
  /** ترشيح بالقسم — يجري على الخادم لا في المتصفح. */
  categoryId?: string
  subcategoryId?: string
  /**
   * ترشيح العروض/المختارة — على مسار الإدارة، فيشمل المنتجات المعطّلة.
   *
   * نصّية لأن معايير الاستعلام نصوص، ولأن الخادم يفرّق بين «غائب» (بلا
   * ترشيح) و«false» (المستبعَد من القسم).
   */
  offer?: 'true' | 'false'
  selected?: 'true' | 'false'
  /** `'true'` ← المنتجات التي ينقصها اسمٌ أو وصفٌ كردي وحدها. */
  missingKurdish?: 'true'
}

export interface ProductOptionInput {
  name: string
  values: string[]
}

export interface ProductCreatePayload {
  /** الأربعة إلزامية عند الإنشاء — الخادم يرفض الناقص والفارغ. */
  nameAr: string
  descriptionAr: string
  nameCkb: string
  descriptionCkb: string
  price: number
  categoryId: string
  subcategoryId?: string | null
  stock: number
  /**
   * موعد التوفر المتوقَّع — ISO-8601 أو `null` («بلا موعد»).
   *
   * حقل `products.restock_at` القائم نفسه؛ الحالة المعروضة للزبون
   * مشتقّة منه ومن `stock` ولا تُخزَّن.
   */
  restockAt?: string | null
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
  /**
   * كل حقلٍ لغويٍّ مستقل: الغائب لا يُمسّ على الخادم. الحاضر نصٌّ غير فارغ —
   * لا يُفرَّغ محتوى بالتعديل.
   */
  nameAr?: string
  descriptionAr?: string
  nameCkb?: string
  descriptionCkb?: string
  price?: number
  categoryId?: string
  subcategoryId?: string | null
  stock?: number
  /**
   * موعد التوفر المتوقَّع — ISO-8601 أو `null` («بلا موعد»).
   *
   * حقل `products.restock_at` القائم نفسه؛ الحالة المعروضة للزبون
   * مشتقّة منه ومن `stock` ولا تُخزَّن.
   */
  restockAt?: string | null
  images?: string[]
  options?: ProductOptionInput[]
  isOffer?: boolean
  isSelected?: boolean
  isActive?: boolean
  // لا `rating`/`reviewCount`: مشتقّان من التقييمات المنشورة، والخادم يُسقطهما.
  previousPrice?: number | null
  hasDeliveryPromo?: boolean
  deliveryPromoAmount?: number
  franchiseIds?: string[]
}

export interface PublicProduct {
  id: string
  /**
   * محسومان بلغة الطلب — **لا** يُقرآن في النموذج: لغة الطلب هنا ليست مضمونة
   * العربية، فقراءتهما كانت ستضع الكردية في حقل العربية.
   */
  name: string
  description: string
  /**
   * محتوى المنتج بلغتين — أربعة حقول مستقلة (هجرة ٠٦٦).
   *
   * `nameAr`/`descriptionAr` العربية، و`nameCkb`/`descriptionCkb` الكردية
   * (سوراني، الرمز `ckb`). الكردية `null` = **ناقصة** (منتج أقدم من الإلزام)،
   * لا نصٌّ فارغ ولا عربيٌّ منسوخ.
   */
  nameAr: string
  descriptionAr: string
  nameCkb: string | null
  descriptionCkb: string | null
  /** هل ينقص المنتجَ اسمٌ أو وصفٌ كردي؟ — حكم الخادم. */
  kurdishMissing: boolean
  price: number
  stock: number
  /**
   * موعد التوفر المتوقَّع — ISO-8601 أو `null` («بلا موعد»).
   *
   * حقل `products.restock_at` القائم نفسه؛ الحالة المعروضة للزبون
   * مشتقّة منه ومن `stock` ولا تُخزَّن.
   */
  restockAt?: string | null
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
  nameAr: string
  descriptionAr: string
  /**
   * `''` لنصٍّ ناقص في منتجٍ قديم — الحقل يظهر فارغاً ليكمله المسؤول، ولا
   * يُرسَل ما دام فارغاً (فيبقى «ناقصاً» على الخادم).
   */
  nameCkb: string
  descriptionCkb: string
  price: number
  stock: number
  /**
   * موعد التوفر المتوقَّع — ISO-8601 أو `null` («بلا موعد»).
   *
   * حقل `products.restock_at` القائم نفسه؛ الحالة المعروضة للزبون
   * مشتقّة منه ومن `stock` ولا تُخزَّن.
   */
  restockAt?: string | null
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