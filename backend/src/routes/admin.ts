import { Router } from 'express';
import { adminController } from '../controllers/adminController.js';

/** مسارات الإدارة — تتطلب مصادقة + دور admin. */
export const adminRoutes = Router();

adminRoutes.get('/products', adminController.listProducts);
adminRoutes.post('/products', adminController.createProduct);
adminRoutes.patch('/products/:id', adminController.updateProduct);
adminRoutes.delete('/products/:id', adminController.deleteProduct);

adminRoutes.get('/categories', adminController.listCategories);
adminRoutes.post('/categories', adminController.createCategory);
adminRoutes.patch('/categories/:id', adminController.updateCategory);
adminRoutes.post('/subcategories', adminController.createSubcategory);

adminRoutes.get('/banners', adminController.listBanners);
adminRoutes.post('/banners', adminController.createBanner);
adminRoutes.patch('/banners/:id', adminController.updateBanner);
adminRoutes.delete('/banners/:id', adminController.deleteBanner);

adminRoutes.get('/governorates', adminController.listGovernorates);
adminRoutes.post('/governorates', adminController.createGovernorate);
adminRoutes.patch('/governorates/:id', adminController.updateGovernorate);

adminRoutes.get('/orders', adminController.listOrders);
adminRoutes.get('/orders/:id', adminController.getOrder);
adminRoutes.patch('/orders/:id/status', adminController.updateOrderStatus);

adminRoutes.get('/users', adminController.listUsers);
adminRoutes.patch('/users/:id/active', adminController.toggleUserActive);