import { db } from '../database/pool.js';
import { categoryRepo, productRepo } from '../repositories/catalogRepo.js';
import { bannerRepo, governorateRepo } from '../repositories/storefrontRepo.js';
import type { ProductSort } from '../types/index.js';
import { Errors } from '../utils/errors.js';
import type { AppLocale } from '../utils/locale.js';
import {
  localizeBanner,
  localizeNamed,
  localizeOption,
  localizeProduct,
} from '../utils/localize.js';

/**
 * قسمٌ ومعه أقسامه الفرعية — كلاهما يُحسم لغةً.
 *
 * `key` هوية القسم الثابتة عبر اللغات والبيئات: اسمه العربي الفريد (الهجرة
 * 002)، لا نصٌّ يُعرض. التطبيق يقفل الترتيب المعتمد وألوان البطاقات عليها؛
 * كان يقفلهما على `name`، فلمّا صار `name` كردياً فقدت الأقسام الستة
 * رتبتها ولونها. المعرّف لا يصلح: `UUID` يختلف بين البيئات.
 */
function localizeCategory<
  T extends {
    name: string;
    nameCkb?: string | null;
    subcategories: Array<{ name: string; nameCkb?: string | null }>;
  },
>(category: T, locale: AppLocale) {
  const { subcategories, ...rest } = localizeNamed(category, locale) as T;
  return {
    ...rest,
    key: category.name,
    subcategories: subcategories.map((s) => localizeNamed(s, locale)),
  };
}

export const catalogService = {
  /** بيانات الصفحة الرئيسية: بانرات، عروض، مختارات، أقسام، اكتشاف عشوائي. */
  async getHome(locale: AppLocale) {
    // بذرة ثابتة ← ترتيب «اكتشف» مستقر بين الطلبات بدل قائمة تتبدّل بكل تحديث.
    const DISCOVER_SEED = 'home';
    const DISCOVER_LIMIT = 10;

    const [banners, heroBanners, promoBanners, offers, selected, categories, discover] =
      await Promise.all([
      bannerRepo.listActive(db),
      bannerRepo.listActive(db, 'hero'),
      bannerRepo.listActive(db, 'promo'),
      productRepo.list(db, { page: 1, limit: 8, isOffer: true }),
      productRepo.list(db, { page: 1, limit: 8, isSelected: true }),
      categoryRepo.list(db),
      // كان هنا استعلامٌ وتحويلٌ يدويان أسقطا `deliveryPromoAmount`، فتظهر
      // المنتجات في «اكتشف» بلا خصم التوصيل الذي تُظهره بقية الشاشات.
      productRepo.listDiscover(db, DISCOVER_SEED, DISCOVER_LIMIT),
    ]);

    return {
      banners: banners.map((b) => localizeBanner(b, locale)),
      /**
       * لوحة البطل — واحدة تُعرض: الأولى ترتيباً.
       *
       * الموضع واحد في التصميم، فإرسال قائمة كان سيترك التطبيق يقرّر أيّها
       * يعرض — قرارٌ يخصّ المسؤول لا الجهاز. الترتيب في اللوحة هو الجواب.
       */
      heroBanner: heroBanners[0] ? localizeBanner(heroBanners[0], locale) : null,
      /** الشريط الترويجي — عدد مفتوح بترتيب المسؤول. */
      promoBanners: promoBanners.map((b) => localizeBanner(b, locale)),
      offers: offers.items.map((p) => localizeProduct(p, locale)),
      selectedProducts: selected.items.map((p) => localizeProduct(p, locale)),
      categories: categories.map((c) => localizeCategory(c, locale)),
      discover: discover.map((p) => localizeProduct(p, locale)),
    };
  },

  async listCategories(locale: AppLocale) {
    const items = await categoryRepo.list(db);
    return items.map((c) => localizeCategory(c, locale));
  },

  async listProducts(options: {
    page: number;
    limit: number;
    categoryId?: string;
    subcategoryId?: string;
    isOffer?: boolean;
    isSelected?: boolean;
    sort?: ProductSort;
  }, locale: AppLocale) {
    const page = await productRepo.list(db, options);
    return { ...page, items: page.items.map((p) => localizeProduct(p, locale)) };
  },

  /**
   * البحث بلغة الطلب نفسها التي تُحسم بها الأسماء (`resolveLocale` —
   * ترويسة `Accept-Language` التي يرسلها التطبيق بلغة واجهته). لا معامل
   * `?lang=` ثانٍ: آليةٌ واحدة للغة في الـAPI كله.
   */
  async search(query: string, page: number, limit: number, locale: AppLocale) {
    const result = await productRepo.search(db, query, page, limit, locale);
    return { ...result, items: result.items.map((p) => localizeProduct(p, locale)) };
  },

  async productDetail(id: string, locale: AppLocale) {
    // تمثيل المنتج يأتي من المُحوِّل المعتمد؛ الخيارات وحدها إضافة التفاصيل.
    const product = await productRepo.findDetailById(db, id);
    if (!product) throw Errors.notFound('المنتج غير موجود');
    const localized = localizeProduct(product, locale);
    const options = (product as { options?: unknown }).options;
    if (!Array.isArray(options)) return localized;
    return {
      ...localized,
      options: options.map((o) => localizeOption(o as never, locale)),
    };
  },

  async listGovernorates(locale: AppLocale) {
    const items = await governorateRepo.listActive(db);
    return items.map((g) => localizeNamed(g as never, locale));
  },
};