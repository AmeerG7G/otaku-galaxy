import type { RequestHandler } from 'express';
import { db } from '../database/pool.js';
import { franchisesService } from '../services/franchisesService.js';
import { settingsService } from '../services/settingsService.js';
import { zoneRepo } from '../repositories/zonesRepo.js';
import { ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import { governorateIdParamSchema } from '../validators/franchises.js';

/** مسارات عامة بلا مصادقة يقرأها تطبيق العميل. */
export const publicExtrasController = {
  zones: (async (req, res) => {
    const { governorateId } = parse(governorateIdParamSchema, req.params);
    const items = await zoneRepo.listForGovernorate(db, governorateId);
    return ok(res, { items });
  }) as RequestHandler,

  franchises: (async (_req, res) => {
    return ok(res, { items: await franchisesService.listPublic() });
  }) as RequestHandler,

  settings: (async (_req, res) => {
    return ok(res, await settingsService.publicSettings());
  }) as RequestHandler,
};
