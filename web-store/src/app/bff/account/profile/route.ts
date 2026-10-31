import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff, readJsonBody } from '@/lib/bff';
import { writeSession } from '@/lib/server-session';
import type { PublicUser } from '@/lib/types';

/**
 * Edit the profile: name, gender, photo — the fields the app's settings edit.
 * Absent = unchanged. The API validates each; the photo must be a file this
 * customer uploaded. The session keeps the same token, but its copy of the
 * name is refreshed so the header shows the new one.
 */
export async function PATCH(request: Request) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const body = await readJsonBody(request);
    if (!body) return bffError(400, 'VALIDATION_ERROR', 'بيانات غير صالحة');
    const patch: Record<string, unknown> = {};
    if (body.username !== undefined) {
      if (typeof body.username !== 'string') return bffError(400, 'VALIDATION_ERROR', 'اسم المستخدم غير صالح');
      patch.username = body.username;
    }
    if (body.gender !== undefined) {
      if (body.gender !== 'male' && body.gender !== 'female') return bffError(400, 'VALIDATION_ERROR', 'اختر ذكراً أو أنثى');
      patch.gender = body.gender;
    }
    if (body.avatarUrl !== undefined) {
      if (body.avatarUrl !== null && (typeof body.avatarUrl !== 'string' || !body.avatarUrl.startsWith('/uploads/'))) {
        return bffError(400, 'VALIDATION_ERROR', 'رابط صورة غير صالح — ارفع الصورة أولاً');
      }
      patch.avatarUrl = body.avatarUrl;
    }
    if (Object.keys(patch).length === 0) return bffError(400, 'VALIDATION_ERROR', 'لا شيء لتعديله');

    const { data, message } = await apiFetch<{ user: PublicUser }>('/auth/me', {
      method: 'PATCH',
      body: patch,
      token: session!.token,
    });
    const { user } = data;
    await writeSession({ ...session!, user: { id: user.id, username: user.username, phone: user.phone } });
    return bffJson(200, { data: { user: { username: user.username, gender: user.gender, avatarUrl: user.avatarUrl ?? null } }, message });
  });
}
