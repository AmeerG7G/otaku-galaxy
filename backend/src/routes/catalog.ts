import { Router } from 'express';
import { catalogController } from '../controllers/catalogController.js';

export const catalogRoutes = Router();

catalogRoutes.get('/home', catalogController.home);
catalogRoutes.get('/categories', catalogController.categories);
catalogRoutes.get('/governorates', catalogController.governorates);
catalogRoutes.get('/products', catalogController.products);
catalogRoutes.get('/products/search', catalogController.search);
catalogRoutes.get('/products/:id', catalogController.product);