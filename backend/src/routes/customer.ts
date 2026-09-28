import { Router } from 'express';
import { cartController } from '../controllers/cartController.js';
import { communityController } from '../controllers/communityController.js';
import { favoritesController } from '../controllers/favoritesController.js';
import { mediaController } from '../controllers/mediaController.js';
import { notificationPrefsController } from '../controllers/notificationPrefsController.js';
import { orderController } from '../controllers/orderController.js';
import { restockController } from '../controllers/restockController.js';
import { config } from '../config/index.js';
import { uploadRateLimiter } from '../middleware/error-handler.js';
import { uploadSingleImage } from '../middleware/upload.js';
import { pushController } from '../controllers/pushController.js';

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
customerRoutes.get('/orders/checkout-quote', orderController.checkoutQuote);
customerRoutes.get('/orders/:id', orderController.getMine);
// [PRODUCT] لا إلغاء من العميل. القرار أن الإلغاء صلاحيةُ إدارةٍ وحدها،
// تمرّ عبر `PATCH /api/admin/orders/:id/status` بحالة `REJECTED` وسببٍ
// إلزامي. لا تُعِد هذا المسار: غيابُه هو الميزة.
customerRoutes.post('/orders/:id/confirm-receipt', orderController.confirmReceipt);

// ── التقييمات ──
customerRoutes.get('/reviews', communityController.listMyReviews);
customerRoutes.get('/reviews/find', communityController.findReview);
customerRoutes.post('/reviews', communityController.submitReview);
customerRoutes.patch('/reviews/:id', communityController.resubmitReview);

// ── نقاط المجرّة ──
customerRoutes.get('/points', communityController.pointsSummary);
// المطالبة بمزيّة مستوى — مرة واحدة لكل مستوى، ويحرسها قيد فريد في القاعدة.
customerRoutes.post('/points/rewards/:levelKey/claim', communityController.claimReward);

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
// قبل '/notifications/:id/read' حتى لا يلتقطه معرّف UUID (المسار قراءة GET
// ومسار القراءة POST، لكن الترتيب يبقى وقائياً بلا كلفة).
// أجهزة الإشعارات الفورية — الرمز يخصّ صاحب الجلسة دائماً.
customerRoutes.get('/devices', pushController.mine);
customerRoutes.post('/devices', pushController.register);
customerRoutes.post('/devices/unregister', pushController.unregister);
customerRoutes.get('/notifications/prefs', notificationPrefsController.get);
customerRoutes.patch('/notifications/prefs', notificationPrefsController.set);
customerRoutes.get('/notifications', communityController.listNotifications);
customerRoutes.post('/notifications/read-all', communityController.markAllNotificationsRead);
customerRoutes.post('/notifications/:id/read', communityController.markNotificationRead);

// ── «أخبرني عند توفره» ──
customerRoutes.get('/restock-subscriptions/mine', restockController.mine);
customerRoutes.post('/restock-subscriptions', restockController.subscribe);
customerRoutes.delete('/restock-subscriptions/:productId', restockController.unsubscribe);

// ── عيد الميلاد ──
customerRoutes.get('/birthday', communityController.birthdayStatus);
customerRoutes.post('/birthday', communityController.setBirthday);

// ── رفع صور التقييمات ──
customerRoutes.post(
  '/uploads',
  uploadRateLimiter({ limit: config.rateLimit.uploadMaxPerCustomer }),
  uploadSingleImage,
  mediaController.upload,
);
