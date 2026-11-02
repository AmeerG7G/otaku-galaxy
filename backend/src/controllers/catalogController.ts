import { trackingService } from '../services/trackingService.js';
import type { Request, RequestHandler } from 'express';
import { catalogService } from '../services/catalogService.js';
import { resolveLocale } from '../utils/locale.js';
import { ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import {
  listProductsSchema,
  productIdParamSchema,
  searchSchema,
} from '../validators/catalog.js';

/**
 * «أرني ما لم يُعلن سعره بعد» (084) — ترويسةٌ يرسلها عميلٌ يعرض `price: null`
 * («قريباً — السعر يُعلن لاحقاً»): الموقع اليوم. القيمة `1` حرفياً؛ غيابها (التطبيق
 * المثبَّت، الذي يقرأ السعر الغائب صفراً) يُخفي تلك المنتجات من كل ردّ.
 */
export const CATALOG_UNPRICED_HEADER = 'x-og-unpriced';
export const wantsUnpriced = (req: Request) => req.get(CATALOG_UNPRICED_HEADER) === '1';

export const catalogController = {
  home: (async (req, res) => {
    const data = await catalogService.getHome(resolveLocale(req), { includeUnpriced: wantsUnpriced(req) });
    return ok(res, data);
  }) as RequestHandler,

  categories: (async (req, res) => {
    const data = await catalogService.listCategories(resolveLocale(req));
    return ok(res, { items: data });
  }) as RequestHandler,

  products: (async (req, res) => {
    const input = parse(listProductsSchema, {
      page: req.query.page,
      limit: req.query.limit,
      categoryId: req.query.categoryId,
      subcategoryId: req.query.subcategoryId,
      offer: req.query.offer,
      selected: req.query.selected,
      sort: req.query.sort,
    });
    const data = await catalogService.listProducts({
      page: input.page,
      limit: input.limit,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      isOffer: input.offer,
      isSelected: input.selected,
      sort: input.sort,
      includeUnpriced: wantsUnpriced(req),
    }, resolveLocale(req));
    return ok(res, data);
  }) as RequestHandler,

  search: (async (req, res) => {
    const input = parse(searchSchema, { q: req.query.q, page: req.query.page, limit: req.query.limit });
    const data = await catalogService.search(input.q, input.page, input.limit, resolveLocale(req), wantsUnpriced(req));
    // [D3] بحثٌ نهائي يعلنه التطبيق صراحةً (إرسال/اختيار/استعلامٌ أوّلي — لا إعادة
    // تغيير اللغة). مطفأ افتراضياً؛ تجميعيّ بلا هوية.
    if (input.page === 1 && req.get('X-OG-Track') === 'search') {
      trackingService.search(input.q, data.total, req.auth?.id ?? null);
    }
    return ok(res, data);
  }) as RequestHandler,

  product: (async (req, res) => {
    const { id } = parse(productIdParamSchema, req.params);
    const data = await catalogService.productDetail(id, resolveLocale(req), wantsUnpriced(req));
    // [D3] فتح صفحة المنتج — يعلنه شاشة التفاصيل وحدها (لا كل جلبٍ للمنتج).
    if (req.get('X-OG-Track') === 'view') trackingService.productView(id, req.auth?.id ?? null);
    // حالة الزبون صاحب الجلسة على هذا المنتج (STEP 76 B1): المفضلة واشتراكات
    // التوفر — إضافةٌ لا تظهر لزائرٍ بلا جلسة ولا لحساب إدارة، ولا تخصّ غير صاحبها.
    if (req.auth?.role === 'customer') {
      // ردٌّ يخصّ صاحب الجلسة لا يُخزَّن في أي ذاكرة وسيطة.
      res.set('Cache-Control', 'private, no-store');
      return ok(res, { ...data, viewer: await catalogService.viewerState(req.auth.id, id) });
    }
    return ok(res, data);
  }) as RequestHandler,

  governorates: (async (req, res) => {
    const data = await catalogService.listGovernorates(resolveLocale(req));
    return ok(res, { items: data });
  }) as RequestHandler,
};