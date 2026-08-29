import { db } from '../database/pool.js';
import { categoryRepo, productRepo } from '../repositories/catalogRepo.js';
import { bannerRepo, governorateRepo } from '../repositories/storefrontRepo.js';
import type { ProductSort } from '../types/index.js';
import { Errors } from '../utils/errors.js';

export const catalogService = {
  /** بيانات الصفحة الرئيسية: بانرات، عروض، مختارات، أقسام، اكتشاف عشوائي. */
  async getHome() {
    // بذرة ثابتة ← ترتيب «اكتشف» مستقر بين الطلبات بدل قائمة تتبدّل بكل تحديث.
    const DISCOVER_SEED = 'home';
    const DISCOVER_LIMIT = 10;

    const [banners, offers, selected, categories, discover] = await Promise.all([
      bannerRepo.listActive(db),
      productRepo.list(db, { page: 1, limit: 8, isOffer: true }),
      productRepo.list(db, { page: 1, limit: 8, isSelected: true }),
      categoryRepo.list(db),
      // كان هنا استعلامٌ وتحويلٌ يدويان أسقطا `deliveryPromoAmount`، فتظهر
      // المنتجات في «اكتشف» بلا خصم التوصيل الذي تُظهره بقية الشاشات.
      productRepo.listDiscover(db, DISCOVER_SEED, DISCOVER_LIMIT),
    ]);

    return {
      banners,
      offers: offers.items,
      selectedProducts: selected.items,
      categories,
      discover,
    };
  },

  async listCategories() {
    return categoryRepo.list(db);
  },

  async listProducts(options: {
    page: number;
    limit: number;
    categoryId?: string;
    subcategoryId?: string;
    isOffer?: boolean;
    isSelected?: boolean;
    sort?: ProductSort;
  }) {
    return productRepo.list(db, options);
  },

  async search(query: string, page: number, limit: number) {
    return productRepo.search(db, query, page, limit);
  },

  async productDetail(id: string) {
    // تمثيل المنتج يأتي من المُحوِّل المعتمد؛ الخيارات وحدها إضافة التفاصيل.
    const product = await productRepo.findDetailById(db, id);
    if (!product) throw Errors.notFound('المنتج غير موجود');
    return product;
  },

  async listGovernorates() {
    return governorateRepo.listActive(db);
  },
};