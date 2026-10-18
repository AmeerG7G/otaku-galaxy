import { client, get } from './client'
import type { ApiEnvelope } from '../types/api'
import type {
  ListProductsParams,
  Product,
  ProductCreatePayload,
  ProductFormDraft,
  ProductListResponse,
  ProductOption,
  ProductOptionInput,
  ProductUpdatePayload,
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

/**
 * محتوى النموذج باللغتين من الحقول **الصريحة** وحدها.
 *
 * [CRITICAL] لا `name`/`description`: في المسار العام هما محسومان بلغة الطلب،
 * ومتصفّحٌ يرسل `ckb` (أو مسؤولٌ تفضيله المحفوظ كردي) كان سيملأ حقل «الاسم
 * بالعربية» بالكردية — فيكتبها الحفظ في العمود العربي. الكردية الناقصة
 * (`null`) تصل حقلاً فارغاً يكمله المسؤول، لا نسخةً من العربية.
 */
function contentDraft(
  product: Pick<Product, 'nameAr' | 'descriptionAr' | 'nameCkb' | 'descriptionCkb'>,
) {
  return {
    nameAr: product.nameAr,
    descriptionAr: product.descriptionAr,
    nameCkb: product.nameCkb ?? '',
    descriptionCkb: product.descriptionCkb ?? '',
  }
}

/** الخيار بلغتيه كما حُفظ — يصل النموذجَ ويعود منه كاملاً (انظر `ProductOptionInput`). */
function optionToDraft(option: ProductOption): ProductOptionInput {
  return {
    name: option.name,
    values: option.values,
    nameCkb: option.nameCkb ?? null,
    valuesCkb: option.valuesCkb ?? [],
  }
}

function adminProductToDraft(product: Product, options: ProductOption[]): ProductFormDraft {
  return {
    ...contentDraft(product),
    price: product.price,
    stock: product.stock,
    categoryId: product.categoryId,
    subcategoryId: product.subcategoryId,
    images: product.images,
    options: options.map(optionToDraft),
    isActive: product.isActive,
    isOffer: product.isOffer,
    isSelected: product.isSelected,
    rating: product.rating,
    reviewCount: product.reviewCount,
    previousPrice: product.previousPrice,
    hasDeliveryPromo: product.hasDeliveryPromo,
    deliveryPromoAmount: product.deliveryPromoAmount ?? 0,
    franchiseIds: product.franchiseIds,
    // [CRITICAL] بلا هذا يصل النموذجَ حقلٌ فارغ، و`handleSubmit` يرسل
    // `restockAt: null` صراحةً — فيمسح حفظُ منتجٍ معطّل موعدَه المحفوظ.
    restockAt: product.restockAt ?? null,
  }
}

export interface ProductForEdit {
  draft: ProductFormDraft
  optionsLoaded: boolean
}

/**
 * المنتج لصفحة التعديل من مسار الإدارة — الموقوف أيضاً، وخياراته بترجمتها.
 *
 * [CRITICAL] كانت الصفحة تقرأ المسار العام (`/catalog/products/:id`): خياراتٌ
 * محسومة إلى العربية بلا ترجمتها، فكان كل حفظٍ يُعيدها بلا كردية ويمحوها،
 * والمنتج الموقوف 404 هناك فيُفتح بلا خيارات.
 *
 * خادمٌ أقدم من المسار (404): القائمة الإدارية بلا خيارات و`optionsLoaded:
 * false` — الحفظ لا يرسل الخيارات فلا يمسّها، كما كان للمنتج الموقوف.
 */
export async function getProductForEdit(id: string): Promise<ProductForEdit> {
  try {
    const response = await client.get<ApiEnvelope<Product>>(`/admin/products/${id}`)
    const product = response.data.data
    if (!product) throw new ApiError('المنتج غير موجود', 404, 'NOT_FOUND')
    return { draft: adminProductToDraft(product, product.options ?? []), optionsLoaded: true }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      const product = await findProductInAdminList(id)
      if (product) {
        return { draft: adminProductToDraft(product, []), optionsLoaded: false }
      }
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
export async function patchProductFlags(
  id: string,
  flags: ProductFlags,
): Promise<ProductMutationResult> {
  // [SECURITY] STEP 64: مسار «العروض» الضيّق — علَما العرض/الاختيار وحدهما.
  // صلاحية «العروض» لا تفتح تعديل المنتج الكامل (السعر، المخزون، الصور).
  const response = await client.patch<ApiEnvelope<Product>>(`/admin/offers/${id}`, flags)
  return { product: response.data.data!, message: response.data.message ?? '' }
}