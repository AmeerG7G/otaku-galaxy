import { Router } from 'express';
import { adminController } from '../controllers/adminController.js';
import { adminExtrasController } from '../controllers/adminExtrasController.js';
import { mediaController } from '../controllers/mediaController.js';
import { config } from '../config/index.js';
import { uploadRateLimiter } from '../middleware/error-handler.js';
import { uploadSingleImage } from '../middleware/upload.js';

/** مسارات الإدارة — تتطلب مصادقة + دور admin. */
export const adminRoutes = Router();

adminRoutes.get('/products', adminController.listProducts);
adminRoutes.post('/products', adminController.createProduct);
adminRoutes.patch('/products/:id', adminController.updateProduct);
adminRoutes.delete('/products/:id', adminController.deleteProduct);

adminRoutes.get('/categories', adminController.listCategories);
adminRoutes.post('/categories', adminController.createCategory);
adminRoutes.patch('/categories/:id', adminController.updateCategory);
adminRoutes.delete('/categories/:id', adminController.deleteCategory);
adminRoutes.post('/subcategories', adminController.createSubcategory);
adminRoutes.patch('/subcategories/:id', adminController.updateSubcategory);
adminRoutes.delete('/subcategories/:id', adminController.deleteSubcategory);

adminRoutes.get('/banners', adminController.listBanners);
adminRoutes.post('/banners', adminController.createBanner);
adminRoutes.patch('/banners/:id', adminController.updateBanner);
adminRoutes.delete('/banners/:id', adminController.deleteBanner);

// ── طلبات «أخبرني عند توفره» ──
adminRoutes.get('/restock/demand', adminController.restockDemand);

adminRoutes.get('/governorates', adminController.listGovernorates);
adminRoutes.post('/governorates', adminController.createGovernorate);
adminRoutes.patch('/governorates/:id', adminController.updateGovernorate);
adminRoutes.delete('/governorates/:id', adminController.deleteGovernorate);

adminRoutes.get('/orders', adminController.listOrders);
adminRoutes.get('/orders/:id', adminController.getOrder);
adminRoutes.patch('/orders/:id/status', adminController.updateOrderStatus);

// ── تذكير الاستلام (لكل طلب) ──
adminRoutes.patch('/orders/:id/reminder', adminController.rescheduleReminder);
adminRoutes.post('/orders/:id/reminder/send-now', adminController.sendReminderNow);

adminRoutes.get('/users', adminController.listUsers);

// ── نقاط المجرّة (قراءة فقط — لا تعديل يدوي للدفتر) ──
adminRoutes.get('/points/summary', adminController.pointsSummary);
adminRoutes.get('/customers/:id/points', adminController.customerPoints);

// ── قواعد نقاط المجرّة (قراءة فقط) ومزاياها ──
//
// [NOTE] حلّت هذه محل `/loyalty-levels` بأفعالها الأربعة. السلّم وقيم المنح
// قرار تجاري ثابت لا إعداد، فلا مسار يكتبه. ما بقي: قراءةُ القواعد، وإدارةُ
// الهدايا التي طالب بها الزبائن فعلاً.
adminRoutes.get('/galaxy-points/rules', adminExtrasController.galaxyPointsRules);
adminRoutes.get('/loyalty-rewards', adminExtrasController.listGiftClaims);
adminRoutes.post('/loyalty-rewards/:id/fulfil', adminExtrasController.fulfilGiftClaim);

// ── الإشعارات (قراءة فقط) ──
adminRoutes.get('/notifications/stats', adminController.notificationStats);
adminRoutes.get('/notifications', adminController.listNotifications);

adminRoutes.get('/customers/birthdays', adminController.listBirthdayCustomers);
adminRoutes.patch('/users/:id/active', adminController.setUserActive);

// ===== ملفّ الزبون وطلبات الحساب (إنشاء / إعادة تعيين) =====
//
// [CRITICAL] كل ما هنا خلف `authenticate` + `requireAdmin` المطبَّقين على
// الموجِّه كلّه (انظر أعلى الملف). لا نقطة عامة تفعّل حساباً أو تضع كلمة مرور.
adminRoutes.get('/customers/:id', adminController.customerDetail);
adminRoutes.patch('/customers/:id/password', adminController.setCustomerPassword);
adminRoutes.get('/account-requests', adminController.listAccountRequests);
adminRoutes.get('/account-requests/:id', adminController.accountRequestDetail);
adminRoutes.post('/account-requests/:id/approve', adminController.approveAccountRequest);
adminRoutes.post('/account-requests/:id/reject', adminController.rejectAccountRequest);

// ── أرقام لوحة التحكم ──
adminRoutes.get('/stats', adminExtrasController.dashboard);

// ── مراجعة التقييمات ──
adminRoutes.get('/reviews', adminExtrasController.listReviews);
adminRoutes.patch('/reviews/:id/moderate', adminExtrasController.moderateReview);

// ── الأنمي/الامتيازات ──
adminRoutes.get('/franchises', adminExtrasController.listFranchises);
adminRoutes.post('/franchises', adminExtrasController.createFranchise);
adminRoutes.patch('/franchises/:id', adminExtrasController.updateFranchise);
adminRoutes.delete('/franchises/:id', adminExtrasController.deleteFranchise);
adminRoutes.get('/products/:id/franchises', adminExtrasController.productFranchises);

// ── مناطق التوصيل ──
adminRoutes.get('/zones', adminExtrasController.listZones);
adminRoutes.get('/governorates/:governorateId/zones', adminExtrasController.listZonesForGovernorate);
adminRoutes.post('/zones', adminExtrasController.createZone);
adminRoutes.patch('/zones/:id', adminExtrasController.updateZone);
adminRoutes.delete('/zones/:id', adminExtrasController.deleteZone);

// ── إعدادات المتجر ──
adminRoutes.get('/settings', adminExtrasController.getSettings);
adminRoutes.patch('/settings', adminExtrasController.updateSettings);

// إعدادات نسخة التطبيق — إجبار التحديث يُضبط من هنا بلا نشر خادم.
adminRoutes.get('/settings/app-version', adminExtrasController.getAppVersionSettings);
adminRoutes.patch('/settings/app-version', adminExtrasController.updateAppVersionSettings);

// [NOTE] أُزيل `/settings/business` بفعليه. لم يبقَ إعداد أعمال رقمي: قيم
// نقاط المجرّة ونسبة خصم الميلاد قواعد ثابتة، ومهلة فتح التقييم أُلغيت.

// ── إشعار يدوي ──
adminRoutes.post('/notifications', adminExtrasController.createNotification);

// ── بثّ إشعار لجمهور (الكل / زبائن محدَّدون / شريحة) ──
adminRoutes.post('/notifications/broadcast', adminExtrasController.broadcastNotification);
adminRoutes.post('/notifications/audience', adminExtrasController.audiencePreview);

// [PRODUCT] لا «رسوم شخصيات» في اللوحة (2026-09-27، الهجرة 065): الشخصيات
// أصولٌ ثابتة في التطبيق يحدّدها الكود. لا تُعِد مسارات `/visual-slots`.

// ── رفع صور المنتجات والبنرات والأنمي ──
adminRoutes.post(
  '/uploads',
  uploadRateLimiter({ limit: config.rateLimit.uploadMaxPerAdmin }),
  uploadSingleImage,
  mediaController.upload,
);
