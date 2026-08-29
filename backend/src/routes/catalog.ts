import { Router } from 'express';
import { catalogController } from '../controllers/catalogController.js';
import { communityController } from '../controllers/communityController.js';
import { publicExtrasController } from '../controllers/publicExtrasController.js';

export const catalogRoutes = Router();

catalogRoutes.get('/home', catalogController.home);
catalogRoutes.get('/categories', catalogController.categories);
catalogRoutes.get('/governorates', catalogController.governorates);
catalogRoutes.get('/products', catalogController.products);
catalogRoutes.get('/products/search', catalogController.search);
catalogRoutes.get('/products/:id', catalogController.product);

// مناطق التوصيل داخل محافظة — يحتاجها الدفع قبل تسجيل الدخول للعرض.
catalogRoutes.get('/governorates/:governorateId/zones', publicExtrasController.zones);

// الأنمي/الامتيازات النشطة + منتجات كل امتياز.
catalogRoutes.get('/franchises', publicExtrasController.franchises);

// التقييمات المنشورة لمنتج + معرض صور المجتمع (بلا مصادقة).
catalogRoutes.get('/products/:productId/reviews', communityController.listProductReviews);
catalogRoutes.get('/community/photos', communityController.listCommunityPhotos);

// إعدادات المتجر العامة (روابط التواصل).
catalogRoutes.get('/settings', publicExtrasController.settings);
