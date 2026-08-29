import type pg from 'pg';
import { db } from '../database/pool.js';
import { pointsRepo } from '../repositories/pointsRepo.js';
import { businessConfigService } from './businessConfigService.js';

export const pointsService = {
  async summary(userId: string) {
    const [balance, activity] = await Promise.all([
      pointsRepo.balance(db, userId),
      pointsRepo.listActivity(db, userId),
    ]);
    return { balance, activity };
  },

  async balance(userId: string) {
    return pointsRepo.balance(db, userId);
  },

  async activity(userId: string) {
    return pointsRepo.listActivity(db, userId);
  },

  /**
   * نقاط استلام الطلب. تُستدعى عند انتقال الطلب إلى COMPLETED؛ الفهرس
   * الفريد (user_id, order_id) يضمن عدم المنح مرتين لنفس الطلب.
   */
  async awardOrderReceived(
    client: pg.Pool | pg.PoolClient,
    userId: string,
    orderId: string,
  ) {
    return pointsRepo.award(client, {
      userId,
      label: 'استلام طلب',
      // المبلغ المعمول به لحظة المنح — يُكتب في الدفتر ولا يُعاد حسابه أبداً.
      amount: await businessConfigService.value('points_order_received'),
      reason: 'order_received',
      orderId,
    });
  },
};
