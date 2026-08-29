import { Router } from 'express';
import { adminController } from '../controllers/adminController.js';
import { adminExtrasController } from '../controllers/adminExtrasController.js';
import { mediaController } from '../controllers/mediaController.js';
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

// ── الإشعارات (قراءة فقط) ──
adminRoutes.get('/notifications/stats', adminController.notificationStats);
adminRoutes.get('/notifications', adminController.listNotifications);

adminRoutes.get('/customers/birthdays', adminController.listBirthdayCustomers);
adminRoutes.patch('/users/:id/active', adminController.toggleUserActive);

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

// ── إعدادات الأعمال (قيم تجارية — لا أمنية) ──
adminRoutes.get('/settings/business', adminExtrasController.getBusinessSettings);
adminRoutes.patch('/settings/business', adminExtrasController.updateBusinessSettings);

// ── إشعار يدوي ──
adminRoutes.post('/notifications', adminExtrasController.createNotification);

// ── رفع صور المنتجات والبنرات والأنمي ──
adminRoutes.post('/uploads', uploadSingleImage, mediaController.upload);
