import type { RequestHandler } from 'express';
import { restockService } from '../services/restockService.js';
import { ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import {
  restockProductParamSchema,
  restockSubscribeSchema,
} from '../validators/restock.js';

/**
 * «أخبرني عند توفره» — مسارات العميل. التوجيه يفرض [authenticate] في الأصل،
 * فالملكية مضمونة: كل عملية على صفّ صاحب الجلسة نفسه، ورُفض الاشتراك
 * بمنتج متوفر في الخدمة (طلب بلا معنى = خطأ واضح لا صمت).
 */
export const restockController = {
  subscribe: (async (req, res) => {
    const { productId } = parse(restockSubscribeSchema, req.body);
    return ok(res, await restockService.subscribe(req.auth!.id, productId));
  }) as RequestHandler,

  unsubscribe: (async (req, res) => {
    const { productId } = parse(restockProductParamSchema, req.params);
    return ok(
      res,
      await restockService.unsubscribe(req.auth!.id, productId),
      'أُلغيت التذكرة',
    );
  }) as RequestHandler,

  mine: (async (req, res) => {
    return ok(res, await restockService.mine(req.auth!.id));
  }) as RequestHandler,
};