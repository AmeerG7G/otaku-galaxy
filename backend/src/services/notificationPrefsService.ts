import { db } from '../database/pool.js';
import {
  NOTIFICATION_PREF_KEYS,
  notificationPrefsRepo,
  type NotificationPrefKey,
} from '../repositories/notificationPrefsRepo.js';
import { Errors } from '../utils/errors.js';

/**
 * تفضيلات الإشعارات — مصدر الحقيقة على الخادم.
 *
 * كانت التفضيلات محلية على الجهاز فقط، فلا تنجو من إعادة التثبيت ولا
 * تعرفها بقية الأجهزة، وكانت الكتابة «أطلق وانسَ» لا تُظهِر فشلاً. اليوم
 * يقرأها التطبيق من هنا ويسجّل تغييراتها هنا، فيبقى كل جهاز مطابقاً
 * لاختيارات المستخدم مهما تغيّر.
 */
export const notificationPrefsService = {
  async get(userId: string) {
    const prefs = await notificationPrefsRepo.getAll(db, userId);
    return { prefs };
  },

  async set(userId: string, key: NotificationPrefKey, enabled: boolean) {
    if (!(NOTIFICATION_PREF_KEYS as readonly string[]).includes(key)) {
      throw Errors.badRequest('مفتاح تفضيل غير صالح');
    }
    await notificationPrefsRepo.set(db, userId, key, enabled);
    return this.get(userId);
  },
};