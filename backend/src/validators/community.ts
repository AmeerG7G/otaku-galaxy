import { z } from 'zod';
import { NOTIFICATION_TYPES, REVIEW_STATUSES } from '../types/index.js';
import { MEDIA_PURPOSES } from '../types/index.js';

// ── التقييمات ──

export const submitReviewSchema = z.object({
  orderId: z.string().uuid('معرّف طلب غير صالح'),
  productId: z.string().uuid('معرّف منتج غير صالح'),
  rating: z.coerce.number().int().min(1, 'التقييم من ١ إلى ٥').max(5, 'التقييم من ١ إلى ٥'),
  comment: z.string().trim().max(1000, 'التعليق طويل جداً').default(''),
  photoUrl: z.string().trim().max(500).nullish(),
});

/** فلترة صور المجتمع بقسم حقيقي — أي قيمة أخرى تُرفض ولا تُفلتر بصمت. */
export const communityPhotosQuerySchema = z.object({
  categoryId: z.string().uuid('معرّف قسم غير صالح').optional(),
});

export const resubmitReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).default(''),
  photoUrl: z.string().trim().max(500).nullish(),
});

export const reviewIdParamSchema = z.object({
  id: z.string().uuid('معرّف تقييم غير صالح'),
});

export const productIdParamSchema = z.object({
  productId: z.string().uuid('معرّف منتج غير صالح'),
});

export const findReviewQuerySchema = z.object({
  orderId: z.string().uuid('معرّف طلب غير صالح'),
  productId: z.string().uuid('معرّف منتج غير صالح'),
});

export const listReviewsAdminSchema = z.object({
  status: z.enum(REVIEW_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const moderateReviewSchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    rejectionReason: z.string().trim().max(300).optional(),
  })
  .refine(
    (value) => value.status !== 'rejected' || Boolean(value.rejectionReason?.trim()),
    { message: 'سبب الرفض مطلوب', path: ['rejectionReason'] },
  );

// ── المجموعات ──

export const collectionNameSchema = z.object({
  name: z.string().trim().min(1, 'اسم المجموعة مطلوب').max(60, 'الاسم طويل جداً'),
});

export const collectionIdParamSchema = z.object({
  id: z.string().uuid('معرّف مجموعة غير صالح'),
});

export const collectionProductParamSchema = z.object({
  id: z.string().uuid('معرّف مجموعة غير صالح'),
  productId: z.string().uuid('معرّف منتج غير صالح'),
});

export const collectionProductBodySchema = z.object({
  productId: z.string().uuid('معرّف منتج غير صالح'),
});

// ── الإشعارات ──

export const notificationIdParamSchema = z.object({
  id: z.string().uuid('معرّف إشعار غير صالح'),
});

export const createNotificationSchema = z.object({
  userId: z.string().uuid('معرّف مستخدم غير صالح'),
  type: z.enum(NOTIFICATION_TYPES).default('promotion'),
  title: z.string().trim().min(1, 'العنوان مطلوب').max(120),
  body: z.string().trim().max(500).default(''),
});

// ── عيد الميلاد ──

export const setBirthdaySchema = z.object({
  day: z.coerce.number().int().min(1, 'يوم غير صالح').max(31, 'يوم غير صالح'),
  month: z.coerce.number().int().min(1, 'شهر غير صالح').max(12, 'شهر غير صالح'),
});

// ── الوسائط ──

export const uploadPurposeSchema = z.object({
  purpose: z.enum(MEDIA_PURPOSES).default('review'),
});
