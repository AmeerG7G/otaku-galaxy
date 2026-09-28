import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./client', async () => {
  class ApiError extends Error {
    readonly status: number
    readonly code: string | null

    constructor(message: string, status: number, code: string | null = null) {
      super(message)
      this.status = status
      this.code = code
    }
  }
  return {
    ApiError,
    get: vi.fn(),
    client: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  }
})

import { client } from './client'
import { getProductForEdit } from './productsApi'

/**
 * [CRITICAL] مسودّة التعديل من الحقول الصريحة لا من `name` المحسوم.
 *
 * المسار العام يحسم `name`/`description` بلغة الطلب. حتى مع ترويسة `ar`
 * الثابتة في العميل، لا يجوز أن تعتمد صحّة الحقل العربي على ترويسة: المسودّة
 * تُبنى من `nameAr`/`descriptionAr`/`nameCkb`/`descriptionCkb` وحدها.
 */
describe('getProductForEdit — المحتوى بلغتين', () => {
  beforeEach(() => vi.clearAllMocks())

  const publicProduct = {
    id: 'p1',
    // محسومٌ كردياً (كأن الطلب خرج بلغة كردية) — يجب ألّا يُقرأ.
    name: 'جانتای ناروتۆ',
    description: 'وەسفی کوردی',
    nameAr: 'حقيبة ناروتو',
    descriptionAr: 'وصف عربي',
    nameCkb: 'جانتای ناروتۆ',
    descriptionCkb: 'وەسفی کوردی',
    kurdishMissing: false,
    price: 1000,
    stock: 1,
    images: [],
    options: [],
    categoryId: 'c1',
    subcategoryId: null,
    rating: null,
    reviewCount: 0,
    isOffer: false,
    isSelected: false,
    previousPrice: null,
    discountPercent: null,
    hasDeliveryPromo: false,
    deliveryPromoAmount: 0,
    franchiseIds: [],
  }

  it('العربية من `nameAr` والكردية من `nameCkb` — مهما حُسم `name`', async () => {
    vi.mocked(client.get).mockResolvedValue({ data: { success: true, data: publicProduct } })
    const { draft } = await getProductForEdit('p1')
    expect(draft).toMatchObject({
      nameAr: 'حقيبة ناروتو',
      descriptionAr: 'وصف عربي',
      nameCkb: 'جانتای ناروتۆ',
      descriptionCkb: 'وەسفی کوردی',
    })
  })

  it('الكردية الناقصة (`null`) تصل حقلاً فارغاً — لا نسخةً من العربية', async () => {
    vi.mocked(client.get).mockResolvedValue({
      data: {
        success: true,
        data: { ...publicProduct, name: 'حقيبة ناروتو', nameCkb: null, descriptionCkb: null, kurdishMissing: true },
      },
    })
    const { draft } = await getProductForEdit('p1')
    expect(draft.nameCkb).toBe('')
    expect(draft.descriptionCkb).toBe('')
    expect(draft.nameAr).toBe('حقيبة ناروتو')
  })
})
