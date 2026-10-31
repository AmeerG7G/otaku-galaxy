import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { db, withTransaction } from '../database/pool.js';
import { accountDeletionRepo } from '../repositories/accountDeletionRepo.js';
import { analyticsPeriodsRepo } from '../repositories/analyticsPeriodsRepo.js';
import { userRepo } from '../repositories/userRepo.js';
import { storage } from '../storage/index.js';
import type { AuthUser } from '../types/index.js';
import { Errors } from '../utils/errors.js';

/** أبجدية Crockford (بلا I L O U) — مرجعٌ يُملى عبر واتساب بلا لبس. */
const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function newReference(): string {
  let body = '';
  for (let i = 0; i < 10; i += 1) body += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return `DEL-${body}`;
}

export interface AccountDeletionResult {
  reference: string;
  deletedAt: string;
  retainedOrders: number;
}

export const accountDeletionService = {
  /**
   * حذف الحساب بطلب صاحبه — فوري، في معاملة واحدة (STEP 78).
   *
   * ═══ التحقّق من الهوية ═══ لا رمز SMS ولا بريد في هذا المشروع (قرارٌ
   * أساسي). صاحب الحساب يثبت ملكيته بما تثبت به كل عملية حسّاسة أخرى:
   * جلسةٌ صالحة **و**كلمة المرور الآن (كتغيير كلمة المرور). الجلسة وحدها لا
   * تكفي — جهازٌ مفتوح في يد غيره لا يحذف الحساب. والمسار مقيَّد العدد
   * بالحساب (`accountDeletionRateLimiter`) فلا يصير بابَ تخمين لمن سرق جلسة.
   *
   * [CRITICAL] الحكم كله يُعاد تحت القفل: جلسةٌ أُبطلت (تغيير كلمة المرور،
   * إيقاف) أثناء الطلب لا تحذف شيئاً، وطلبٌ قيد التنفيذ يمنع الحذف — الدفع
   * عند الاستلام يعني أن التوصيل ما يزال يحتاج الرقم والعنوان.
   *
   * ما يُمحى وما يبقى: `accountDeletionRepo` (`ERASED_TABLES` / `RETAINED_TABLES`).
   */
  async deleteOwn(auth: AuthUser, input: { password: string; reason?: string | null }): Promise<AccountDeletionResult> {
    if (auth.role !== 'customer') {
      throw Errors.forbidden('حذف الحساب متاح لحسابات الزبائن فقط', 'ACCOUNT_DELETION_CUSTOMERS_ONLY');
    }

    const user = await userRepo.findById(db, auth.id);
    if (!user || user.role !== 'customer') throw Errors.unauthorized('الحساب غير موجود');
    // التجزئة قبل المعاملة: لا عمل bcrypt ثقيل داخل قفل الصفّ.
    // [CRITICAL] 400 لا 401 — خطأ إدخال لا رفضُ جلسة (انظر `changePassword`).
    if (!(await bcrypt.compare(input.password, user.password_hash))) {
      throw Errors.badRequest('كلمة المرور الحالية غير صحيحة', 'INVALID_CURRENT_PASSWORD');
    }

    const reason = input.reason?.trim() ? input.reason.trim() : null;

    const { result, mediaKeys } = await withTransaction(async (tx) => {
      const locked = await accountDeletionRepo.lockForDeletion(tx, auth.id);
      if (!locked || locked.role !== 'customer' || locked.phone === null) {
        throw Errors.unauthorized('الحساب غير موجود');
      }
      // كلمة مرورٍ تغيّرت أو جلسةٌ أُبطلت بين الفحص والقفل: لا حذف بإثباتٍ قديم.
      if (locked.password_hash !== user.password_hash || locked.token_version !== auth.sessionTokenVersion) {
        throw Errors.unauthorized('انتهت صلاحية الجلسة — سجّل الدخول من جديد', 'SESSION_REVOKED');
      }

      const orders = await accountDeletionRepo.orderCounts(tx, auth.id);
      if (orders.active > 0) {
        throw Errors.conflict(
          'لا يمكن حذف الحساب وله طلبٌ قيد التنفيذ — انتظر اكتماله أو تواصل مع الإدارة',
          'ACCOUNT_HAS_ACTIVE_ORDERS',
        );
      }

      const keys = await accountDeletionRepo.deletePersonalMedia(tx, auth.id);
      await accountDeletionRepo.erasePersonalRows(tx, auth.id, locked.phone);
      await accountDeletionRepo.tombstone(tx, auth.id);
      // الزبون خرج من «الزبائن» ومن نشاطه اليومي: أيام الشهر المفتوح المحسوبة تُعاد.
      await analyticsPeriodsRepo.markOpenMonthsDirty(tx);
      const row = await accountDeletionRepo.record(tx, {
        reference: newReference(),
        userId: auth.id,
        reason,
        retainedOrders: orders.total,
      });
      return {
        result: { reference: row.reference, deletedAt: row.deleted_at.toISOString(), retainedOrders: orders.total },
        mediaKeys: keys,
      };
    });

    // الملفات بعد الالتزام: حذفٌ تراجع لا يترك صوراً ممحوّة لحسابٍ باقٍ.
    // فشلُ ملفٍّ لا يُفشل الحذف — صفّه ذهب، ولا رابط يشير إليه بعد الآن.
    for (const key of mediaKeys) {
      await storage.remove(key).catch(() => undefined);
    }
    return result;
  },
};

