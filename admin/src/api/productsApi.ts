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
import { listAdminCategories } from './categoriesApi'

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

export async function getAdminCategories() {
  return listAdminCategories()
}

/** جلب كل المنتجات عبر الصفحات — للإحصاءات المحلية (لا يوفر الخادم فلاتر مخزون). */
export async function fetchAllProducts(maxPages = 25): Promise<Product[]> {
  const all: Product[] = []
  let page = 1
  while (page <= maxPages) {
    const list = await listProducts({ page, limit: 50 })
    all.push(...list.items)
    if (!list.hasMore) break
    page += 1
  }
  return all
}

export interface ProductFlags {
  isOffer?: boolean
  isSelected?: boolean
}

/**
 * تبديل علمي (عرض/مختارة) بأمان:
 * خادم الإدارة يملأ الصور والخيارات بـ [] في أي تحديث يُرسل بدونهما (خَلل موثّق)،
 * لذا نجلب الصور والخيارات الكاملة من نقطة المتجر العامة ونعيد إرسالها مع العلم.
 * المنتجات غير النشطة لا تُعرض في النقطة العامة — يرفض التبديل مع رسالة واضحة.
 */
export async function patchProductFlags(
  id: string,
  flags: ProductFlags,
): Promise<ProductMutationResult> {
  try {
    const publicProduct = await getPublicProduct(id)
    return updateProduct(id, {
      images: publicProduct.images,
      options: publicProduct.options.map((option) => ({
        name: option.name,
        values: option.values,
      })),
      ...flags,
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new ApiError(
        'المنتج غير نشط، ولا يمكن تغيير حالاته دون معرفة خياراته (الخادم لا يوفرها للمنتجات المعطّلة).',
        409,
        'INACTIVE_PRODUCT_OPTIONS_UNAVAILABLE',
      )
    }
    throw error
  }
}