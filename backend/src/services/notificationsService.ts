import { db } from '../database/pool.js';
import { notificationRepo } from '../repositories/notificationsRepo.js';
import { Errors } from '../utils/errors.js';

export const notificationsService = {
  async listMine(userId: string) {
    const [items, unread] = await Promise.all([
      notificationRepo.listMine(db, userId),
      notificationRepo.countUnread(db, userId),
    ]);
    return { items, unread };
  },

  async markRead(userId: string, id: string) {
    const updated = await notificationRepo.markRead(db, userId, id);
    // إعادة تعليم إشعار مقروء ليست خطأ، لكن إشعار شخص آخر غير موجود لهذا المستخدم.
    if (!updated) {
      const unread = await notificationRepo.countUnread(db, userId);
      return { id, unread };
    }
    return { id, unread: await notificationRepo.countUnread(db, userId) };
  },

  async markAllRead(userId: string) {
    const count = await notificationRepo.markAllRead(db, userId);
    return { updated: count, unread: 0 };
  },

  /** إنشاء إشعار يدوي من لوحة التحكم (إعلان/عرض). */
  async createForUser(input: {
    userId: string;
    title: string;
    body: string;
  }) {
    if (!input.title.trim()) throw Errors.badRequest('العنوان مطلوب');
    return notificationRepo.create(db, {
      userId: input.userId,
      type: 'promotion',
      title: input.title,
      body: input.body,
    });
  },
};
