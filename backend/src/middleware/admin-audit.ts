import type { NextFunction, Request, Response } from 'express';
import { db } from '../database/pool.js';
import { adminAuditRepo, fieldNames } from '../repositories/adminAuditRepo.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * سجلّ عامّ لكل فعلٍ إداري ناجح يغيّر شيئاً — ليرى المسؤول الأعلى ما فعله
 * الفرعيون في كل قسم، لا في إدارة المسؤولين وحدها.
 *
 * يُكتب بعد انتهاء الردّ (`finish`) ولنجاحه وحده (< 400): الفعل المرفوض لم
 * يغيّر شيئاً. المسجَّل: نمط المسار، والمعرّف المستهدف، و**أسماء الحقول**
 * المرسَلة بلا قيمها — فلا يحمل السجلّ محتوى منتجٍ ولا كلمة مرور زبون.
 *
 * [NOTE] الأفعال ذات السجلّ الدلالي (إدارة المسؤولين، الإعدادات، حذف أنمي)
 * تكتب صفّها داخل معاملتها وتعلّم `res.locals.auditHandled`، فيتخطّاها هذا
 * الوسيط. وفشلُ الكتابة هنا يُسجَّل ولا يُفشل طلباً أُجيب أصلاً.
 */
export function auditAdminMutations(req: Request, res: Response, next: NextFunction) {
  if (READ_METHODS.has(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode >= 400 || res.locals.auditHandled) return;
    const actorId = req.auth?.id;
    const routePath: string | undefined = req.route?.path;
    if (!actorId || !routePath) return;
    const param = req.params?.id ?? req.params?.governorateId;
    const targetId = typeof param === 'string' ? param : null;
    adminAuditRepo
      .record(db, {
        actorId,
        action: `${req.method} ${routePath}`,
        targetType: routePath.split('/')[1] ?? null,
        targetId,
        details: { fields: fieldNames(req.body) },
      })
      .catch((error: unknown) => {
        console.error('[admin-audit] failed to record mutation', { action: `${req.method} ${routePath}`, error });
      });
  });
  return next();
}
