import type { RequestHandler } from 'express';
import { restockService } from '../services/restockService.js';
import { ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import {
  restockProductParamSchema,
  restockSubscribeSchema,
  restockVariantQuerySchema,
} from '../validators/restock.js';

/**
 * «أخبرني عند توفره» — مسارات العميل. التوجيه يفرض [authenticate] في الأصل،
 * فالملكية مضمونة: كل عملية على صفّ صاحب الجلسة نفسه، ورُفض الاشتراك
 * بمنتج متوفر في الخدمة (طلب بلا معنى = خطأ واضح لا صمت).
 */
export const restockController = {
  subscribe: (async (req, res) => {
    const { productId, variantId } = parse(restockSubscribeSchema, req.body);
    if (variantId) {
      return ok(res, await restockService.subscribeVariant(req.auth!.id, productId, variantId));
    }
    return ok(res, await restockService.subscribe(req.auth!.id, productId));
  }) as RequestHandler,

  unsubscribe: (async (req, res) => {
    const { productId } = parse(restockProductParamSchema, req.params);
    const { variantId } = parse(restockVariantQuerySchema, req.query);
    return ok(
      res,
      variantId
        ? await restockService.unsubscribeVariant(req.auth!.id, productId, variantId)
        : await restockService.unsubscribe(req.auth!.id, productId),
      'أُلغيت التذكرة',
    );
  }) as RequestHandler,

  mine: (async (req, res) => {
    return ok(res, await restockService.mine(req.auth!.id));
  }) as RequestHandler,

  /**
   * اشتراكات الألوان (088) — مسارٌ منفصل كي يبقى `GET /mine` بشكله: التطبيق
   * المثبَّت يقرأ كل عنصرٍ فيه اشتراكاً بالمنتج كله.
   */
  mineVariants: (async (req, res) => {
    return ok(res, { items: await restockService.mineVariants(req.auth!.id) });
  }) as RequestHandler,
};