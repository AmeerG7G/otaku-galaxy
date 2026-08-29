import { Router } from 'express';
import { cartController } from '../controllers/cartController.js';
import { communityController } from '../controllers/communityController.js';
import { favoritesController } from '../controllers/favoritesController.js';
import { mediaController } from '../controllers/mediaController.js';
import { orderController } from '../controllers/orderController.js';
import { uploadSingleImage } from '../middleware/upload.js';

/**
 * مسارات العميل المسجّل: مفضلة + عربة + طلبات + تقييمات + نقاط
 * + مجموعات + إشعارات + عيد الميلاد. كل مسار هنا يعمل على بيانات
 * صاحب الجلسة فقط — الملكية تُتحقَّق في طبقة الخدمة.
 */
export const customerRoutes = Router();

customerRoutes.get('/favorites', favoritesController.list);
customerRoutes.post('/favorites', favoritesController.add);
customerRoutes.delete('/favorites/:productId', favoritesController.remove);

customerRoutes.get('/cart', cartController.get);
customerRoutes.post('/cart', cartController.add);
customerRoutes.patch('/cart/:id', cartController.updateQuantity);
customerRoutes.delete('/cart/:id', cartController.remove);

customerRoutes.post('/orders', orderController.create);
customerRoutes.get('/orders', orderController.listMine);
// قبل '/orders/:id' وإلا التقطه كمعرّف ورفضه التحقق كـUUID غير صالح.
customerRoutes.get('/orders/pending-confirmation', orderController.pendingConfirmation);
customerRoutes.get('/orders/:id', orderController.getMine);
customerRoutes.post('/orders/:id/cancel', orderController.cancel);
customerRoutes.post('/orders/:id/confirm-receipt', orderController.confirmReceipt);

// ── التقييمات ──
customerRoutes.get('/reviews', communityController.listMyReviews);
customerRoutes.get('/reviews/find', communityController.findReview);
customerRoutes.post('/reviews', communityController.submitReview);
customerRoutes.patch('/reviews/:id', communityController.resubmitReview);

// ── نقاط المجرّة ──
customerRoutes.get('/points', communityController.pointsSummary);

// ── المجموعات ──
customerRoutes.get('/collections', communityController.listCollections);
customerRoutes.post('/collections', communityController.createCollection);
customerRoutes.patch('/collections/:id', communityController.renameCollection);
customerRoutes.delete('/collections/:id', communityController.deleteCollection);
customerRoutes.post('/collections/:id/products', communityController.addCollectionProduct);
customerRoutes.delete(
  '/collections/:id/products/:productId',
  communityController.removeCollectionProduct,
);

// ── الإشعارات ──
customerRoutes.get('/notifications', communityController.listNotifications);
customerRoutes.post('/notifications/read-all', communityController.markAllNotificationsRead);
customerRoutes.post('/notifications/:id/read', communityController.markNotificationRead);

// ── عيد الميلاد ──
customerRoutes.get('/birthday', communityController.birthdayStatus);
customerRoutes.post('/birthday', communityController.setBirthday);

// ── رفع صور التقييمات ──
customerRoutes.post('/uploads', uploadSingleImage, mediaController.upload);
