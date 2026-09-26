import type { RequestHandler } from 'express';
import { db } from '../database/pool.js';
import { franchiseRepo } from '../repositories/franchisesRepo.js';
import { statsRepo } from '../repositories/statsRepo.js';
import { notificationsService } from '../services/notificationsService.js';
import { franchisesService } from '../services/franchisesService.js';
import { reviewsService } from '../services/reviewsService.js';
import { settingsService } from '../services/settingsService.js';
import { appVersionService } from '../services/appVersionService.js';
import { zoneRepo } from '../repositories/zonesRepo.js';
import { ok, created, noContent } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import { Errors } from '../utils/errors.js';
import {
  audiencePreviewSchema,
  broadcastNotificationSchema,
  createNotificationSchema,
  listReviewsAdminSchema,
  moderateReviewSchema,
  redemptionIdParamSchema,
  reviewIdParamSchema,
} from '../validators/community.js';
import {
  createFranchiseSchema,
  createZoneSchema,
  franchiseIdParamSchema,
  governorateIdParamSchema,
  updateFranchiseSchema,
  updateSettingsSchema,
  updateAppVersionSettingsSchema,
  updateZoneSchema,
  zoneIdParamSchema,
} from '../validators/franchises.js';
import {
  adminProductIdSchema,
  giftClaimsQuerySchema,
} from '../validators/admin.js';
import {
  MAX_REVIEW_PHOTOS,
  PURCHASE_POINTS_PER_STEP,
  PURCHASE_STEP_IQD,
  REVIEW_COMMENT_POINTS,
  REVIEW_PHOTOS_POINTS,
  REVIEW_POINTS_CAP_PER_ORDER,
} from '../domain/galaxyPoints.js';
import { loyaltyRewardsService } from '../services/loyaltyRewardsService.js';
import { config } from '../config/index.js';
import type { Audience, AudienceSegment } from '../repositories/audienceRepo.js';

export const adminExtrasController = {
  /** أرقام لوحة التحكم مجمَّعة على الخادم في استعلام واحد. */
  dashboard: (async (_req, res) => {
    const [stats, lowStock] = await Promise.all([
      statsRepo.dashboard(db, config.storeTimezone),
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
      altNames: body.altNames,
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

  // ── نسخة التطبيق (إجبار التحديث) ──

  getAppVersionSettings: (async (_req, res) => {
    return ok(res, await appVersionService.config());
  }) as RequestHandler,

  /**
   * يرفع الحدّ الأدنى المدعوم بلا نشر خادم جديد.
   *
   * [CRITICAL] مسار مُصادَق ومحصور بالمسؤول (`/api/admin` كلّه خلف
   * `authenticate` + `requireAdmin`): من يملك تغيير هذا الحقل يملك حجب
   * التطبيق عن كل مستخدميه بحفظةٍ واحدة.
   */
  updateAppVersionSettings: (async (req, res) => {
    const body = parse(updateAppVersionSettingsSchema, req.body);
    await settingsService.update(body);
    return ok(res, await appVersionService.config(), 'حُفظت إعدادات النسخة');
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

  /**
   * بثّ إشعار إلى جمهور: الكل، زبائن محدَّدون، أو شريحة (أعياد ميلاد…).
   *
   * الرسالة المُعادة تقول «سجل داخل التطبيق» لا «وصل الإشعار»: لا مزوّد
   * دفع مربوطاً، وادّعاء التسليم يبني قراراً تجارياً على وهم.
   */
  broadcastNotification: (async (req, res) => {
    const body = parse(broadcastNotificationSchema, req.body);
    const result = await notificationsService.broadcast({
      audience: toAudience(body),
      title: body.title,
      body: body.body,
    });
    return created(
      res,
      result,
      `أُنشئ الإشعار لـ${result.recipients} زبوناً داخل التطبيق`,
    );
  }) as RequestHandler,

  /** حجم الجمهور قبل الإرسال — يمنع بثّاً أعمى. */
  audiencePreview: (async (req, res) => {
    const body = parse(audiencePreviewSchema, req.body);
    return ok(res, { recipients: await notificationsService.audienceSize(toAudience(body)) });
  }) as RequestHandler,

  // ── إعدادات الأعمال ──

  /**
   * قيم قابلة للضبط تجارياً — لا أمنية.
   *
   * تُعاد بوصفها كاملاً (القيمة المحفوظة، الفعّالة، الافتراضية، المدى) حتى
   * تفرّق اللوحة بين «مضبوط على ٢٠» و«غير مضبوط فيعمل بـ٢٠».
   */
  // [NOTE] حُذف `getBusinessSettings` و`updateBusinessSettings`.
  //
  // لم يبقَ إعداد أعمال رقمي واحد: قيم نقاط المجرّة ونسبة خصم الميلاد صارت
  // قواعد ثابتة، ومهلة فتح التقييم أُلغيت (التقييم يُفتح بالاستلام). نقطةٌ
  // تعرض قائمة فارغة وتقبل الكتابة كانت ستبقى باباً خلفياً لإعادة الضبط.


  // ── ارتباطات المنتج بالأنمي ──

  // ── قواعد نقاط المجرّة ومزاياها ──

  /**
   * القواعد والسلّم — **قراءة فقط**.
   *
   * [NOTE] حلّ هذا محل أربع نقاط CRUD كان المسؤول يبني بها السلّم كما يشاء.
   * القواعد صارت قراراً تجارياً ثابتاً في `domain/galaxyPoints.ts`، ولا واجهة
   * تعدّلها. تُعرض هنا ليقرأها المسؤول لا ليغيّرها — وإخفاؤها كان سيتركه
   * يجيب زبائنه بالتخمين.
   */
  galaxyPointsRules: (async (_req, res) => {
    return ok(res, {
      levels: loyaltyRewardsService.rulesForAdmin(),
      purchase: {
        stepIqd: PURCHASE_STEP_IQD,
        pointsPerStep: PURCHASE_POINTS_PER_STEP,
      },
      review: {
        commentPoints: REVIEW_COMMENT_POINTS,
        photosPoints: REVIEW_PHOTOS_POINTS,
        maxPhotos: MAX_REVIEW_PHOTOS,
        capPerOrder: REVIEW_POINTS_CAP_PER_ORDER,
      },
    });
  }) as RequestHandler,

  /** طابور الهدايا: من طالب، بأي مستوى، بأي قيمة، ومتى — وهل سُلّمت. */
  listGiftClaims: (async (req, res) => {
    const query = parse(giftClaimsQuerySchema, req.query);
    return ok(res, await loyaltyRewardsService.listGiftClaims(query));
  }) as RequestHandler,

  /** تعليم هدية بأنها سُلّمت — فعلٌ صريح، ومرة واحدة. */
  fulfilGiftClaim: (async (req, res) => {
    const { id } = parse(redemptionIdParamSchema, req.params);
    const updated = await loyaltyRewardsService.fulfilGift(req.auth!.id, id);
    return ok(res, updated, 'سُجّل تسليم الهدية');
  }) as RequestHandler,

  productFranchises: (async (req, res) => {
    // المعرّف يُتحقَّق منه عند الحدّ كسائر المسارات: نصٌّ ليس UUID كان يصل
    // الاستعلام فيرميه PostgreSQL (`22P02`) ويخرج ٥٠٠ بدل ٤٠٠.
    const { id: productId } = parse(adminProductIdSchema, req.params);
    return ok(res, { franchiseIds: await franchiseRepo.franchiseIdsForProduct(db, productId) });
  }) as RequestHandler,
};

/**
 * يحوّل الشكل المسطَّح القادم من الشبكة إلى الاتحاد المميَّز الذي تفهمه
 * طبقة البيانات. التحويل هنا مرة واحدة بدل تكراره في كل مستدعٍ.
 */
function toAudience(
  body:
    | { audience: 'all' }
    | { audience: 'users'; userIds: string[] }
    | { audience: 'segment'; segment: AudienceSegment; windowDays?: number },
): Audience {
  switch (body.audience) {
    case 'users':
      return { type: 'users', userIds: body.userIds };
    case 'segment':
      return { type: 'segment', segment: body.segment, windowDays: body.windowDays };
    default:
      return { type: 'all' };
  }
}
