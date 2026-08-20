import { db, withTransaction } from '../database/pool.js';
import { cartRepo } from '../repositories/cartRepo.js';
import { productRepo } from '../repositories/catalogRepo.js';
import { governorateRepo } from '../repositories/storefrontRepo.js';
import { orderRepo, type OrderItemSnapshot } from '../repositories/orderRepo.js';
import { ORDER_STATUSES as ALL_ORDER_STATUSES } from '../types/order-status.js';
import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from '../types/index.js';
import { Errors } from '../utils/errors.js';

export const orderService = {
  /** إنشاء طلب: معاملة واحدة — تحقق المخزون، لقطات، إنشاء، تنزيل المخزون، تفريغ العربة. */
  async create(userId: string, input: { governorateId: string; fullAddress: string; phone: string }) {
    return withTransaction(async (tx) => {
      const governorate = await governorateRepo.listActive(tx);
      const selected = governorate.find((g) => g.id === input.governorateId);
      if (!selected) throw Errors.badRequest('المحافظة غير موجودة أو غير نشطة');

      const cartItems = await cartRepo.listItems(tx, userId);
      if (cartItems.length === 0) throw Errors.badRequest('العربة فارغة — أضف منتجات أولاً');

      const snapshots: OrderItemSnapshot[] = [];
      for (const item of cartItems) {
        const product = await productRepo.findById(tx, item.productId);
        if (!product || !product.isActive) {
          throw Errors.conflict(`«${item.productName}» لم يعد متاحاً — أزله من العربة`);
        }
        const maxQty = Number(product.stock);
        if (maxQty < item.quantity) {
          throw Errors.conflict(
            `مخزون «${item.productName}» غير كافٍ (المتاح: ${maxQty})`,
          );
        }
        snapshots.push({
          productId: product.id,
          productName: product.name,
          imageUrl: product.images[0] ?? null,
          optionValue: item.optionValue,
          price: product.price,
          quantity: item.quantity,
          lineTotal: product.price * item.quantity,
        });
      }

      const order = await orderRepo.create(tx, {
        userId,
        governorateId: input.governorateId,
        province: selected.name,
        deliveryFee: selected.deliveryFee,
        fullAddress: input.fullAddress,
        phone: input.phone,
        items: snapshots,
      });

      await cartRepo.clear(tx, userId);
      const created = await orderRepo.findById(tx, order.id);
      return created;
    });
  },

  async listMyOrders(userId: string, page: number, limit: number, status?: OrderStatus) {
    const [orders, statusCounts] = await Promise.all([
      orderRepo.listByUser(db, userId, page, limit, status),
      orderRepo.statusCounts(db, userId),
    ]);
    return { ...orders, statusCounts };
  },

  async getMyOrder(userId: string, orderId: string) {
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');
    if (order.customer?.id !== userId) throw Errors.forbidden();
    return order;
  },

  async cancelOrder(userId: string, orderId: string) {
    const order = await orderRepo.findById(db, orderId);
    if (!order || order.customer?.id !== userId) throw Errors.notFound('الطلب غير موجود');
    if (order.status !== 'PENDING_ADMIN_CONFIRMATION' && order.status !== 'CONFIRMED') {
      throw Errors.conflict('لا يمكن إلغاء طلب في هذه المرحلة');
    }
    await orderRepo.updateStatus(db, order.id, 'REJECTED', 'أُلغي من قبل العميل', userId);
    // استرجاع المخزون عند الإلغاء.
    await withTransaction(async (tx) => {
      for (const item of order.items) {
        await tx.query('UPDATE products SET stock = stock + $2 WHERE id = $1', [
          item.productId,
          item.quantity,
        ]);
      }
    });
    return orderRepo.findById(db, order.id);
  },

  async adminList(page: number, limit: number, status?: OrderStatus) {
    const [orders, statusCounts] = await Promise.all([
      orderRepo.listAll(db, page, limit, status),
      orderRepo.statusCounts(db),
    ]);
    return { ...orders, statusCounts };
  },

  async adminGet(orderId: string) {
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');
    return order;
  },

  /** تحديث حالة الطلب مع التحقق من الانتقال المسموح به. */
  async adminUpdateStatus(adminId: string, orderId: string, input: { status: OrderStatus; note?: string }) {
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');

    const allowed = ORDER_STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(input.status) && order.status !== input.status) {
      throw Errors.conflict(`غير مسموح بالانتقال من ${order.status} إلى ${input.status}`);
    }

    const isRejection = input.status === 'REJECTED';
    await withTransaction(async (tx) => {
      await orderRepo.updateStatus(tx, order.id, input.status, input.note ?? null, adminId);
      if (isRejection) {
        // استرجاع المخزون المحجوز عند الرفض.
        for (const item of order.items) {
          await tx.query('UPDATE products SET stock = stock + $2 WHERE id = $1', [
            item.productId,
            item.quantity,
          ]);
        }
      }
    });
    return orderRepo.findById(db, order.id);
  },
};

// يضمن تصدير القيم للاستخدام في الواجهات والاختبارات.
export { ALL_ORDER_STATUSES as ORDER_STATUSES };