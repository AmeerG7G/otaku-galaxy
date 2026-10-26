import type pg from 'pg';
import { ADMIN_EVENT_TEXTS } from '../domain/adminEventTexts.js';
import { pushOutboxRepo } from '../repositories/pushOutboxRepo.js';

/**
 * أحداث الإدارة التي تصل هاتف المسؤول (STEP 64).
 *
 * تُستدعى **داخل معاملة الحدث**: طلبٌ تراجع لا يرنّ هاتفاً، وطلبٌ التُزم لا
 * يضيع تنبيهه. النصوص في `domain/adminEventTexts.ts`. `url` مسار اللوحة الذي
 * يفتحه النقر. من يستحقّ التنبيه (القسم، التفضيل، الجهاز) يقرّره
 * `enqueueAdminEvent`.
 */
export const adminEvents = {
  newOrder(tx: pg.PoolClient, order: { id: string; total: number; customer?: { name?: string | null } | null }) {
    return pushOutboxRepo.enqueueAdminEvent(tx, {
      event: 'new_order',
      ...ADMIN_EVENT_TEXTS.newOrder(order.customer?.name, order.total),
      data: { url: `/orders/${order.id}`, orderId: order.id },
    });
  },

  accountRequest(
    db: pg.Pool | pg.PoolClient,
    request: { id: string; kind: 'registration' | 'password_reset'; username: string; phone: string },
  ) {
    return pushOutboxRepo.enqueueAdminEvent(db, {
      event: 'account_request',
      ...ADMIN_EVENT_TEXTS.accountRequest(request.kind, request.username, request.phone),
      data: { url: '/account-requests', requestId: request.id },
    });
  },

  restockRequest(tx: pg.PoolClient, product: { id: string; name: string }) {
    return pushOutboxRepo.enqueueAdminEvent(tx, {
      event: 'restock_request',
      ...ADMIN_EVENT_TEXTS.restockRequest(product.name),
      data: { url: '/restock', productId: product.id },
    });
  },
};
