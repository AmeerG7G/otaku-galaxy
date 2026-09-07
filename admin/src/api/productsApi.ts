import { client, get } from './client'
import type { ApiEnvelope } from '../types/api'
import type {
  ListProductsParams,
  Product,
  ProductCreatePayload,
  ProductFormDraft,
  ProductListResponse,
  ProductUpdatePayload,
  PublicProduct,
} from '../types/products'
import { ApiError } from './client'

export function listProducts(params: ListProductsParams): Promise<ProductListResponse> {
  return get<ProductListResponse>('/admin/products', { params })
}

export interface ProductMutationResult {
  product: Product
  message: string
}

export async function createProduct(
  payload: ProductCreatePayload,
): Promise<ProductMutationResult> {
  const response = await client.post<ApiEnvelope<Product>>('/admin/products', payload)
  return { product: response.data.data!, message: response.data.message ?? '' }
}

export async function updateProduct(
  id: string,
  payload: ProductUpdatePayload,
): Promise<ProductMutationResult> {
  const response = await client.patch<ApiEnvelope<Product>>(`/admin/products/${id}`, payload)
  return { product: response.data.data!, message: response.data.message ?? '' }
}

export async function deleteProduct(id: string): Promise<string> {
  const response = await client.delete<ApiEnvelope<{ id: string; isActive: boolean }>>(
    `/admin/products/${id}`,
  )
  return response.data.message ?? ''
}

async function findProductInAdminList(id: string): Promise<Product | null> {
  let page = 1
  while (page <= 10) {
    const list = await listProducts({ page, limit: 50 })
    const found = list.items.find((item) => item.id === id)
    if (found) return found
    if (!list.hasMore) break
    page += 1
  }
  return null
}

function publicProductToDraft(product: PublicProduct): ProductFormDraft {
  return {
    name: product.name,
    description: product.description,
    price: product.price,
    stock: product.stock,
    categoryId: product.categoryId,
    subcategoryId: product.subcategoryId,
    images: product.images,
    options: product.options.map((option) => ({ name: option.name, values: option.values })),
    isActive: true,
    isOffer: product.isOffer,
    isSelected: product.isSelected,
    rating: product.rating,
    reviewCount: product.reviewCount,
    previousPrice: product.previousPrice,
    hasDeliveryPromo: product.hasDeliveryPromo,
    deliveryPromoAmount: product.deliveryPromoAmount ?? 0,
    franchiseIds: product.franchiseIds,
  }
}

function adminProductToDraft(product: Product): ProductFormDraft {
  return {
    name: product.name,
    description: product.description,
    price: product.price,
    stock: product.stock,
    categoryId: product.categoryId,
    subcategoryId: product.subcategoryId,
    images: product.images,
    options: [],
    isActive: product.isActive,
    isOffer: product.isOffer,
    isSelected: product.isSelected,
    rating: product.rating,
    reviewCount: product.reviewCount,
    previousPrice: product.previousPrice,
    hasDeliveryPromo: product.hasDeliveryPromo,
    deliveryPromoAmount: product.deliveryPromoAmount ?? 0,
    franchiseIds: product.franchiseIds,
  }
}

export interface ProductForEdit {
  draft: ProductFormDraft
  optionsLoaded: boolean
}

export async function getPublicProduct(id: string): Promise<PublicProduct> {
  const response = await client.get<ApiEnvelope<PublicProduct>>(`/catalog/products/${id}`)
  if (!response.data.data) {
    throw new ApiError('المنتج غير موجود', 404, 'NOT_FOUND')
  }
  return response.data.data
}

export async function getProductForEdit(id: string): Promise<ProductForEdit> {
  try {
    const product = await getPublicProduct(id)
    return { draft: publicProductToDraft(product), optionsLoaded: true }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      const product = await findProductInAdminList(id)
      if (product) {
        return { draft: adminProductToDraft(product), optionsLoaded: false }
      }
      // إعادة الخطأ الأصلي إذا لم يوجد المنتج حتى في قائمة الإدارة.
      throw error
    }
    throw error
  }
}

export interface ProductFlags {
  isOffer?: boolean
  isSelected?: boolean
}

/**
 * رفع/إنزال علَمَي «عرض» و«مختارة».
 *
 * [CRITICAL] تعديلٌ جزئي خالص: الحقل الغائب عن `PATCH` لا يُمسّ على الخادم،
 * فالصور والخيارات تبقى كما هي بلا إعادة إرسالها.
 *
 * كانت هذه الدالة تقرأ المنتج أولاً من `/catalog/products/:id` العام ثم
 * تُعيد إرسال صوره وخياراته مع العَلَم — التفافٌ حول عيبٍ قديم في مسار
 * التعديل زال منذ إصلاح حفظ المنتج. وقد بقي يكلّف ثلاثة أشياء: طلبٌ زائد،
 * وحذفٌ وإعادة إدراج لكل صور المنتج وخياراته عند كل نقرة تبديل، وفشلٌ تامّ
 * على المنتج المعطّل — لأن المسار العام يعيد له 404، فتحوّل إلى رسالة
 * «لا يمكن تغيير حالاته» تصف قيداً لا وجود له على الخادم.
 */
export function patchProductFlags(
  id: string,
  flags: ProductFlags,
): Promise<ProductMutationResult> {
  return updateProduct(id, flags)
}