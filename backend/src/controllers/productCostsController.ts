import type { RequestHandler } from 'express';
import { productCostsService } from '../services/productCostsService.js';
import { created, ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import { adminProductCostSchema, adminProductIdSchema } from '../validators/admin.js';

/** تكلفة الشراء (D1) — المساران للمسؤول الأعلى وحده (`routes/admin.ts`). */
export const productCostsController = {
  list: (async (req, res) => {
    const { id } = parse(adminProductIdSchema, req.params);
    return ok(res, await productCostsService.list(id));
  }) as RequestHandler,

  add: (async (req, res) => {
    res.locals.auditHandled = true;
    const { id } = parse(adminProductIdSchema, req.params);
    const input = parse(adminProductCostSchema, req.body ?? {});
    const entry = await productCostsService.add(id, req.auth!.id, input);
    return created(res, entry, 'سُجّلت تكلفة الشراء — تسري على الطلبات التي تُقبل من الآن');
  }) as RequestHandler,
};
