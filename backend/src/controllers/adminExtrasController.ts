import type { RequestHandler } from 'express';
import { db } from '../database/pool.js';
import { franchiseRepo } from '../repositories/franchisesRepo.js';
import { statsRepo } from '../repositories/statsRepo.js';
import { notificationsService } from '../services/notificationsService.js';
import { franchisesService } from '../services/franchisesService.js';
import { reviewsService } from '../services/reviewsService.js';
import { settingsService } from '../services/settingsService.js';
import { zoneRepo } from '../repositories/zonesRepo.js';
import { ok, created, noContent } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import { Errors } from '../utils/errors.js';
import {
  createNotificationSchema,
  listReviewsAdminSchema,
  moderateReviewSchema,
  reviewIdParamSchema,
} from '../validators/community.js';
import {
  createFranchiseSchema,
  createZoneSchema,
  franchiseIdParamSchema,
  governorateIdParamSchema,
  updateFranchiseSchema,
  updateSettingsSchema,
  updateZoneSchema,
  zoneIdParamSchema,
} from '../validators/franchises.js';
import { adminBusinessSettingsSchema } from '../validators/admin.js';
import { businessConfigService } from '../services/businessConfigService.js';

export const adminExtrasController = {
  /** أرقام لوحة التحكم مجمَّعة على الخادم في استعلام واحد. */
  dashboard: (async (_req, res) => {
    const [stats, lowStock] = await Promise.all([
      statsRepo.dashboard(db),
      statsRepo.lowStockProducts(db),
    ]);
    return ok(res, { ...stats, lowStockProducts: lowStock });
  }) as RequestHandler,

  // ── مراجعة التقييمات ──

  listReviews: (async (req, res) => {
    const filter = parse(listReviewsAdminSchema, req.query);
    return ok(res, await reviewsService.listForAdmin(filter));
  }) as RequestHandler,

  moderateReview: (async (req, res) => {
    const { id } = parse(reviewIdParamSchema, req.params);
    const body = parse(moderateReviewSchema, req.body);
    const review = await reviewsService.moderate(
      req.auth!.id,
      id,
      body.status,
      body.rejectionReason,
    );
    return ok(
      res,
      { id: review.id, status: review.status },
      body.status === 'approved' ? 'نُشر التقييم' : 'رُفض التقييم',
    );
  }) as RequestHandler,

  // ── الأنمي/الامتيازات ──

  listFranchises: (async (_req, res) => {
    return ok(res, { items: await franchisesService.listAll() });
  }) as RequestHandler,

  createFranchise: (async (req, res) => {
    const body = parse(createFranchiseSchema, req.body);
    return created(res, await franchisesService.create({
      name: body.name,
      imageUrl: body.imageUrl ?? null,
      sortOrder: body.sortOrder,
    }), 'أُضيف الأنمي');
  }) as RequestHandler,

  updateFranchise: (async (req, res) => {
    const { id } = parse(franchiseIdParamSchema, req.params);
    const body = parse(updateFranchiseSchema, req.body);
    return ok(res, await franchisesService.update(id, body), 'تم التحديث');
  }) as RequestHandler,

  deleteFranchise: (async (req, res) => {
    const { id } = parse(franchiseIdParamSchema, req.params);
    await franchisesService.remove(id);
    return noContent(res);
  }) as RequestHandler,

  // ── مناطق التوصيل ──

  listZones: (async (_req, res) => {
    return ok(res, { items: await zoneRepo.listAll(db) });
  }) as RequestHandler,

  listZonesForGovernorate: (async (req, res) => {
    const { governorateId } = parse(governorateIdParamSchema, req.params);
    return ok(res, { items: await zoneRepo.listForGovernorate(db, governorateId, false) });
  }) as RequestHandler,

  createZone: (async (req, res) => {
    const body = parse(createZoneSchema, req.body);
    try {
      return created(res, await zoneRepo.create(db, body), 'أُضيفت المنطقة');
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw Errors.conflict('يوجد منطقة بنفس الاسم في هذه المحافظة', 'ZONE_NAME_TAKEN');
      }
      if ((error as { code?: string }).code === '23503') {
        throw Errors.badRequest('المحافظة غير موجودة', 'GOVERNORATE_NOT_FOUND');
      }
      throw error;
    }
  }) as RequestHandler,

  updateZone: (async (req, res) => {
    const { id } = parse(zoneIdParamSchema, req.params);
    const body = parse(updateZoneSchema, req.body);
    const zone = await zoneRepo.update(db, id, body);
    if (!zone) throw Errors.notFound('المنطقة غير موجودة');
    return ok(res, zone, 'تم التحديث');
  }) as RequestHandler,

  deleteZone: (async (req, res) => {
    const { id } = parse(zoneIdParamSchema, req.params);
    const removed = await zoneRepo.remove(db, id);
    if (!removed) throw Errors.notFound('المنطقة غير موجودة');
    return noContent(res);
  }) as RequestHandler,

  // ── إعدادات المتجر ──

  getSettings: (async (_req, res) => {
    return ok(res, await settingsService.getAll());
  }) as RequestHandler,

  updateSettings: (async (req, res) => {
    const body = parse(updateSettingsSchema, req.body);
    return ok(res, await settingsService.update(body), 'حُفظت الإعدادات');
  }) as RequestHandler,

  // ── إشعار يدوي ──

  createNotification: (async (req, res) => {
    const body = parse(createNotificationSchema, req.body);
    return created(
      res,
      await notificationsService.createForUser({
        userId: body.userId,
        title: body.title,
        body: body.body,
      }),
      'أُرسل الإشعار',
    );
  }) as RequestHandler,

  // ── إعدادات الأعمال ──

  /**
   * قيم قابلة للضبط تجارياً — لا أمنية.
   *
   * تُعاد بوصفها كاملاً (القيمة المحفوظة، الفعّالة، الافتراضية، المدى) حتى
   * تفرّق اللوحة بين «مضبوط على ٢٠» و«غير مضبوط فيعمل بـ٢٠».
   */
  getBusinessSettings: (async (_req, res) => {
    return ok(res, { items: await businessConfigService.describe() });
  }) as RequestHandler,

  updateBusinessSettings: (async (req, res) => {
    const body = parse(adminBusinessSettingsSchema, req.body);
    const items = await businessConfigService.update(body);
    return ok(res, { items }, 'حُفظت إعدادات الأعمال');
  }) as RequestHandler,

  // ── ارتباطات المنتج بالأنمي ──

  productFranchises: (async (req, res) => {
    const productId = String(req.params.id);
    return ok(res, { franchiseIds: await franchiseRepo.franchiseIdsForProduct(db, productId) });
  }) as RequestHandler,
};
