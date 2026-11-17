import type { RequestHandler } from 'express';
import { clientIp } from '../middleware/client-ip.js';
import { assertWhatsAppSignupEnabled, whatsappSignupService } from '../services/whatsappSignupService.js';
import { resolveLocale } from '../utils/locale.js';
import { created, ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import { whatsappCompleteSchema, whatsappStartSchema, whatsappStatusSchema } from '../validators/whatsappSignup.js';

/**
 * مسار التسجيل عبر واتساب — عامّ بلا جلسة. كل نقطةٍ عدا الخيارات تردّ ٤٠٤
 * `REGISTRATION_METHOD_UNAVAILABLE` حين `WHATSAPP_VERIFY_MODE=off`.
 * السرّ في **الجسم** لا في الرابط — الروابط تُسجَّل في سجلّات الوسطاء.
 */
export const whatsappSignupController = {
  options: ((_req, res) => ok(res, whatsappSignupService.options())) as RequestHandler,

  start: (async (req, res) => {
    // الوضع قبل التحقق من المدخلات: في `off` المسار غير موجود أياً كان الجسم.
    assertWhatsAppSignupEnabled();
    const input = parse(whatsappStartSchema, req.body);
    const result = await whatsappSignupService.start({
      phone: input.phone,
      ip: clientIp(req),
      locale: resolveLocale(req),
    });
    return created(res, result);
  }) as RequestHandler,

  status: (async (req, res) => {
    assertWhatsAppSignupEnabled();
    const input = parse(whatsappStatusSchema, req.body);
    return ok(res, await whatsappSignupService.status(input));
  }) as RequestHandler,

  complete: (async (req, res) => {
    assertWhatsAppSignupEnabled();
    const input = parse(whatsappCompleteSchema, req.body);
    const result = await whatsappSignupService.complete(input);
    return created(res, result, 'تم إنشاء حسابك');
  }) as RequestHandler,
};
