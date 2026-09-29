import { z } from 'zod';
import { ADMIN_SECTIONS } from '../domain/adminPermissions.js';
import {
  currentPasswordSchema,
  iraqiPhoneSchema,
  newPasswordSchema,
  usernameSchema,
} from './auth.js';

/**
 * مدخلات إدارة المسؤولين.
 *
 * [SECURITY] كل جسمٍ هنا **صارم**: مفتاحٌ غير معروف يُرفض بـ٤٠٠ لا يُسقَط
 * بصمت. `PATCH /admin/me` الذي يحمل `permissions` أو `isSuperAdmin` هو
 * محاولة ترقية ذاتية، ورفضُها الصريح يجعلها ظاهرةً في الاختبار والسجلّ بدل
 * أن تبدو ناجحة.
 */
function strictBody<T extends z.ZodRawShape>(shape: T) {
  return z.strictObject(shape, {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? `حقلٌ غير مسموح: ${issue.keys.join('، ')}`
        : undefined,
  });
}

const permissions = z
  .array(z.enum(ADMIN_SECTIONS, { error: 'صلاحية غير معروفة' }))
  .max(ADMIN_SECTIONS.length, 'صلاحيات مكرّرة');

export const adminAccountIdSchema = z.object({
  id: z.string().uuid('معرّف غير صالح'),
});

export const createSubAdminSchema = strictBody({
  username: usernameSchema,
  phone: iraqiPhoneSchema,
  password: newPasswordSchema,
  permissions,
});

export const updateSubAdminSchema = strictBody({
  username: usernameSchema.optional(),
  phone: iraqiPhoneSchema.optional(),
  permissions: permissions.optional(),
  isActive: z.boolean().optional(),
  newPassword: newPasswordSchema.optional(),
}).refine((input) => Object.values(input).some((value) => value !== undefined), {
  message: 'لا تغيير في الطلب',
});

export const updateOwnAdminSchema = strictBody({
  username: usernameSchema.optional(),
  phone: iraqiPhoneSchema.optional(),
  newPassword: newPasswordSchema.optional(),
  currentPassword: currentPasswordSchema.optional(),
})
  .refine(
    (input) =>
      input.username !== undefined || input.phone !== undefined || input.newPassword !== undefined,
    { message: 'لا تغيير في الطلب' },
  )
  .refine(
    (input) =>
      (input.phone === undefined && input.newPassword === undefined) ||
      input.currentPassword !== undefined,
    { message: 'أدخل كلمة المرور الحالية لتغيير الرقم أو كلمة المرور', path: ['currentPassword'] },
  );

export const adminAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  actorId: z.string().uuid('معرّف غير صالح').optional(),
  action: z.string().trim().min(1).max(160).optional(),
});
