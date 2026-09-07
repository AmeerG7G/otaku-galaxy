import type { RequestHandler } from 'express';
import { pushService } from '../services/pushService.js';
import { ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import {
  registerDeviceSchema,
  unregisterDeviceSchema,
} from '../validators/push.js';

/**
 * أجهزة الإشعارات الفورية — مسارات العميل.
 *
 * التوجيه يفرض `authenticate`، وكل عملية تعمل على `req.auth!.id` وحده:
 * لا مسار يقبل معرّف مستخدم من الجسم، فلا ملكية يمكن انتحالها.
 */
export const pushController = {
  register: (async (req, res) => {
    const input = parse(registerDeviceSchema, req.body);
    return ok(
      res,
      await pushService.registerDevice(req.auth!.id, input),
      'سُجّل الجهاز',
    );
  }) as RequestHandler,

  unregister: (async (req, res) => {
    const { token } = parse(unregisterDeviceSchema, req.body);
    return ok(
      res,
      await pushService.unregisterDevice(req.auth!.id, token),
      'أُلغي تسجيل الجهاز',
    );
  }) as RequestHandler,

  mine: (async (req, res) => {
    return ok(res, await pushService.myDevices(req.auth!.id));
  }) as RequestHandler,
};
