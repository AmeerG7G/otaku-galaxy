import { db } from '../database/pool.js';
import { favoriteRepo } from '../repositories/favoritesRepo.js';
import { productRepo } from '../repositories/catalogRepo.js';
import { Errors } from '../utils/errors.js';

export const favoritesService = {
  async list(userId: string, page: number, limit: number) {
    return favoriteRepo.list(db, userId, page, limit);
  },

  async add(userId: string, productId: string) {
    const product = await productRepo.findById(db, productId);
    if (!product || !product.isActive) throw Errors.notFound('المنتج غير موجود');
    await favoriteRepo.add(db, userId, productId);
    return { productId, favorite: true };
  },

  async remove(userId: string, productId: string) {
    await favoriteRepo.remove(db, userId, productId);
    return { productId, favorite: false };
  },

  async isFavorite(userId: string, productId: string) {
    return favoriteRepo.isFavorite(db, userId, productId);
  },
};