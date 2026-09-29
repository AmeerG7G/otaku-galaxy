import type { RequestHandler } from 'express';
import { withTransaction, db } from '../database/pool.js';
import { adminPushRepo } from '../repositories/adminPushRepo.js';
import { pushStatus } from '../services/push/index.js';
import { ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import {
  adminNotificationPrefSchema,
  registerAdminDeviceSchema,
  unregisterDeviceSchema,
} from '../validators/push.js';

/**
 * إشعارات هاتف المسؤول — أجهزته وتفضيلاته، **له وحده**.
 *
 * [SECURITY] المعرّف من الجلسة دائماً؛ لا مسار يستقبل معرّف مسؤول. الأحداث
 * نفسها تُكتب في `push_outbox` ضمن معاملة الحدث (`pushOutboxRepo.enqueueAdminEvent`).
 */
export const adminPushController = {
  status: (async (req, res) => {
    const status = pushStatus();
    return ok(res, {
      configured: status.configured,
      provider: status.provider?.name ?? null,
      devices: await adminPushRepo.activeCount(db, req.auth!.id),
    });
  }) as RequestHandler,

  registerDevice: (async (req, res) => {
    res.locals.auditHandled = true; // شأنٌ شخصي للمسؤول لا تغييرٌ في المتجر
    const input = parse(registerAdminDeviceSchema, req.body ?? {});
    const result = await withTransaction((tx) =>
      adminPushRepo.register(tx, { userId: req.auth!.id, token: input.token, platform: input.platform }),
    );
    return ok(res, { registered: true, created: result.created }, 'فُعّلت الإشعارات على هذا الجهاز');
  }) as RequestHandler,

  unregisterDevice: (async (req, res) => {
    res.locals.auditHandled = true; // شأنٌ شخصي للمسؤول لا تغييرٌ في المتجر
    res.locals.auditHandled = true; // شأنٌ شخصي للمسؤول لا تغييرٌ في المتجر
    const { token } = parse(unregisterDeviceSchema, req.body ?? {});
    return ok(res, { unregistered: await adminPushRepo.unregister(db, req.auth!.id, token) });
  }) as RequestHandler,

  prefs: (async (req, res) => {
    return ok(res, { prefs: await adminPushRepo.prefs(db, req.auth!.id) });
  }) as RequestHandler,

  setPref: (async (req, res) => {
    res.locals.auditHandled = true; // شأنٌ شخصي للمسؤول لا تغييرٌ في المتجر
    const { key, enabled } = parse(adminNotificationPrefSchema, req.body ?? {});
    await adminPushRepo.setPref(db, req.auth!.id, key, enabled);
    return ok(res, { prefs: await adminPushRepo.prefs(db, req.auth!.id) }, 'حُفظ التفضيل');
  }) as RequestHandler,
};
