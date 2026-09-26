import type { RequestHandler } from 'express';
import { db } from '../database/pool.js';
import { franchisesService } from '../services/franchisesService.js';
import { pointsService } from '../services/pointsService.js';
import { settingsService } from '../services/settingsService.js';
import { appVersionService } from '../services/appVersionService.js';
import { zoneRepo } from '../repositories/zonesRepo.js';
import { resolveLocale } from '../utils/locale.js';
import { localizeNamed } from '../utils/localize.js';
import { ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import { governorateIdParamSchema } from '../validators/franchises.js';

/** مسارات عامة بلا مصادقة يقرأها تطبيق العميل. */
export const publicExtrasController = {
  zones: (async (req, res) => {
    const { governorateId } = parse(governorateIdParamSchema, req.params);
    const locale = resolveLocale(req);
    const items = await zoneRepo.listForGovernorate(db, governorateId);
    // المناطق تظهر في الدفع وتفاصيل الطلب — تُحسم لغتها كالمحافظات.
    return ok(res, { items: items.map((z) => localizeNamed(z, locale)) });
  }) as RequestHandler,

  franchises: (async (_req, res) => {
    return ok(res, { items: await franchisesService.listPublic() });
  }) as RequestHandler,

  /**
   * سلّم مستويات الأوتاكو.
   *
   * عام بلا مصادقة: شاشة النقاط تعرض السلّم كاملاً حتى لمن لم يسجّل دخوله
   * بعد — وهو في ذاته دعوةٌ للتسجيل. لا شيء في السلّم يخصّ زبوناً بعينه.
   */
  loyaltyLevels: (async (_req, res) => {
    return ok(res, await pointsService.levels());
  }) as RequestHandler,

  settings: (async (_req, res) => {
    return ok(res, await settingsService.publicSettings());
  }) as RequestHandler,

  /**
   * إعدادات نسخة التطبيق — يقرؤها التطبيق عند كل إقلاع.
   *
   * [CRITICAL] عام بلا مصادقة، وخارج وسيط فحص النسخة عمداً. المستخدم
   * المحجوب يحتاج بالضبط هذا المسار ليعرف **لماذا** حُجب وإلى **أين**
   * يذهب؛ لو حماه فحصُ النسخة لصار الحجب حلقةً مغلقة: التطبيق قديم فيُرفض
   * طلبه، ولا يستطيع قراءة رابط المتجر الذي يخرجه من القِدَم.
   */
  appVersion: (async (_req, res) => {
    return ok(res, await appVersionService.config());
  }) as RequestHandler,
};
