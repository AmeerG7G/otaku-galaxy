import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { GENDERS, type Gender } from '../src/types/index.js';
import { api, createAdminUser, registerAndLogin, TEST_PASSWORD } from './helpers.js';

/**
 * تزامن الجنس: التطبيق ← الخادم ← القاعدة ← اللوحة.
 *
 * مصدر الحقيقة الوحيد عمود `users.gender` (`male` / `female` / NULL —
 * مفاتيح ثابتة لا نصوص معروضة). الزبون يغيّره بـ`PATCH /auth/me` على جلسته
 * وحدها، واللوحة تقرأه في القائمة (`GET /admin/users`) والملفّ
 * (`GET /admin/customers/:id`) والعدّادات والترشيح من الصفّ نفسه في كل طلب —
 * لا ذاكرةٌ وسيطة على الخادم ولا حقلٌ ثانٍ. هذه السويت تثبت السلسلة كاملةً
 * في الاتجاهين، وأن الخروج والدخول لا يُرجعان القيمة القديمة.
 *
 * `gender.test.ts` يحرس التحقّق والملكية تفصيلاً؛ هنا الحدّ الأدنى منهما
 * يُعاد داخل السلسلة كي تبقى قابلةً للقراءة وحدها.
 */
describe('تزامن الجنس بين التطبيق واللوحة', () => {
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await createAdminUser();
  });

  const admin = () => ({ Authorization: `Bearer ${adminToken}` });

  async function genderInDb(userId: string) {
    const { rows } = await db.query<{ gender: Gender | null }>(
      'SELECT gender FROM users WHERE id = $1',
      [userId],
    );
    return rows[0]!.gender;
  }

  /** صفّ الزبون في قائمة اللوحة — بالبحث برقمه، مع ترشيحٍ اختياري. */
  async function adminListRow(phone: string, gender?: string) {
    const res = await api
      .get('/api/admin/users')
      .set(admin())
      .query({ search: phone, ...(gender ? { gender } : {}) })
      .expect(200);
    const items = res.body.data.items as Array<{ id: string; gender: string | null; phone: string }>;
    return { row: items.find((c) => c.phone === phone) ?? null, counts: res.body.data.genderCounts };
  }

  async function adminDetailGender(userId: string) {
    const res = await api.get(`/api/admin/customers/${userId}`).set(admin()).expect(200);
    return res.body.data.profile.gender as string | null;
  }

  function changeGender(token: string, gender: string) {
    return api.patch('/api/auth/me').set('Authorization', `Bearer ${token}`).send({ gender });
  }

  for (const [from, to] of [
    ['male', 'female'],
    ['female', 'male'],
  ] as const) {
    it(`[CRITICAL] ${from} → ${to}: الخادم والقاعدة والملفّ الشخصي واللوحة (قائمة، ترشيح، ملفّ) تتفق فوراً`, async () => {
      const user = await registerAndLogin(undefined, from);
      const before = await adminListRow(user.phone);
      expect(before.row?.gender).toBe(from);
      expect(await adminDetailGender(user.userId)).toBe(from);

      // ١) التغيير من التطبيق — الردّ يحمل القيمة الجديدة.
      const updated = await changeGender(user.token, to).expect(200);
      expect(updated.body.data.user.gender).toBe(to);

      // ٢) القاعدة.
      expect(await genderInDb(user.userId)).toBe(to);

      // ٣) الملفّ الشخصي للزبون نفسه.
      const me = await api.get('/api/auth/me').set('Authorization', `Bearer ${user.token}`).expect(200);
      expect(me.body.data.user.gender).toBe(to);

      // ٤) قائمة اللوحة، والترشيح بالجنس الجديد يشمله وبالقديم يُقصيه.
      const after = await adminListRow(user.phone);
      expect(after.row?.gender).toBe(to);
      expect((await adminListRow(user.phone, to)).row?.id).toBe(user.userId);
      expect((await adminListRow(user.phone, from)).row).toBeNull();

      // ٥) ملفّ الزبون في اللوحة.
      expect(await adminDetailGender(user.userId)).toBe(to);

      // ٦) العدّادات من الخادم تتحرّك بواحد في الاتجاهين.
      expect(after.counts[to]).toBe(before.counts[to] + 1);
      expect(after.counts[from]).toBe(before.counts[from] - 1);
      expect(after.counts.total).toBe(before.counts.total);
    });
  }

  it('[CRITICAL] القراءة الثانية من اللوحة تطابق الأولى — لا قيمةٌ قديمة تعود', async () => {
    const user = await registerAndLogin(undefined, 'male');
    await changeGender(user.token, 'female').expect(200);
    for (let i = 0; i < 3; i += 1) {
      expect((await adminListRow(user.phone)).row?.gender).toBe('female');
      expect(await adminDetailGender(user.userId)).toBe('female');
    }
  });

  it('[CRITICAL] الخروج ثم الدخول لا يُرجع القيمة القديمة', async () => {
    const user = await registerAndLogin(undefined, 'female');
    await changeGender(user.token, 'male').expect(200);

    const login = await api
      .post('/api/auth/login')
      .send({ phone: user.phone, password: TEST_PASSWORD })
      .expect(200);
    expect(login.body.data.user.gender).toBe('male');

    const me = await api
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.data.token}`)
      .expect(200);
    expect(me.body.data.user.gender).toBe('male');
    expect((await adminListRow(user.phone)).row?.gender).toBe('male');
  });

  it('القيمة المخزَّنة مفتاحٌ ثابت لا نصٌّ معروض — «ذكر»/«أنثى» تُرفض', async () => {
    const user = await registerAndLogin(undefined, 'male');
    for (const label of ['ذكر', 'أنثى', 'Male', 'FEMALE', '']) {
      const res = await changeGender(user.token, label);
      expect([400, 422], label).toContain(res.status);
    }
    expect(await genderInDb(user.userId)).toBe('male');
    expect(GENDERS).toEqual(['male', 'female']);
  });

  it('[SECURITY] لا يغيّر زبونٌ جنسَ غيره مهما حمل الطلب من معرّفات', async () => {
    const victim = await registerAndLogin(undefined, 'female');
    const attacker = await registerAndLogin(undefined, 'male');
    await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ gender: 'male', id: victim.userId, userId: victim.userId, phone: victim.phone })
      .expect(200);
    expect(await genderInDb(victim.userId)).toBe('female');
    expect((await adminListRow(victim.phone)).row?.gender).toBe('female');
    // ولا مسارٌ إداري يقبل جنساً من زبون.
    const asCustomer = await api
      .get(`/api/admin/customers/${victim.userId}`)
      .set('Authorization', `Bearer ${attacker.token}`);
    expect(asCustomer.status).toBe(403);
  });
});
