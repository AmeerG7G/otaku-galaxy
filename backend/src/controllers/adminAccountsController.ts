import type { RequestHandler } from 'express';
import { adminAccountsService } from '../services/adminAccountsService.js';
import { created, noContent, ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import {
  adminAccountIdSchema,
  adminAuditQuerySchema,
  createSubAdminSchema,
  updateOwnAdminSchema,
  updateSubAdminSchema,
} from '../validators/adminAccounts.js';

/**
 * المسؤولون وسجلّ النشاط.
 *
 * كل فعلٍ هنا يكتب سجلّه بنفسه داخل معاملته، فيُعلَّم `auditHandled` كي لا
 * يكتب الوسيط العامّ (`auditAdminMutations`) صفاً ثانياً للفعل نفسه.
 */
export const adminAccountsController = {
  me: (async (req, res) => {
    return ok(res, await adminAccountsService.me(req.auth!));
  }) as RequestHandler,

  updateMe: (async (req, res) => {
    res.locals.auditHandled = true;
    const input = parse(updateOwnAdminSchema, req.body ?? {});
    const result = await adminAccountsService.updateOwn(req.auth!, input);
    return ok(res, result, 'حُفظ ملفّك');
  }) as RequestHandler,

  list: (async (_req, res) => {
    return ok(res, await adminAccountsService.list());
  }) as RequestHandler,

  create: (async (req, res) => {
    res.locals.auditHandled = true;
    const input = parse(createSubAdminSchema, req.body ?? {});
    return created(res, await adminAccountsService.create(req.auth!, input), 'أُنشئ المسؤول');
  }) as RequestHandler,

  update: (async (req, res) => {
    res.locals.auditHandled = true;
    const { id } = parse(adminAccountIdSchema, req.params);
    const input = parse(updateSubAdminSchema, req.body ?? {});
    return ok(res, await adminAccountsService.update(req.auth!, id, input), 'حُدّث المسؤول');
  }) as RequestHandler,

  remove: (async (req, res) => {
    res.locals.auditHandled = true;
    const { id } = parse(adminAccountIdSchema, req.params);
    await adminAccountsService.remove(req.auth!, id);
    return noContent(res);
  }) as RequestHandler,

  audit: (async (req, res) => {
    const query = parse(adminAuditQuerySchema, req.query);
    return ok(res, await adminAccountsService.audit(query));
  }) as RequestHandler,
};
