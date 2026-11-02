import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, createSubAdmin, purgeSubAdmins, registerAndLogin } from './helpers.js';

/**
 * قائمة الزبائن في اللوحة (`GET /api/admin/users`) تحمل الحسابات **المقبولة** فقط.
 *
 * ═══ الخلل ═══ القائمة رشّحت على `role = 'customer'` وحده، فظهر فيها كل من
 * أرسل نموذج التسجيل — طلبه معلَّق أو مرفوض — كأنه زبون. التسجيل ينشئ صفَّ
 * `users` قبل الموافقة (AU-04)، فوجودُ الصف ليس قبولاً. القبول الوحيد هو
 * `phone_verified_at` الذي لا يضعه إلا `approveAccountRequest`.
 *
 * العدّادات (`genderCounts`) تتبع القائمة نفسها، وإلّا قال المجموع ما لا تعرضه.
 */

let adminToken: string;
const admin = () => ({ Authorization: `Bearer ${adminToken}` });
const createdUserIds: string[] = [];

function freshPhone() {
  return `077${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

async function submitRegistration() {
  const body = { username: 'طالب حساب', phone: freshPhone(), password: 'first-pass-1', gender: 'male' as const };
  const res = await api.post('/api/auth/register').send(body).expect(202);
  const userId = res.body.data.user.id as string;
  createdUserIds.push(userId);
  return { requestId: res.body.data.request.id as string, userId, phone: res.body.data.user.phone as string };
}

/** القائمة كما تطلبها اللوحة، مرشّحةً برقم الحساب ليكون الجواب عن هذا الحساب وحده. */
async function listByPhone(phone: string) {
  const res = await api.get('/api/admin/users').query({ search: phone, limit: 50 }).set(admin()).expect(200);
  return {
    ids: (res.body.data.items as Array<{ id: string }>).map((u) => u.id),
    total: res.body.data.total as number,
    genderTotal: res.body.data.genderCounts.total as number,
  };
}

beforeAll(async () => {
  adminToken = await createAdminUser();
});
afterAll(async () => {
  if (createdUserIds.length) {
    await db.query('DELETE FROM account_requests WHERE user_id = ANY($1::uuid[])', [createdUserIds]);
    await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
  }
  await purgeSubAdmins();
});

describe('[CRITICAL] قائمة الزبائن تعرض المقبولين فقط', () => {
  it('طلب تسجيلٍ معلَّق: الحساب خارج القائمة وخارج العدّاد', async () => {
    const r = await submitRegistration();
    const list = await listByPhone(r.phone);
    expect(list.ids).not.toContain(r.userId);
    expect(list.total).toBe(0);
    expect(list.genderTotal).toBe(0);
  });

  it('طلب تسجيلٍ مرفوض: الرفض لا يمنح القبول، والحساب يبقى خارج القائمة', async () => {
    const r = await submitRegistration();
    await api.post(`/api/admin/account-requests/${r.requestId}/reject`).set(admin()).send({ note: 'لم يردّ' }).expect(200);

    const { rows } = await db.query<{ phone_verified_at: Date | null }>(
      'SELECT phone_verified_at FROM users WHERE id = $1',
      [r.userId],
    );
    expect(rows[0]!.phone_verified_at).toBeNull();
    const list = await listByPhone(r.phone);
    expect(list.ids).not.toContain(r.userId);
    expect(list.total).toBe(0);
    expect(list.genderTotal).toBe(0);
  });

  it('حسابٌ غير مفعَّل بلا طلب (بقايا مسار OTP المتقاعد): خارج القائمة', async () => {
    // إدراجٌ مباشر يحاكي حساباً قديماً لم يُثبت رقمه قط (BR-83/I26) — لا يمرّ
    // بمسار التسجيل لأن ذلك المسار ينشئ طلباً دائماً.
    const phone = `+964${freshPhone().slice(1)}`;
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (username, phone, password_hash, role, gender)
       VALUES ('حساب قديم', $1, $2, 'customer', 'male') RETURNING id`,
      [phone, await bcrypt.hash('legacy-pass-1', 4)],
    );
    const id = rows[0]!.id;
    createdUserIds.push(id);

    const list = await listByPhone(phone);
    expect(list.ids).not.toContain(id);
    expect(list.total).toBe(0);
    expect(list.genderTotal).toBe(0);
  });

  it('[CRITICAL] الموافقة تُدخل الحساب القائمة فوراً، ويبقى فيها عبر الطلبات اللاحقة', async () => {
    const r = await submitRegistration();
    expect((await listByPhone(r.phone)).ids).not.toContain(r.userId);

    await api.post(`/api/admin/account-requests/${r.requestId}/approve`).set(admin()).send({}).expect(200);

    for (let i = 0; i < 3; i += 1) {
      const list = await listByPhone(r.phone);
      expect(list.ids).toEqual([r.userId]);
      expect(list.total).toBe(1);
      expect(list.genderTotal).toBe(1);
    }
    const { rows } = await db.query<{ phone_verified_at: Date | null }>(
      'SELECT phone_verified_at FROM users WHERE id = $1',
      [r.userId],
    );
    expect(rows[0]!.phone_verified_at).not.toBeNull();
    // الموافقة محسومة: تكرارها لا يغيّر شيئاً، والحساب باقٍ في القائمة.
    await api.post(`/api/admin/account-requests/${r.requestId}/approve`).set(admin()).send({}).expect(409);
    expect((await listByPhone(r.phone)).ids).toEqual([r.userId]);
  });

  it('زبونٌ مقبول عبر المسار المعتاد يظهر — والمعلَّق المجاور لا يظهر', async () => {
    const approved = await registerAndLogin();
    createdUserIds.push(approved.userId);
    const pending = await submitRegistration();

    const res = await api.get('/api/admin/users').query({ limit: 100, sort: 'newest' }).set(admin()).expect(200);
    const ids = (res.body.data.items as Array<{ id: string }>).map((u) => u.id);
    expect(ids).toContain(approved.userId);
    expect(ids).not.toContain(pending.userId);
  });
});

describe('[SECURITY] لا قبول إلا من مسؤولٍ يملك صلاحية طلبات الحساب', () => {
  it('بلا جلسة، بتوكن مزوّر، بتوكن زبون، وبمسؤول فرعي بلا الصلاحية: مرفوض والحساب يبقى خارج القائمة', async () => {
    const r = await submitRegistration();
    const customer = await registerAndLogin();
    createdUserIds.push(customer.userId);
    const subAdmin = await createSubAdmin(['customers'], { suffix: 7401 });
    const url = `/api/admin/account-requests/${r.requestId}/approve`;

    await api.post(url).send({}).expect(401);
    await api.post(url).set('Authorization', 'Bearer forged.token.value').send({}).expect(401);
    await api.post(url).set('Authorization', `Bearer ${customer.token}`).send({}).expect(403);
    await api.post(url).set('Authorization', `Bearer ${subAdmin.token}`).send({}).expect(403);

    const { rows } = await db.query<{ phone_verified_at: Date | null; status: string }>(
      `SELECT u.phone_verified_at, a.status FROM users u JOIN account_requests a ON a.user_id = u.id
        WHERE u.id = $1 AND a.id = $2`,
      [r.userId, r.requestId],
    );
    expect(rows[0]!.phone_verified_at).toBeNull();
    expect(rows[0]!.status).toBe('pending');
    expect((await listByPhone(r.phone)).ids).not.toContain(r.userId);
  });
});
