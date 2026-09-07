import { db } from '../database/pool.js';
import {
  deviceTokenRepo,
  type DevicePlatform,
} from '../repositories/deviceTokenRepo.js';
import { pushProvider, type PushResult } from './push/index.js';

/**
 * إيصال الإشعار إلى نظام الهاتف.
 *
 * [CRITICAL] هذه الطبقة **إضافة** فوق سجلّ الإشعارات داخل التطبيق، لا بديل
 * عنه. السجلّ في `notifications` هو ما يقرؤه الزبون في شاشته ويبقى مصدر
 * الحقيقة؛ الدفع مجرّد تنبيهٍ عابر قد يفشل. لذلك يُكتب السجلّ أولاً ثم
 * يُحاوَل الدفع — وفشلُ الدفع لا يُلغي السجلّ ولا يُفشل العملية.
 */
export const pushService = {
  /** تسجيل جهاز — المستخدم من سياق المصادقة لا من الطلب. */
  async registerDevice(
    userId: string,
    input: { token: string; platform: DevicePlatform },
  ) {
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

  /**
   * دفع إشعار إلى كل أجهزة مجموعة مستخدمين.
   *
   * لا يرمي أبداً: يُستدعى بعد كتابة سجلّ الإشعار، ورميُه هنا كان سيُفشل
   * عمليةً نجحت فعلاً (الزبون سيرى الإشعار في التطبيق على أي حال).
   *
   * الرموز التي يرفضها المزوّد تُعطَّل فوراً، فلا نعيد محاولتها كل مرة
   * ونتراكم على أجهزة ميتة.
   */
  async pushToUsers(input: {
    userIds: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<PushResult & { deactivated: number }> {
    try {
      const tokens = await deviceTokenRepo.activeTokensFor(db, input.userIds);
      if (tokens.length === 0) {
        return { sent: 0, invalidTokens: [], deactivated: 0 };
      }

      const result = await pushProvider().send({
        tokens,
        title: input.title,
        body: input.body,
        ...(input.data ? { data: input.data } : {}),
      });

      const deactivated = await deviceTokenRepo.deactivateTokens(
        db,
        result.invalidTokens,
      );
      return { ...result, deactivated };
    } catch (error) {
      // المزوّد غير مضبوط أو الشبكة مقطوعة: يُسجَّل ولا يُبتلع صامتاً، ولا
      // يُفشل الإشعار داخل التطبيق.
      console.error('[push] تعذّر الإرسال:', error);
      return { sent: 0, invalidTokens: [], deactivated: 0 };
    }
  },
};
