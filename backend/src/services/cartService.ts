import { db } from '../database/pool.js';
import { cartRepo } from '../repositories/cartRepo.js';
import { productRepo } from '../repositories/catalogRepo.js';
import { Errors } from '../utils/errors.js';

export const cartService = {
  async getCart(userId: string) {
    return cartRepo.listItems(db, userId);
  },

  async addItem(userId: string, input: { productId: string; optionValue: string | null; quantity: number }) {
    const product = await productRepo.findById(db, input.productId);
    if (!product || !product.isActive) throw Errors.notFound('المنتج غير موجود');

    // تحقق من المخزون بعد الدمج مع ما هو موجود فعلاً.
    const existing = await cartRepo.listItems(db, userId);
    const merged = existing.find(
      (line) => line.productId === input.productId && line.optionValue === input.optionValue,
    );
    const requestedTotal = (merged?.quantity ?? 0) + input.quantity;

    const maxQty = Number(product.stock);
    if (maxQty === 0) throw Errors.conflict('هذا المنتج نفد من المخزون');
    if (requestedTotal > maxQty) {
      throw Errors.conflict(`الكمية المطلوبة تتجاوز المخزون المتاح (${maxQty})`);
    }

    const line = await cartRepo.upsertItem(db, userId, input);
    return { item: line, cart: await cartRepo.listItems(db, userId) };
  },

  async updateQuantity(userId: string, itemId: string, quantity: number) {
    const line = await cartRepo.findItem(db, userId, itemId);
    if (!line) throw Errors.notFound('العنصر غير موجود في العربة');
    if (quantity > line.stock) {
      throw Errors.conflict(`الكمية المطلوبة تتجاوز المخزون المتاح (${line.stock})`);
    }
    await cartRepo.updateQuantity(db, userId, itemId, quantity);
    return cartRepo.listItems(db, userId);
  },

  async removeItem(userId: string, itemId: string) {
    const ok = await cartRepo.removeItem(db, userId, itemId);
    if (!ok) throw Errors.notFound('العنصر غير موجود في العربة');
    return cartRepo.listItems(db, userId);
  },

  async clear(userId: string) {
    await cartRepo.clear(db, userId);
  },
};