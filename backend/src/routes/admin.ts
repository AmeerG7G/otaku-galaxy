import { Router } from 'express';
import { adminAccountsController } from '../controllers/adminAccountsController.js';
import { adminController } from '../controllers/adminController.js';
import { adminExtrasController } from '../controllers/adminExtrasController.js';
import { adminPushController } from '../controllers/adminPushController.js';
import { mediaController } from '../controllers/mediaController.js';
import { config } from '../config/index.js';
import { auditAdminMutations } from '../middleware/admin-audit.js';
import {
  requireAnyAdmin,
  requirePermission as can,
  requireSuperAdmin,
} from '../middleware/auth.js';
import { authRateLimiter, uploadRateLimiter } from '../middleware/error-handler.js';
import { uploadSingleImage } from '../middleware/upload.js';

/**
 * مسارات الإدارة — تتطلب مصادقة + دور admin (على الموجِّه كلّه في `app.ts`)،
 * ثم **صلاحية القسم** على كل مسار.
 *
 * [SECURITY] كل سطرٍ هنا يحمل حارسه صراحةً بعد المسار مباشرةً: `can(...)`
 * لقسمٍ أو أكثر، أو `requireSuperAdmin`، أو `requireAnyAdmin` لما يخصّ
 * المسؤول نفسه. حارسُ المصدر في `admin-permissions.test.ts` يسقط إن وُجد
 * مسارٌ بلا واحدٍ منها، ويقارن الخريطة كلها بجدولٍ مثبَّت — توسيعُ صلاحية
 * مسارٍ قرارٌ يُكتب في الاختبار لا تعديلٌ يمرّ صامتاً.
 *
 * القاعدة: **الكتابة** لقسمها وحده. **القراءات المرجعية** مشتركة مع النماذج
 * التي تحتاجها (قائمة الأقسام لنموذج المنتج، قائمة المنتجات لوجهة البنر).
 * وحيث كانت صفحةٌ تكتب عبر مسار قسمٍ آخر أُعطيت مساراً ضيّقاً بحقولها وحدها
 * (`/offers/:id`، `/restock/:id/schedule`) بدل توسيع المسار العامّ.
 */
export const adminRoutes = Router();

// سجلّ نشاطٍ عامّ لكل فعلٍ ناجح يغيّر شيئاً — انظر `middleware/admin-audit.ts`.
adminRoutes.use(auditAdminMutations);

// ── المسؤول نفسه وإدارة المسؤولين ──
adminRoutes.get('/me', requireAnyAdmin, adminAccountsController.me);
adminRoutes.patch('/me', can('admins'), authRateLimiter(), adminAccountsController.updateMe);
adminRoutes.get('/admins', requireSuperAdmin, adminAccountsController.list);
adminRoutes.post('/admins', requireSuperAdmin, adminAccountsController.create);
adminRoutes.patch('/admins/:id', requireSuperAdmin, adminAccountsController.update);
adminRoutes.delete('/admins/:id', requireSuperAdmin, adminAccountsController.remove);
adminRoutes.get('/audit', requireSuperAdmin, adminAccountsController.audit);

// ── إشعارات هاتف المسؤول (أجهزته وتفضيلاته — له وحده) ──
adminRoutes.get('/push/status', requireAnyAdmin, adminPushController.status);
adminRoutes.post('/devices', requireAnyAdmin, adminPushController.registerDevice);
adminRoutes.post('/devices/unregister', requireAnyAdmin, adminPushController.unregisterDevice);
adminRoutes.get('/notification-prefs', requireAnyAdmin, adminPushController.prefs);
adminRoutes.patch('/notification-prefs', requireAnyAdmin, adminPushController.setPref);

adminRoutes.get('/products', can('products', 'offers', 'banners'), adminController.listProducts);
adminRoutes.post('/products', can('products'), adminController.createProduct);
adminRoutes.patch('/products/:id', can('products'), adminController.updateProduct);
adminRoutes.delete('/products/:id', can('products'), adminController.deleteProduct);
adminRoutes.patch('/offers/:id', can('offers', 'products'), adminController.updateOfferFlags);

adminRoutes.get('/categories', can('categories', 'products', 'banners'), adminController.listCategories);
adminRoutes.post('/categories', can('categories'), adminController.createCategory);
adminRoutes.patch('/categories/:id', can('categories'), adminController.updateCategory);
adminRoutes.delete('/categories/:id', can('categories'), adminController.deleteCategory);
adminRoutes.post('/subcategories', can('categories'), adminController.createSubcategory);
adminRoutes.patch('/subcategories/:id', can('categories'), adminController.updateSubcategory);
adminRoutes.delete('/subcategories/:id', can('categories'), adminController.deleteSubcategory);

adminRoutes.get('/banners', can('banners'), adminController.listBanners);
adminRoutes.post('/banners', can('banners'), adminController.createBanner);
adminRoutes.patch('/banners/:id', can('banners'), adminController.updateBanner);
adminRoutes.delete('/banners/:id', can('banners'), adminController.deleteBanner);

// ── طلبات «أخبرني عند توفره» ──
adminRoutes.get('/restock/demand', can('restock'), adminController.restockDemand);
adminRoutes.patch('/restock/:id/schedule', can('restock', 'products'), adminController.scheduleRestock);

adminRoutes.get('/governorates', can('delivery'), adminController.listGovernorates);
adminRoutes.post('/governorates', can('delivery'), adminController.createGovernorate);
adminRoutes.patch('/governorates/:id', can('delivery'), adminController.updateGovernorate);
adminRoutes.delete('/governorates/:id', can('delivery'), adminController.deleteGovernorate);

adminRoutes.get('/orders', can('orders', 'dashboard', 'notifications'), adminController.listOrders);
adminRoutes.get('/orders/:id', can('orders'), adminController.getOrder);
adminRoutes.patch('/orders/:id/status', can('orders'), adminController.updateOrderStatus);

// ── تذكير الاستلام (لكل طلب) ──
adminRoutes.patch('/orders/:id/reminder', can('orders', 'notifications'), adminController.rescheduleReminder);
adminRoutes.post('/orders/:id/reminder/send-now', can('orders', 'notifications'), adminController.sendReminderNow);

adminRoutes.get('/users', can('customers', 'notifications'), adminController.listUsers);

// ── نقاط المجرّة (قراءة فقط — لا تعديل يدوي للدفتر) ──
adminRoutes.get('/points/summary', can('points'), adminController.pointsSummary);
adminRoutes.get('/customers/:id/points', can('points', 'customers'), adminController.customerPoints);

// ── قواعد نقاط المجرّة (قراءة فقط) ومزاياها ──
//
// [NOTE] حلّت هذه محل `/loyalty-levels` بأفعالها الأربعة. السلّم وقيم المنح
// قرار تجاري ثابت لا إعداد، فلا مسار يكتبه. ما بقي: قراءةُ القواعد، وإدارةُ
// الهدايا التي طالب بها الزبائن فعلاً.
adminRoutes.get('/galaxy-points/rules', can('points'), adminExtrasController.galaxyPointsRules);
adminRoutes.get('/loyalty-rewards', can('points'), adminExtrasController.listGiftClaims);
adminRoutes.post('/loyalty-rewards/:id/fulfil', can('points'), adminExtrasController.fulfilGiftClaim);

// ── الإشعارات (قراءة فقط) ──
adminRoutes.get('/notifications/stats', can('notifications'), adminController.notificationStats);
adminRoutes.get('/notifications', can('notifications'), adminController.listNotifications);

adminRoutes.get('/customers/birthdays', can('birthdays'), adminController.listBirthdayCustomers);
adminRoutes.patch('/users/:id/active', can('customers'), adminController.setUserActive);

// ===== ملفّ الزبون وطلبات الحساب (إنشاء / إعادة تعيين) =====
//
// [CRITICAL] كل ما هنا خلف `authenticate` + `requireAdmin` المطبَّقين على
// الموجِّه كلّه (انظر أعلى الملف). لا نقطة عامة تفعّل حساباً أو تضع كلمة مرور.
// «طلبات الحساب» وحدها تحسم إعادة تعيينٍ **بطلبٍ معلَّق** فقط — يفرضه
// `adminService.setCustomerPassword` (`requireRequest`).
adminRoutes.get('/customers/:id', can('customers'), adminController.customerDetail);
adminRoutes.patch('/customers/:id/password', can('customers', 'account_requests'), adminController.setCustomerPassword);
adminRoutes.get('/account-requests', can('account_requests'), adminController.listAccountRequests);
adminRoutes.get('/account-requests/:id', can('account_requests'), adminController.accountRequestDetail);
adminRoutes.post('/account-requests/:id/approve', can('account_requests'), adminController.approveAccountRequest);
adminRoutes.post('/account-requests/:id/reject', can('account_requests'), adminController.rejectAccountRequest);

// ── أرقام لوحة التحكم ──
adminRoutes.get('/stats', can('dashboard'), adminExtrasController.dashboard);

// ── مراجعة التقييمات ──
adminRoutes.get('/reviews', can('reviews'), adminExtrasController.listReviews);
adminRoutes.patch('/reviews/:id/moderate', can('reviews'), adminExtrasController.moderateReview);

// ── الأنمي/الامتيازات ──
adminRoutes.get('/franchises', can('franchises', 'products'), adminExtrasController.listFranchises);
adminRoutes.post('/franchises', can('franchises'), adminExtrasController.createFranchise);
adminRoutes.patch('/franchises/:id', can('franchises'), adminExtrasController.updateFranchise);
adminRoutes.get('/franchises/:id/usage', can('franchises'), adminExtrasController.franchiseUsage);
adminRoutes.delete('/franchises/:id', can('franchises'), adminExtrasController.deleteFranchise);
adminRoutes.get('/products/:id/franchises', can('products', 'franchises'), adminExtrasController.productFranchises);

// ── مناطق التوصيل ──
adminRoutes.get('/zones', can('delivery'), adminExtrasController.listZones);
adminRoutes.get('/governorates/:governorateId/zones', can('delivery'), adminExtrasController.listZonesForGovernorate);
adminRoutes.post('/zones', can('delivery'), adminExtrasController.createZone);
adminRoutes.patch('/zones/:id', can('delivery'), adminExtrasController.updateZone);
adminRoutes.delete('/zones/:id', can('delivery'), adminExtrasController.deleteZone);

// ── إعدادات المتجر ──
adminRoutes.get('/settings', can('settings'), adminExtrasController.getSettings);
adminRoutes.patch('/settings', can('settings'), adminExtrasController.updateSettings);

// إعدادات نسخة التطبيق — إجبار التحديث يُضبط من هنا بلا نشر خادم.
adminRoutes.get('/settings/app-version', can('settings'), adminExtrasController.getAppVersionSettings);
adminRoutes.patch('/settings/app-version', can('settings'), adminExtrasController.updateAppVersionSettings);

// [NOTE] أُزيل `/settings/business` بفعليه. لم يبقَ إعداد أعمال رقمي: قيم
// نقاط المجرّة ونسبة خصم الميلاد قواعد ثابتة، ومهلة فتح التقييم أُلغيت.

// ── إشعار يدوي ──
adminRoutes.post('/notifications', can('notifications'), adminExtrasController.createNotification);

// ── بثّ إشعار لجمهور (الكل / زبائن محدَّدون / شريحة) ──
adminRoutes.post('/notifications/broadcast', can('notifications'), adminExtrasController.broadcastNotification);
adminRoutes.post('/notifications/audience', can('notifications'), adminExtrasController.audiencePreview);

// [PRODUCT] لا «رسوم شخصيات» في اللوحة (2026-09-27، الهجرة 065): الشخصيات
// أصولٌ ثابتة في التطبيق يحدّدها الكود. لا تُعِد مسارات `/visual-slots`.

// ── رفع صور المنتجات والبنرات ──
// الحارس قبل حدّ المعدّل والرفع: من لا يملك القسم لا يستهلك حصّةً ولا قرصاً.
adminRoutes.post(
  '/uploads',
  can('products', 'banners'),
  uploadRateLimiter({ limit: config.rateLimit.uploadMaxPerAdmin }),
  uploadSingleImage,
  mediaController.upload,
);
