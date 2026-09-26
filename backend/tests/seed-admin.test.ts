import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/database/pool.js';
import { normalizeIraqiPhone } from '../src/utils/phone.js';
import { seedAdminUser } from '../scripts/seedAdmin.js';
import { api, purgeTestUsers } from './helpers.js';

/**
 * بذر حساب المسؤول الأولي — يعمل فعلاً على قاعدةٍ بقيد E.164.
 *
 * [CRITICAL] كان البذر يقبل `07…` ثم يُدرجه كما هو فيرتطم بقيد
 * `users_phone_check` (E.164 منذ الهجرة 037) — أي أنه لم يكن ممكناً إنشاء
 * مسؤولٍ بالبذر على أي قاعدة حديثة. هذا الملف يثبت المسار كاملاً: صيغة محلية
 * تُدرج، تُخزَّن معتمدة، ويدخل بها المسؤول عبر `/api/auth/login`.
 *
 * القيد نفسه لا يُمسّ: الاختبار يقرأ تعريفه من القاعدة ويتأكد أنه ما زال E.164.
 */

const LOCAL = '07800000777';
const E164 = '+9647800000777';
const PASSWORD = 'seed-admin-password-2026';
const ROTATED = 'rotated-admin-password-2026';
const silent = () => undefined;

/** صفوف هذا الرقم بأي صيغة مخزَّنة — الجواب الصحيح دائماً «١». */
async function rowsForNumber(): Promise<string> {
  const { rows } = await db.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM users WHERE phone LIKE '%800000777'`,
  );
  return rows[0]!.n;
}

beforeAll(() => purgeTestUsers(E164));
afterAll(() => purgeTestUsers(E164));
afterEach(() => vi.restoreAllMocks());

describe('[CRITICAL] SEED_ADMIN_PHONE بالصيغة المحلية ينشئ مسؤولاً على قاعدةٍ بقيد E.164', () => {
  it('القيد ما زال E.164 — لم يُضعَف ليمرّ البذر', async () => {
    const { rows } = await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'users_phone_check'`,
    );
    expect(rows[0]?.def).toContain('+9647[5-9][0-9]{8}');
  });

  it('صيغة محلية → صفٌّ معتمد، دور admin، مفعَّل، والرقم المعتمد في السجل لا كلمة المرور', async () => {
    const lines: string[] = [];
    const result = await seedAdminUser(
      db,
      { SEED_ADMIN_PHONE: LOCAL, SEED_ADMIN_PASSWORD: PASSWORD, SEED_ADMIN_USERNAME: 'مسؤول البذر' },
      (line) => lines.push(line),
    );
    expect(result).toEqual({ status: 'created', phone: E164, username: 'مسؤول البذر' });

    const { rows } = await db.query<{ phone: string; role: string; verified: boolean; hash: string }>(
      `SELECT phone, role, phone_verified_at IS NOT NULL AS verified, password_hash AS hash
         FROM users WHERE phone = $1`,
      [E164],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ phone: E164, role: 'admin', verified: true });
    expect(rows[0]!.hash.startsWith('$2')).toBe(true);
    expect(rows[0]!.hash).not.toContain(PASSWORD);

    const out = lines.join('\n');
    expect(out).toContain(E164);
    expect(out).not.toContain(PASSWORD);
  });

  it('[CRITICAL] المسؤول المزروع يدخل فعلاً عبر الواجهة ويصل مسار اللوحة', async () => {
    const login = await api.post('/api/auth/login').send({ phone: LOCAL, password: PASSWORD }).expect(200);
    expect(login.body.data.user.role).toBe('admin');
    expect(login.body.data.user.phone).toBe(E164);
    await api
      .get('/api/admin/account-requests')
      .set('Authorization', `Bearer ${login.body.data.token}`)
      .expect(200);
  });

  it('إعادة التشغيل بأي صيغة مقبولة تحدّث الصفّ نفسه — لا صفّ ثانٍ، والكلمة المدوَّرة هي النافذة', async () => {
    // الصيغ المقبولة تُختبر على المُوحِّد مباشرةً (دالّة خالصة)؛ تشغيل البذر
    // الكامل لكل صيغة كان يعيد تجزئة bcrypt أربع مرّات لنتيجةٍ لا تُفحص.
    for (const form of [E164, '7800000777', '9647800000777', '009647800000777', '0780 000 0777']) {
      expect(normalizeIraqiPhone(form), form).toBe(E164);
    }
    // مساران كاملان يكفيان: E.164 (كما تُكتب في staging) وصيغةٌ بفراغات.
    for (const form of [E164, '0780 000 0777']) {
      const result = await seedAdminUser(db, { SEED_ADMIN_PHONE: form, SEED_ADMIN_PASSWORD: ROTATED }, silent);
      expect(result, form).toMatchObject({ status: 'created', phone: E164 });
    }
    expect(await rowsForNumber()).toBe('1');
    await api.post('/api/auth/login').send({ phone: LOCAL, password: PASSWORD }).expect(401);
    await api.post('/api/auth/login').send({ phone: E164, password: ROTATED }).expect(200);
  });

  it('رقم غير صالح يُرفض قبل أي إدراج، وبرسالة تسمّي الصيغ المقبولة', async () => {
    const spy = vi.spyOn(db, 'query');
    for (const bad of ['0712345678', '+964964771234567']) {
      await expect(
        seedAdminUser(db, { SEED_ADMIN_PHONE: bad, SEED_ADMIN_PASSWORD: PASSWORD }, silent),
      ).rejects.toThrow(/SEED_ADMIN_PHONE/);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('كلمة مرور قصيرة أو أطول من سقف bcrypt تُرفض، وغياب المتغيّرين يعني تخطّياً صامتاً لا خطأ', async () => {
    await expect(
      seedAdminUser(db, { SEED_ADMIN_PHONE: LOCAL, SEED_ADMIN_PASSWORD: 'short' }, silent),
    ).rejects.toThrow(/SEED_ADMIN_PASSWORD/);
    // ٤٠ حرفاً عربياً = ٨٠ بايت: bcrypt كان سيقتطعها بصمت — نفس سقف التسجيل.
    await expect(
      seedAdminUser(db, { SEED_ADMIN_PHONE: LOCAL, SEED_ADMIN_PASSWORD: 'ا'.repeat(40) }, silent),
    ).rejects.toThrow(/SEED_ADMIN_PASSWORD/);
    expect(await seedAdminUser(db, {}, silent)).toEqual({ status: 'skipped' });
  });
});
