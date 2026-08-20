import { Router } from 'express';
import { cartController } from '../controllers/cartController.js';
import { favoritesController } from '../controllers/favoritesController.js';
import { orderController } from '../controllers/orderController.js';

/** مسارات العميل المسجّل: مفضلة + عربة + طلبات. */
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
customerRoutes.get('/orders/:id', orderController.getMine);
customerRoutes.post('/orders/:id/cancel', orderController.cancel);