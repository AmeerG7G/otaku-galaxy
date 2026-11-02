import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { db, withTransaction } from '../database/pool.js';
import { normalizePermissions, type AdminSection } from '../domain/adminPermissions.js';
import { adminAccountsRepo, toSubAdmin, type SubAdminRow } from '../repositories/adminAccountsRepo.js';
import { adminAuditRepo } from '../repositories/adminAuditRepo.js';
import { adminPushRepo } from '../repositories/adminPushRepo.js';
import { userRepo } from '../repositories/userRepo.js';
import type { AuthUser } from '../types/index.js';
import { Errors } from '../utils/errors.js';
import { signToken } from './authService.js';

/**
 * إدارة المسؤولين — المسؤول الأعلى ومسؤولوه الفرعيون.
 *
 * [SECURITY] الحدود التي يحرسها هذا الملف (والحراس على المسارات قبله):
 *   • لا مسار يجعل أحداً مسؤولاً أعلى، ولا يغيّر صلاحيات المسؤول الأعلى.
 *   • المسؤول الفرعي يعدّل **ملفّه وحده** (اسم، رقم، كلمة مرور) — لا
 *     صلاحياته، ولا غيره. المعرّف يُؤخذ من الجلسة لا من الطلب.
 *   • كل ما يستهدف `:id` يمرّ باستعلامٍ مقيَّد بالمسؤول الفرعي
 *     (`adminAccountsRepo`)، فمعرّف المسؤول الأعلى أو زبونٍ يعود ٤٠٤.
 *   • كل فعلٍ يكتب سجلّه داخل معاملته: لا فعل بلا أثر في السجلّ.
 *   • لا كلمة مرور في ردٍّ ولا في سجلّ — الحدث وحده ("غُيّرت").
 */

export interface AdminProfile {
  id: string;
  username: string;
  phone: string;
  isSuperAdmin: boolean;
  permissions: AdminSection[];
}

/** الرقم مستعمل لحساب آخر (زبون أو مسؤول) — لا ترقية صامتة لزبون إلى مسؤول. */
function isPhoneTaken(error: unknown) {
  const { code, constraint } = error as { code?: string; constraint?: string };
  return code === '23505' && constraint === 'users_phone_key';
}

const phoneTaken = () =>
  Errors.conflict('هذا الرقم مستعمل لحسابٍ آخر', 'PHONE_TAKEN');

async function withPhoneGuard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isPhoneTaken(error)) throw phoneTaken();
    throw error;
  }
}

function profileOf(auth: AuthUser, row: { username: string; phone: string }): AdminProfile {
  return {
    id: auth.id,
    username: row.username,
    phone: row.phone,
    isSuperAdmin: auth.isSuperAdmin,
    permissions: auth.isSuperAdmin ? [] : [...auth.permissions],
  };
}

function diffPermissions(before: readonly AdminSection[], after: readonly AdminSection[]) {
  return {
    before: [...before],
    after: [...after],
    added: after.filter((section) => !before.includes(section)),
    removed: before.filter((section) => !after.includes(section)),
  };
}

export const adminAccountsService = {
  /** هويّة المسؤول الحالي وصلاحياته — تبني منها اللوحة قائمتها. */
  async me(auth: AuthUser): Promise<AdminProfile> {
    const user = await userRepo.findById(db, auth.id);
    if (!user) throw Errors.unauthorized('الحساب غير موجود');
    return profileOf(auth, user);
  },

  /**
   * المسؤول يعدّل ملفّه: الاسم، والرقم، وكلمة المرور.
   *
   * الرقم وكلمة المرور يطلبان كلمة المرور الحالية: هما مفتاحا الدخول، ومن
   * وجد اللوحة مفتوحةً على جهازٍ لا يجوز أن يستولي على الحساب بهما.
   * تغيير كلمة المرور يُسقط كل الجلسات الأخرى ويعيد توكناً جديداً لهذا
   * الجهاز (كما في `authService.changePassword`).
   */
  async updateOwn(
    auth: AuthUser,
    input: { username?: string; phone?: string; newPassword?: string; currentPassword?: string },
  ): Promise<{ profile: AdminProfile; token: string | null }> {
    return withPhoneGuard(() =>
      withTransaction(async (tx) => {
        const { rows } = await tx.query<{ username: string; phone: string; password_hash: string }>(
          `SELECT username, phone, password_hash FROM users WHERE id = $1 AND role = 'admin' FOR UPDATE`,
          [auth.id],
        );
        const current = rows[0];
        if (!current) throw Errors.unauthorized('الحساب غير موجود');

        const phoneChanges = input.phone !== undefined && input.phone !== current.phone;
        const passwordChanges = input.newPassword !== undefined;
        if (phoneChanges || passwordChanges) {
          const matches =
            input.currentPassword !== undefined &&
            (await bcrypt.compare(input.currentPassword, current.password_hash));
          // ٤٠٠ لا ٤٠١: خطأ إدخال لا رفضُ جلسة (اللوحة تخرج عند ٤٠١).
          if (!matches) {
            throw Errors.badRequest('كلمة المرور الحالية غير صحيحة', 'INVALID_CURRENT_PASSWORD');
          }
        }

        const nameChanges = input.username !== undefined && input.username !== current.username;
        const passwordHash = passwordChanges
          ? await bcrypt.hash(input.newPassword!, config.bcryptRounds)
          : undefined;

        const sets: string[] = [];
        const values: unknown[] = [auth.id];
        if (nameChanges) {
          values.push(input.username);
          sets.push(`username = $${values.length}`);
        }
        if (phoneChanges) {
          values.push(input.phone);
          sets.push(`phone = $${values.length}`);
        }
        if (passwordHash) {
          values.push(passwordHash);
          sets.push(`password_hash = $${values.length}`, 'token_version = token_version + 1');
        }
        if (sets.length === 0) {
          return { profile: profileOf(auth, current), token: null };
        }
        await tx.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, values);
        // الجلسات الأخرى سقطت — وأجهزة الإشعار معها (انظر `deactivateAll`).
        if (passwordHash) await adminPushRepo.deactivateAll(tx, auth.id);

        if (nameChanges || phoneChanges) {
          await adminAuditRepo.record(tx, {
            actorId: auth.id,
            action: 'admin.self.profile_updated',
            targetType: 'admin',
            targetId: auth.id,
            details: {
              ...(nameChanges ? { username: { before: current.username, after: input.username } } : {}),
              ...(phoneChanges ? { phone: { before: current.phone, after: input.phone } } : {}),
            },
          });
        }
        if (passwordChanges) {
          await adminAuditRepo.record(tx, {
            actorId: auth.id,
            action: 'admin.self.password_changed',
            targetType: 'admin',
            targetId: auth.id,
          });
        }

        const updated = await userRepo.findById(tx, auth.id);
        return {
          profile: profileOf(auth, updated!),
          token: passwordChanges ? signToken(updated!) : null,
        };
      }),
    );
  },

  async list() {
    return { items: await adminAccountsRepo.list(db) };
  },

  async create(
    actor: AuthUser,
    input: { username: string; phone: string; password: string; permissions: AdminSection[] },
  ) {
    const permissions = normalizePermissions(input.permissions);
    const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
    return withPhoneGuard(() =>
      withTransaction(async (tx) => {
        const row = await adminAccountsRepo.create(tx, {
          username: input.username,
          phone: input.phone,
          passwordHash,
          permissions,
          createdBy: actor.id,
        });
        await adminAuditRepo.record(tx, {
          actorId: actor.id,
          action: 'admin.created',
          targetType: 'admin',
          targetId: row.id,
          details: { username: row.username, phone: row.phone, permissions },
        });
        return toSubAdmin(row);
      }),
    );
  },

  /**
   * تعديل مسؤولٍ فرعي: الاسم، الرقم، الصلاحيات، التفعيل، كلمة مرور جديدة.
   *
   * الإيقاف وإعادة تعيين كلمة المرور يُسقطان جلساته فوراً (`token_version`).
   * سحبُ صلاحيةٍ لا يحتاج ذلك: الصلاحيات تُقرأ من الصفّ في كل طلب.
   */
  async update(
    actor: AuthUser,
    id: string,
    input: {
      username?: string;
      phone?: string;
      permissions?: AdminSection[];
      isActive?: boolean;
      newPassword?: string;
    },
  ) {
    const passwordHash =
      input.newPassword !== undefined ? await bcrypt.hash(input.newPassword, config.bcryptRounds) : undefined;
    return withPhoneGuard(() =>
      withTransaction(async (tx) => {
        const before = await adminAccountsRepo.lockSubAdmin(tx, id);
        if (!before) throw Errors.notFound('المسؤول غير موجود');

        const permissions =
          input.permissions !== undefined ? normalizePermissions(input.permissions) : undefined;
        const beforePermissions = normalizePermissions(before.admin_permissions);
        const changes = {
          username: input.username !== undefined && input.username !== before.username,
          phone: input.phone !== undefined && input.phone !== before.phone,
          permissions:
            permissions !== undefined &&
            permissions.join(',') !== beforePermissions.join(','),
          isActive: input.isActive !== undefined && input.isActive !== before.is_active,
          password: passwordHash !== undefined,
        };

        const revokeSessions = changes.password || (changes.isActive && input.isActive === false);
        const after: SubAdminRow | null = await adminAccountsRepo.update(tx, id, {
          username: changes.username ? input.username : undefined,
          phone: changes.phone ? input.phone : undefined,
          permissions: changes.permissions ? permissions : undefined,
          isActive: changes.isActive ? input.isActive : undefined,
          passwordHash,
          bumpTokenVersion: revokeSessions,
        });
        if (revokeSessions) await adminPushRepo.deactivateAll(tx, id);
        const current = after ?? before;

        const audit = (action: string, details?: Record<string, unknown>) =>
          adminAuditRepo.record(tx, { actorId: actor.id, action, targetType: 'admin', targetId: id, details });
        if (changes.username || changes.phone) {
          await audit('admin.profile_updated', {
            ...(changes.username ? { username: { before: before.username, after: input.username } } : {}),
            ...(changes.phone ? { phone: { before: before.phone, after: input.phone } } : {}),
          });
        }
        if (changes.permissions) {
          await audit('admin.permissions_changed', {
            username: current.username,
            ...diffPermissions(beforePermissions, permissions!),
          });
        }
        if (changes.isActive) {
          await audit(input.isActive ? 'admin.enabled' : 'admin.disabled', { username: current.username });
        }
        if (changes.password) {
          await audit('admin.password_reset', { username: current.username });
        }
        return toSubAdmin(current);
      }),
    );
  },

  /**
   * حذف مسؤولٍ فرعي. أعمدة «من فعل» في الجداول الأخرى `SET NULL`، وسجلّ
   * النشاط يحتفظ بالاسم. أي اعتمادٍ يمنع الحذف (طلبٌ باسمه كزبون مثلاً) ⇒
   * ٤٠٩ مع اقتراح الإيقاف بدلاً منه.
   */
  async remove(actor: AuthUser, id: string) {
    try {
      await withTransaction(async (tx) => {
        const target = await adminAccountsRepo.lockSubAdmin(tx, id);
        if (!target) throw Errors.notFound('المسؤول غير موجود');
        // السجلّ قبل الحذف: الإدراج يقرأ اسم الفاعل، والهدفُ يُحفظ اسمه هنا.
        await adminAuditRepo.record(tx, {
          actorId: actor.id,
          action: 'admin.deleted',
          targetType: 'admin',
          targetId: id,
          details: { username: target.username, phone: target.phone },
        });
        await adminAccountsRepo.remove(tx, id);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23503') {
        throw Errors.conflict('لهذا المسؤول بياناتٌ مرتبطة — أوقفه بدل حذفه', 'ADMIN_HAS_DEPENDENTS');
      }
      throw error;
    }
  },

  async audit(options: { page: number; limit: number; actorId?: string; action?: string }) {
    const { items, total } = await adminAuditRepo.list(db, options);
    return {
      items,
      page: options.page,
      limit: options.limit,
      total,
      hasMore: options.page * options.limit < total,
    };
  },
};
