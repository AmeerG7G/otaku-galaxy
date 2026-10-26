import { db } from '../database/pool.js';
import {
  deviceTokenRepo,
  type DevicePlatform,
} from '../repositories/deviceTokenRepo.js';
import { adminPushRepo } from '../repositories/adminPushRepo.js';
import { Errors } from '../utils/errors.js';

/**
 * أجهزة الزبون لإشعارات الهاتف.
 *
 * [CRITICAL] الدفع **إضافة** فوق سجلّ الإشعارات داخل التطبيق، لا بديل عنه،
 * ولا يحدث هنا: كل سجلٍّ في `notifications` يضع صفّه في `push_outbox`
 * (زناد الهجرة ٠٧٠) وترسله `jobs/pushOutboxJob.ts` خارج الطلبات.
 */
export const pushService = {
  /** تسجيل جهاز — المستخدم من سياق المصادقة لا من الطلب. */
  async registerDevice(
    userId: string,
    input: { token: string; platform: DevicePlatform },
  ) {
    // [SECURITY] رمزُ جهاز مسؤولٍ فعّال لا يُسجَّل جهازَ زبون: لا يُنقل منه
    // ولا يُضاعَف، فلا يصل إشعارُ زبونٍ متصفّحَ اللوحة ولا يُطفأ جهاز المسؤول.
    if (await adminPushRepo.isActiveAdminToken(db, input.token)) {
      throw Errors.conflict('هذا الجهاز مسجَّل للوحة التحكم', 'DEVICE_TOKEN_TAKEN');
    }
    const result = await deviceTokenRepo.register(db, {
      userId,
      token: input.token,
      platform: input.platform,
    });
    return { registered: true, created: result.created };
  },

  async unregisterDevice(userId: string, token: string) {
    const removed = await deviceTokenRepo.deactivate(db, userId, token);
    return { unregistered: removed };
  },

  async myDevices(userId: string) {
    return deviceTokenRepo.listMine(db, userId);
  },
};
