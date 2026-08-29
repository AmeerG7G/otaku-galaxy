import { db, withTransaction } from '../database/pool.js';
import { mediaRepo } from '../repositories/mediaRepo.js';
import { notificationRepo } from '../repositories/notificationsRepo.js';
import { orderRepo } from '../repositories/orderRepo.js';
import { pointsRepo } from '../repositories/pointsRepo.js';
import { reviewRepo } from '../repositories/reviewsRepo.js';
import { userRepo } from '../repositories/userRepo.js';
import { type ReviewStatus } from '../types/index.js';
import { Errors } from '../utils/errors.js';
import { businessConfigService } from './businessConfigService.js';

/** أقصى عدد صور مجتمع تُعاد للتطبيق في طلب واحد. */
const COMMUNITY_LIMIT = 60;

/**
 * صورة التقييم يجب أن تكون ملفاً رفعه العميل عبر `POST /api/uploads`.
 *
 * بدون هذا الفحص يستطيع أي عميل حفظ رابط خارجي عشوائي في `photo_url`، ثم
 * يُعرض ذلك الرابط — بعد الاعتماد — لكل مستخدمي المتجر في شاشة المجتمع،
 * فيصير المتجر واجهةً لاستضافة طرف ثالث ويتسرّب عنوان كل مشاهد إليه.
 */
async function assertOwnedPhoto(photoUrl: string | null | undefined) {
  if (!photoUrl || !photoUrl.trim()) return null;
  const media = await mediaRepo.findByUrl(db, photoUrl.trim());
  if (!media) {
    throw Errors.badRequest('صورة التقييم غير صالحة — أعد رفعها', 'INVALID_PHOTO_URL');
  }
  return photoUrl.trim();
}

export const reviewsService = {
  async listMine(userId: string) {
    return reviewRepo.listMine(db, userId);
  },

  async findForOrderProduct(userId: string, orderId: string, productId: string) {
    return reviewRepo.findForOrderProduct(db, userId, orderId, productId);
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
   * - تقييم واحد لكل منتج بكل طلب.
   */
  async submit(
    userId: string,
    input: {
      orderId: string;
      productId: string;
      rating: number;
      comment: string;
      photoUrl?: string | null;
    },
  ) {
    const order = await orderRepo.findById(db, input.orderId);
    if (!order || order.customer?.id !== userId) throw Errors.notFound('الطلب غير موجود');
    if (order.status !== 'COMPLETED') {
      throw Errors.badRequest('لا يمكن تقييم منتجات طلب لم يُستلم بعد', 'ORDER_NOT_COMPLETED');
    }
    // نافذة التقييم تُفتح بعد الاستلام بمهلة. الحارس هنا على الخادم لأن أي
    // مؤقّت في التطبيق يمكن تخطّيه بتغيير ساعة الجهاز أو باستدعاء مباشر.
    if (!order.ratingAvailable) {
      throw Errors.conflict(
        'التقييم يُفتح بعد يوم من استلام الطلب',
        'RATING_NOT_YET_AVAILABLE',
      );
    }

    const item = order.items.find((entry) => entry.productId === input.productId);
    if (!item) throw Errors.badRequest('هذا المنتج ليس ضمن الطلب', 'PRODUCT_NOT_IN_ORDER');

    const existing = await reviewRepo.findForOrderProduct(
      db,
      userId,
      input.orderId,
      input.productId,
    );
    if (existing) {
      throw Errors.conflict('سبق أن قيّمت هذا المنتج في هذا الطلب', 'REVIEW_EXISTS');
    }

    const photoUrl = await assertOwnedPhoto(input.photoUrl);

    const user = await userRepo.findById(db, userId);
    return reviewRepo.create(db, {
      userId,
      orderId: input.orderId,
      productId: input.productId,
      productName: item.productName,
      rating: input.rating,
      comment: input.comment,
      photoUrl,
      customerName: user?.username ?? 'عميل',
    });
  },

  /** تعديل تقييم مرفوض — المرفوض فقط قابل لإعادة الإرسال. */
  async resubmit(
    userId: string,
    reviewId: string,
    input: { rating: number; comment: string; photoUrl?: string | null },
  ) {
    const review = await reviewRepo.findById(db, reviewId);
    if (!review) throw Errors.notFound('التقييم غير موجود');
    if (review.user_id !== userId) throw Errors.forbidden();
    if (review.status !== 'rejected') {
      throw Errors.badRequest('لا يمكن تعديل تقييم غير مرفوض', 'REVIEW_NOT_REJECTED');
    }

    const updated = await reviewRepo.resubmit(db, reviewId, {
      rating: input.rating,
      comment: input.comment,
      photoUrl: await assertOwnedPhoto(input.photoUrl),
    });
    if (!updated) throw Errors.notFound('التقييم غير موجود');
    return updated;
  },

  // ── الإدارة ──

  async listForAdmin(filter: { status?: ReviewStatus; page: number; limit: number }) {
    return reviewRepo.listForAdmin(db, filter);
  },

  /**
   * قرار المراجعة. الاعتماد يمنح نقاط المجرّة (نقطة للتقييم، وخمس إن كان
   * مصحوباً بصورة) ويُنشئ إشعاراً؛ الرفض يسحب النقاط الممنوحة سابقاً.
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

      // إعادة تطبيق نفس القرار لا تُنتج آثاراً جانبية: النقاط يحميها فهرس
      // فريد، أما الإشعار فلا — فبدونه يتكرّر إشعار «نُشر تقييمك» مع كل ضغطة.
      const statusUnchanged = review.status === status;

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
        const withPhoto = Boolean(updated.photo_url && updated.photo_url.trim());
        // المبلغ يُقرأ لحظة الاعتماد ويُكتب في الدفتر؛ تغيير الإعداد لاحقاً
        // لا يعيد تسعير تقييم اعتُمد سابقاً.
        const points = await businessConfigService.current();
        await pointsRepo.award(client, {
          userId: updated.user_id,
          label: withPhoto ? 'تقييم مصوّر منشور' : 'تقييم منشور',
          amount: withPhoto
            ? points.points_review_with_photo
            : points.points_review_approved,
          reason: withPhoto ? 'review_with_photo' : 'review_approved',
          reviewId: updated.id,
        });
        await notificationRepo.create(client, {
          userId: updated.user_id,
          type: 'reviewApproved',
          title: 'نُشر تقييمك 🎉',
          body: `تقييمك لـ«${updated.product_name}» صار ظاهر للجميع. شكراً إلك.`,
          reviewId: updated.id,
          productId: updated.product_id,
        });
      } else {
        // سحب أي نقاط مُنحت سابقاً إن كان التقييم معتمداً ثم رُفض.
        await pointsRepo.revokeForReview(client, updated.id);
        await notificationRepo.create(client, {
          userId: updated.user_id,
          type: 'reviewRejected',
          title: 'تقييمك يحتاج تعديل',
          body: updated.rejection_reason ?? 'تكدر تعدّله وتعيد إرساله.',
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
