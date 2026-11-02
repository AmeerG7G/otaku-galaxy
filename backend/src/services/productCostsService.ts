import { db, withTransaction } from '../database/pool.js';
import { adminAuditRepo } from '../repositories/adminAuditRepo.js';
import { productCostsRepo } from '../repositories/productCostsRepo.js';
import { Errors } from '../utils/errors.js';

/**
 * تكلفة الشراء من اللوحة (D1) — للمسؤول الأعلى وحده.
 *
 * التكلفة تكشف هامش الربح، فلا يراها ولا يكتبها إلا الأعلى. كل إدخالٍ صفٌّ جديد
 * يسري على الطلبات التي تُقبل **بعده**؛ الطلبات المقبولة سابقاً تحتفظ بلقطتها.
 */
export const productCostsService = {
  async list(productId: string) {
    const product = await db.query<{ id: string; name: string }>(
      'SELECT id, name FROM products WHERE id = $1',
      [productId],
    );
    if (!product.rows[0]) throw Errors.notFound('المنتج غير موجود');
    const entries = await productCostsRepo.listForProduct(db, productId);
    return {
      productId,
      productName: product.rows[0].name,
      current: entries[0] ?? null,
      entries,
    };
  },

  async add(productId: string, actorId: string, input: { unitCost: number; note?: string }) {
    return withTransaction(async (tx) => {
      const product = await tx.query<{ name: string }>('SELECT name FROM products WHERE id = $1', [productId]);
      if (!product.rows[0]) throw Errors.notFound('المنتج غير موجود');
      const note = input.note?.trim() || null;
      const entry = await productCostsRepo.add(tx, { productId, unitCost: input.unitCost, enteredBy: actorId, note });
      await adminAuditRepo.record(tx, {
        actorId,
        action: 'product.cost_entry_added',
        targetType: 'product',
        targetId: productId,
        details: { productName: product.rows[0].name, unitCost: entry.unitCost, ...(note ? { note } : {}) },
      });
      return entry;
    });
  },
};
