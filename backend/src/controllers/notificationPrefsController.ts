import type { RequestHandler } from 'express';
import { notificationPrefsService } from '../services/notificationPrefsService.js';
import { ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import { notificationPrefSchema } from '../validators/community.js';

/**
 * تفضيلات الإشعارات — قراءة وحفظ على الخادم.
 *
 * `GET` يعيد الافتراضات المدمجة مع ما خزّنه المستخدم فعلاً؛ `PATCH`
 * يحدّث مفتاحاً واحداً (زر مبدل واحد في الشاشة) ويعيد الحالة الكاملة
 * بعدها كي يعكس الواجهة المصدر دون إعادة جلب.
 */
export const notificationPrefsController = {
  get: (async (req, res) => {
    return ok(res, await notificationPrefsService.get(req.auth!.id));
  }) as RequestHandler,

  set: (async (req, res) => {
    const { key, enabled } = parse(notificationPrefSchema, req.body);
    return ok(
      res,
      await notificationPrefsService.set(req.auth!.id, key, enabled),
      'حُفظ التفضيل',
    );
  }) as RequestHandler,
};