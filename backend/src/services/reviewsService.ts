import type pg from 'pg';
import { PARAM_TEMPLATES } from '../domain/notificationTemplates.js';
import { db, withTransaction } from '../database/pool.js';
import {
  MAX_REVIEW_PHOTOS,
  REVIEW_POINTS_CAP_PER_ORDER,
  isQualifyingComment,
  reviewPointsFor,
} from '../domain/galaxyPoints.js';
import { mediaRepo } from '../repositories/mediaRepo.js';
import { notificationRepo } from '../repositories/notificationsRepo.js';
import { orderRepo } from '../repositories/orderRepo.js';
import { pointsRepo } from '../repositories/pointsRepo.js';
import { reviewRepo } from '../repositories/reviewsRepo.js';
import { userRepo } from '../repositories/userRepo.js';
import { type ReviewRow, type ReviewStatus } from '../types/index.js';
import { Errors } from '../utils/errors.js';
import { kurdishOrNull, pickProductName } from '../utils/locale.js';
import { config } from '../config/index.js';

/**
 * يعيد مرجع الوسائط بصيغته المخزَّنة (`/uploads/…`) إن كان مطلقاً **على أصل
 * هذا الخادم** (`publicBaseUrl`) ويؤول إليها.
 *
 * `https://<publicBaseUrl>/uploads/x.jpg` → `/uploads/x.jpg`؛ أما `/uploads/x.jpg`
 * فيُعاد كما هو. أصلٌ غريب أو مسارٌ خارج `/uploads/` يُعاد كما هو ليفشل في
 * فحص الملكية بعده — لا نقبل رابطاً لمجرّد أن مساره يشبه مساراتنا.
 */
export function toStoredMediaReference(reference: string): string {
  const trimmed = reference.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const own = new URL(config.publicBaseUrl);
    if (url.origin !== own.origin) return trimmed;
    const prefix = `${config.uploads.publicPath.replace(/\/+$/, '')}/`;
    return url.pathname.startsWith(prefix) ? url.pathname : trimmed;
  } catch {
    return trimmed;
  }
}

/** أقصى عدد صور مجتمع تُعاد للتطبيق في طلب واحد. */
const COMMUNITY_LIMIT = 60;

/**
 * صور التقييم يجب أن تكون ملفات **رفعها هذا العميل** عبر `POST /api/uploads`
 * لغرض التقييم.
 *
 * بدون هذا الفحص يستطيع أي عميل حفظ رابط خارجي عشوائي، ثم يُعرض ذلك الرابط —
 * بعد الاعتماد — لكل مستخدمي المتجر في شاشة المجتمع، فيصير المتجر واجهةً
 * لاستضافة طرف ثالث ويتسرّب عنوان كل مشاهد إليه.
 *
 * [SECURITY] الوجود في `media_files` لا يكفي: صورة زبونٍ آخر منشورةٌ في
 * المجتمع، أو صورة منتجٍ رفعها المسؤول، موجودتان في الجدول — وإرفاقُ
 * أيٍّ منهما كان ينال نقاط «تقييم بصورة» عن لقطةٍ ليست للسائل وينسبها
 * إليه. الشرط: `uploaded_by` هو السائل و`purpose = 'review'`. الرسالة
 * والرمز واحدان للمفقود وللمملوك لغيرك، فلا يُستنتج وجودُ ملفٍّ من الردّ.
 *
 * [CRITICAL] كل عنصر يُفحص، لا الأول وحده: مصفوفةٌ أول عنصرها سليم وباقيها
 * روابط خارجية كانت ستمرّ لو اكتفى الفحص بواحد. والسقف يُعاد فرضه هنا رغم
 * وجوده في المخطّط لأن هذه الدالة هي آخر بوابة قبل القاعدة.
 *
 * `alreadyAttached`: مراجع قائمة على التقييم الذي يُعاد إرساله. فُحصت
 * ملكيتُها حين أُرفقت أولَ مرة، وتبقى مقبولة ولو فقد صفّها رافعَه لاحقاً
 * (`ON DELETE SET NULL`، أو بيانات أقدم) — فلا يصير تقييمٌ مرفوض غيرَ قابلٍ
 * للتصحيح بسبب صورةٍ كانت مقبولة. المرجع **الجديد** وحده يخضع للفحص الكامل.
 */
async function assertOwnedPhotos(
  userId: string,
  photoUrls: string[] | undefined,
  alreadyAttached: readonly string[] = [],
): Promise<string[]> {
  const urls = (photoUrls ?? []).map((url) => url.trim()).filter((url) => url.length > 0);
  if (urls.length === 0) return [];
  if (urls.length > MAX_REVIEW_PHOTOS) {
    throw Errors.badRequest(
      `الحد الأقصى ${MAX_REVIEW_PHOTOS} صور للتقييم الواحد`,
      'TOO_MANY_PHOTOS',
    );
  }

  // التكرار يُزال: خمس نسخ من صورة واحدة ليست خمس صور، وإبقاؤها يملأ شاشة
  // المجتمع بنفس اللقطة. المكافأة مقطوعة أصلاً فلا أثر لهذا في النقاط.
  //
  // [CRITICAL] المرجع المخزَّن نسبي (`/uploads/…`). التطبيق يعرض للزبون
  // روابط مطلقة (يحلّها بأصل الخادم)، وكان يعيد إرسالها كما هي عند تعديل
  // تقييمٍ مرفوض، فيفشل المطابق الحرفي بـ`INVALID_PHOTO_URL` على صورةٍ
  // يملكها فعلاً. المرجع المطلق الذي يؤول إلى `/uploads/…` يُقبل بصيغته
  // النسبية؛ أي أصل آخر يبقى مرفوضاً كما كان.
  const unique = [...new Set(urls.map(toStoredMediaReference))];
  const kept = new Set(alreadyAttached);
  for (const url of unique) {
    if (kept.has(url)) continue;
    const media = await mediaRepo.findByUrl(db, url);
    const owned = media !== null && media.uploaded_by === userId && media.purpose === 'review';
    if (!owned) {
      throw Errors.badRequest('صورة التقييم غير صالحة — أعد رفعها', 'INVALID_PHOTO_URL');
    }
  }
  return unique;
}

/** تعارض الفهرس الفريد على (الزبون، المنتج) — سباقٌ بين طلبَي إرسال. */
function isDuplicateReview(error: unknown): boolean {
  return (
    (error as { code?: string }).code === '23505' &&
    String((error as { constraint?: string }).constraint ?? '').includes('uq_reviews_user_product')
  );
}

export const reviewsService = {
  async listMine(userId: string) {
    return reviewRepo.listMine(db, userId);
  },

  /**
   * تقييم الزبون لمنتج — أياً كان الطلب.
   *
   * `orderId` يبقى في التوقيع لأن التطبيق يسأل من سياق طلب، لكنه لا يدخل
   * البحث: الجواب عن «هل قيّمتُ هذا المنتج؟» لا يتغيّر بتغيّر الطلب.
   */
  async findForOrderProduct(userId: string, _orderId: string, productId: string) {
    return reviewRepo.findForUserProduct(db, userId, productId);
  },

  async listApprovedForProduct(productId: string) {
    return reviewRepo.listApprovedForProduct(db, productId);
  },

  async listCommunityPhotos(categoryId?: string | null) {
    return reviewRepo.listCommunityPhotos(db, COMMUNITY_LIMIT, categoryId ?? null);
  },

  /**
   * إرسال تقييم جديد. الشروط مفروضة على الخادم:
   * - الطلب يخصّ العميل نفسه.
   * - الطلب مكتمل (لا يُقيَّم إلا ما استُلم فعلاً).
   * - المنتج ضمن هذا الطلب.
   * - تقييم واحد لكل منتج من كل زبون — **إلى الأبد**، لا لكل طلب.
   */
  async submit(
    userId: string,
    input: {
      orderId: string;
      productId: string;
      rating: number;
      comment: string;
      photoUrls?: string[];
    },
  ) {
    const order = await orderRepo.findById(db, input.orderId);
    if (!order || order.customer?.id !== userId) throw Errors.notFound('الطلب غير موجود');
    if (order.status !== 'COMPLETED') {
      throw Errors.badRequest('لا يمكن تقييم منتجات طلب لم يُستلم بعد', 'ORDER_NOT_COMPLETED');
    }
    // [CRITICAL] الأهلية تُقرأ من صفّ الطلب في القاعدة لا من الحمولة.
    //
    // الحارس هنا لأن الواجهة تُخفي الزرّ فقط؛ من يستدعي الـAPI مباشرةً
    // بمعرّف طلبٍ لم يُستلم بعد لا يمرّ بأي واجهة. `canReview` مشتقّ من
    // `delivered_at`، فلا يفتحه تغييرُ ساعة الجهاز ولا أي حالة محلية.
    if (!order.canReview) {
      throw Errors.conflict(
        'أكّد استلام الطلب أولاً ليُفتح التقييم',
        'ORDER_NOT_RECEIVED',
      );
    }

    const item = order.items.find((entry) => entry.productId === input.productId);
    if (!item) throw Errors.badRequest('هذا المنتج ليس ضمن الطلب', 'PRODUCT_NOT_IN_ORDER');

    // شراء المنتج مرة ثانية لا يفتح تقييماً ثانياً: تقييمه الأول يبقى تقييمه،
    // ولا مكافأة ثانية عن المنتج نفسه.
    const existing = await reviewRepo.findForUserProduct(db, userId, input.productId);
    if (existing) {
      throw Errors.conflict('سبق أن قيّمت هذا المنتج', 'REVIEW_EXISTS');
    }

    const photoUrls = await assertOwnedPhotos(userId, input.photoUrls);

    const user = await userRepo.findById(db, userId);
    try {
      return await reviewRepo.create(db, {
        userId,
        orderId: input.orderId,
        productId: input.productId,
        productName: item.productNameAr,
        productNameCkb: item.productNameCkb ?? null,
        rating: input.rating,
        comment: input.comment,
        photoUrls,
        customerName: user?.username ?? 'عميل',
      });
    } catch (error) {
      // الفحص أعلاه يمنع الحالة العادية؛ هذا يمسك السباق: طلبان متزامنان
      // يجتازان الفحص معاً ثم يصطدم أحدهما بالفهرس الفريد. تحويله إلى ٤٠٩
      // يجعل النتيجة واحدة مهما كان التوقيت.
      if (isDuplicateReview(error)) {
        throw Errors.conflict('سبق أن قيّمت هذا المنتج', 'REVIEW_EXISTS');
      }
      throw error;
    }
  },

  /**
   * تعديل تقييم مرفوض — المرفوض فقط قابل لإعادة الإرسال، ولا يمنح نقاطاً.
   */
  async resubmit(
    userId: string,
    reviewId: string,
    input: { rating: number; comment: string; photoUrls?: string[] },
  ) {
    const review = await reviewRepo.findById(db, reviewId);
    if (!review) throw Errors.notFound('التقييم غير موجود');
    if (review.user_id !== userId) throw Errors.forbidden();
    if (review.status !== 'rejected') {
      throw Errors.badRequest('لا يمكن تعديل تقييم غير مرفوض', 'REVIEW_NOT_REJECTED');
    }

    // إعادة الإرسال تُعيد التقييم إلى الانتظار ولا تمنح شيئاً: الاعتماد وحده
    // هو الحدث المؤهِّل. ولو كان التقييم قد نال نقاطاً قبل رفضه فقد سُحبت
    // لحظة الرفض، فلا رصيد معلّق يتضاعف عند اعتماده ثانيةً.
    const updated = await reviewRepo.resubmit(db, reviewId, {
      rating: input.rating,
      comment: input.comment,
      photoUrls: await assertOwnedPhotos(userId, input.photoUrls, review.photo_urls ?? []),
    });
    if (!updated) {
      // [CRITICAL] التحديث مشروط بـ`status = 'rejected'` في الجملة نفسها. الفحص
      // أعلاه قرأ «مرفوض» بلا قفل؛ اعتمادٌ يلتزم في اللحظة نفسها كان يترك هذا
      // التحديث يمرّ بعده فيعود التقييم «معلَّقاً» ونقاطُ اعتماده في الدفتر.
      // صفرُ صفوف يعني: حُذف، أو لم يعد مرفوضاً — يُفرَّق بينهما بقراءة ثانية.
      if (!(await reviewRepo.findById(db, reviewId))) throw Errors.notFound('التقييم غير موجود');
      throw Errors.badRequest('لا يمكن تعديل تقييم غير مرفوض', 'REVIEW_NOT_REJECTED');
    }
    return updated;
  },

  // ── الإدارة ──

  async listForAdmin(filter: { status?: ReviewStatus; page: number; limit: number }) {
    return reviewRepo.listForAdmin(db, filter);
  },

  /**
   * قرار المراجعة. الاعتماد يمنح نقاط المجرّة ويُنشئ إشعاراً؛ الرفض يسحب
   * النقاط الممنوحة سابقاً إن وُجدت.
   *
   * المكافأة: نقطة للتعليق المكتوب، وخمسٌ مقطوعة إن رُفقت صورة أو أكثر —
   * تتجمّعان ولا تتبادلان (٦ نقاط حدّاً أقصى للتقييم الواحد). ثم يُطبَّق سقفُ
   * الطلب: مجموع نقاط التقييم عن طلب واحد لا يتجاوز عشرين مهما بلغ عدد
   * المنتجات فيه.
   */
  async moderate(
    adminId: string,
    reviewId: string,
    status: Exclude<ReviewStatus, 'pending'>,
    rejectionReason?: string,
  ) {
    if (status === 'rejected' && !rejectionReason?.trim()) {
      throw Errors.badRequest('سبب الرفض مطلوب', 'REJECTION_REASON_REQUIRED');
    }

    return withTransaction(async (client) => {
      const review = await reviewRepo.findById(client, reviewId);
      if (!review) throw Errors.notFound('التقييم غير موجود');

      // [CRITICAL] قفل الطلب قبل أي قراءة للدفتر. سقفُ العشرين يُحسب من
      // «ما مُنح حتى الآن عن هذا الطلب»، واعتمادُ تقييمين من الطلب نفسه في
      // اللحظة ذاتها كان يقرأ كلٌّ منهما الرصيد قبل كتابة الآخر فيمنحان معاً
      // فوق السقف. القفل يُسلسلهما فيقرأ الثاني ما كتبه الأول فعلاً.
      await orderRepo.lockForUpdate(client, review.order_id);

      // إعادة تطبيق نفس القرار لا تُنتج آثاراً جانبية: النقاط يحميها فهرس
      // فريد، أما الإشعار فلا — فبدونه يتكرّر إشعار «نُشر تقييمك» مع كل ضغطة.
      //
      // [CRITICAL] الحالة تُقرأ من جديد **تحت القفل** لا من القراءة الأولى:
      // اعتمادان متزامنان يقرآن «معلَّق» معاً قبل القفل، فيرى الثاني — بعد أن
      // يلتزم الأول — قراره «تغييراً» ويُشعر الزبون ثانيةً. القراءة بعد القفل
      // ترى ما كتبه الأول فعلاً فيصير الثاني «الحالة نفسها» بلا أثر.
      const locked = await reviewRepo.findById(client, reviewId);
      if (!locked) throw Errors.notFound('التقييم غير موجود');
      const statusUnchanged = locked.status === status;

      const updated = await reviewRepo.moderate(
        client,
        reviewId,
        status,
        adminId,
        rejectionReason?.trim() ?? null,
      );
      if (!updated) throw Errors.notFound('التقييم غير موجود');

      if (statusUnchanged) return updated;

      if (status === 'approved') {
        await awardReviewPoints(client, updated);
        await notificationRepo.create(client, {
          userId: updated.user_id,
          type: 'reviewApproved',
          ...(await (async () => {
              const locale = await userRepo.localeOf(client, updated.user_id);
              // اسم المنتج بلغة صاحب التقييم — من لقطتَي الطلب (066).
              return PARAM_TEMPLATES.reviewApproved[locale](
                pickProductName(
                  { ar: updated.product_name, ckb: kurdishOrNull(updated.product_name_ckb) },
                  locale,
                ),
              );
            })()),
          reviewId: updated.id,
          productId: updated.product_id,
        });
      } else {
        // سحب أي نقاط مُنحت سابقاً إن كان التقييم معتمداً ثم رُفض.
        await pointsRepo.revokeForReview(client, updated.id);
        await notificationRepo.create(client, {
          userId: updated.user_id,
          type: 'reviewRejected',
          ...(await (async () => {
              const t =
                PARAM_TEMPLATES.reviewRejected[
                  await userRepo.localeOf(client, updated.user_id)
                ]();
              // سبب الرفض كلام المسؤول — يصل كما كُتب ولا يُترجَم.
              return { title: t.title, body: updated.rejection_reason ?? t.body };
            })()),
          reviewId: updated.id,
          productId: updated.product_id,
        });
      }

      return updated;
    });
  },

  async countPending() {
    return reviewRepo.countPending(db);
  },
};

/**
 * منح نقاط تقييمٍ اعتُمد، ضمن سقف الطلب.
 *
 * يُستدعى داخل معاملة الاعتماد وبعد قفل صفّ الطلب. حارسان مستقلان:
 *
 * ١) السقف — يُحسب من الدفتر لحظتَه فلا يتجاوز مجموعُ نقاط التقييم عن الطلب
 *    الواحد عشرين نقطة. الحساب من الدفتر لا من عدّاد جانبي، فسحبُ نقاط تقييم
 *    رُفض بعد اعتماده يعيد فتح المساحة تلقائياً.
 *
 * ٢) التكرار — الفهرس الفريد `(user_id, review_id, reason)` يمنع منح نفس
 *    التقييم مرتين مهما تكرّرت ضغطة «اعتماد» أو أُعيد الطلب.
 *
 * الحصّة تُملأ بالتعليق أولاً ثم الصور: لو بقيت نقطة واحدة من السقف فالأولى
 * أن تذهب لما لا يتجزّأ منطقياً (النقطة الواحدة) بدل قصّ مكافأة الصور إلى
 * جزء لا يطابق أي قاعدة معلنة.
 */
async function awardReviewPoints(client: pg.PoolClient, review: ReviewRow) {
  const award = reviewPointsFor({
    hasComment: isQualifyingComment(review.comment),
    photoCount: review.photo_urls?.length ?? 0,
  });
  if (award.total === 0) return;

  const alreadyAwarded = await pointsRepo.reviewPointsForOrder(client, review.order_id);
  let remaining = Math.max(0, REVIEW_POINTS_CAP_PER_ORDER - alreadyAwarded);
  if (remaining === 0) return;

  if (award.comment > 0 && remaining >= award.comment) {
    await pointsRepo.award(client, {
      userId: review.user_id,
      label: 'تقييم منشور',
      amount: award.comment,
      reason: 'review_approved',
      orderId: review.order_id,
      reviewId: review.id,
    });
    remaining -= award.comment;
  }

  if (award.photos > 0 && remaining >= award.photos) {
    await pointsRepo.award(client, {
      userId: review.user_id,
      label: 'تقييم مصوّر منشور',
      amount: award.photos,
      reason: 'review_with_photo',
      orderId: review.order_id,
      reviewId: review.id,
    });
  }
}
