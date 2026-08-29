import type { RequestHandler } from 'express';
import { birthdayService } from '../services/birthdayService.js';
import { collectionsService } from '../services/collectionsService.js';
import { notificationsService } from '../services/notificationsService.js';
import { pointsService } from '../services/pointsService.js';
import { reviewsService } from '../services/reviewsService.js';
import { ok, created } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import {
  collectionIdParamSchema,
  collectionNameSchema,
  collectionProductBodySchema,
  collectionProductParamSchema,
  findReviewQuerySchema,
  notificationIdParamSchema,
  productIdParamSchema,
  resubmitReviewSchema,
  reviewIdParamSchema,
  setBirthdaySchema,
  submitReviewSchema,
  communityPhotosQuerySchema,
} from '../validators/community.js';

/** مسارات العميل للتقييمات والمجتمع والنقاط والمجموعات والإشعارات والميلاد. */
export const communityController = {
  // ── التقييمات ──

  listMyReviews: (async (req, res) => {
    return ok(res, await reviewsService.listMine(req.auth!.id));
  }) as RequestHandler,

  findReview: (async (req, res) => {
    const { orderId, productId } = parse(findReviewQuerySchema, req.query);
    const review = await reviewsService.findForOrderProduct(req.auth!.id, orderId, productId);
    return ok(res, review);
  }) as RequestHandler,

  submitReview: (async (req, res) => {
    const body = parse(submitReviewSchema, req.body);
    const review = await reviewsService.submit(req.auth!.id, {
      orderId: body.orderId,
      productId: body.productId,
      rating: body.rating,
      comment: body.comment,
      photoUrl: body.photoUrl ?? null,
    });
    return created(res, review, 'تم إرسال تقييمك للمراجعة');
  }) as RequestHandler,

  resubmitReview: (async (req, res) => {
    const { id } = parse(reviewIdParamSchema, req.params);
    const body = parse(resubmitReviewSchema, req.body);
    const review = await reviewsService.resubmit(req.auth!.id, id, {
      rating: body.rating,
      comment: body.comment,
      photoUrl: body.photoUrl ?? null,
    });
    return ok(res, review, 'تم إرسال التقييم مجدداً للمراجعة');
  }) as RequestHandler,

  // ── عام (بلا مصادقة) ──

  listProductReviews: (async (req, res) => {
    const { productId } = parse(productIdParamSchema, req.params);
    return ok(res, await reviewsService.listApprovedForProduct(productId));
  }) as RequestHandler,

  listCommunityPhotos: (async (req, res) => {
    const { categoryId } = parse(communityPhotosQuerySchema, req.query);
    return ok(res, await reviewsService.listCommunityPhotos(categoryId));
  }) as RequestHandler,

  // ── نقاط المجرّة ──

  pointsSummary: (async (req, res) => {
    return ok(res, await pointsService.summary(req.auth!.id));
  }) as RequestHandler,

  // ── المجموعات ──

  listCollections: (async (req, res) => {
    return ok(res, await collectionsService.listMine(req.auth!.id));
  }) as RequestHandler,

  createCollection: (async (req, res) => {
    const { name } = parse(collectionNameSchema, req.body);
    return created(res, await collectionsService.create(req.auth!.id, name), 'أُنشئت المجموعة');
  }) as RequestHandler,

  renameCollection: (async (req, res) => {
    const { id } = parse(collectionIdParamSchema, req.params);
    const { name } = parse(collectionNameSchema, req.body);
    return ok(res, await collectionsService.rename(req.auth!.id, id, name), 'تم تحديث الاسم');
  }) as RequestHandler,

  deleteCollection: (async (req, res) => {
    const { id } = parse(collectionIdParamSchema, req.params);
    return ok(res, await collectionsService.remove(req.auth!.id, id), 'حُذفت المجموعة');
  }) as RequestHandler,

  addCollectionProduct: (async (req, res) => {
    const { id } = parse(collectionIdParamSchema, req.params);
    const { productId } = parse(collectionProductBodySchema, req.body);
    return ok(res, await collectionsService.addProduct(req.auth!.id, id, productId));
  }) as RequestHandler,

  removeCollectionProduct: (async (req, res) => {
    const { id, productId } = parse(collectionProductParamSchema, req.params);
    return ok(res, await collectionsService.removeProduct(req.auth!.id, id, productId));
  }) as RequestHandler,

  // ── الإشعارات ──

  listNotifications: (async (req, res) => {
    return ok(res, await notificationsService.listMine(req.auth!.id));
  }) as RequestHandler,

  markNotificationRead: (async (req, res) => {
    const { id } = parse(notificationIdParamSchema, req.params);
    return ok(res, await notificationsService.markRead(req.auth!.id, id));
  }) as RequestHandler,

  markAllNotificationsRead: (async (req, res) => {
    return ok(res, await notificationsService.markAllRead(req.auth!.id));
  }) as RequestHandler,

  // ── عيد الميلاد ──

  birthdayStatus: (async (req, res) => {
    return ok(res, await birthdayService.status(req.auth!.id));
  }) as RequestHandler,

  setBirthday: (async (req, res) => {
    const { day, month } = parse(setBirthdaySchema, req.body);
    const status = await birthdayService.setBirthday(req.auth!.id, day, month);
    return ok(res, status, 'تم حفظ تاريخ ميلادك');
  }) as RequestHandler,
};
