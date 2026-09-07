import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, DEV_CODE, createAdminUser, registerAndLogin } from './helpers.js';

/**
 * حقل الجنس — مطلوب عند التسجيل الجديد، محصَّن بالقاعدة، ولا يُخمَّن أبداً.
 *
 * الغرض منه نحويّ بحت: العربية تُصرِّف الخطاب. لذلك لا يدخل أي قرار تجاري
 * (نقاط، مزايا، أسعار) ولا يُشتقّ من الاسم أو أي إشارة أخرى.
 */

let adminToken: string;

beforeAll(async () => {
  adminToken = await createAdminUser();
});

function freshPhone() {
  return `077${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

/** يعيد طلب supertest نفسه (لا Promise) ليبقى `.expect()` قابلاً للتسلسل. */
function registerWith(body: Record<string, unknown>) {
  return api.post('/api/auth/register').send(body);
}

/** يُنشئ حساباً محقَّقاً بالجنس المعطى ويعيد جلسته. */
async function signUp(gender: 'male' | 'female') {
  const phone = freshPhone();
  const password = 'secret123';
  await registerWith({ username: 'مختبر الجنس', phone, password, gender }).expect(200);
  await api.post('/api/auth/verify').send({ phone, code: DEV_CODE }).expect(200);
  const login = await api.post('/api/auth/login').send({ phone, password }).expect(200);
  return {
    token: login.body.data.token as string,
    userId: login.body.data.user.id as string,
    user: login.body.data.user as Record<string, unknown>,
  };
}

describe('التسجيل بالجنس', () => {
  it('التسجيل بـ«ذكر» يحفظ القيمة ويعيدها', async () => {
    const session = await signUp('male');
    expect(session.user.gender).toBe('male');

    const { rows } = await db.query<{ gender: string }>(
      'SELECT gender FROM users WHERE id = $1',
      [session.userId],
    );
    expect(rows[0]!.gender).toBe('male');
  });

  it('التسجيل بـ«أنثى» يحفظ القيمة ويعيدها', async () => {
    const session = await signUp('female');
    expect(session.user.gender).toBe('female');
  });

  it('[CRITICAL] التسجيل بلا جنس مرفوض', async () => {
    const res = await registerWith({
      username: 'بلا جنس',
      phone: freshPhone(),
      password: 'secret123',
    });
    expect([400, 422]).toContain(res.status);
  });

  it('[CRITICAL] القيم غير الصالحة مرفوضة ولا تصل القاعدة', async () => {
    for (const gender of ['other', 'MALE', 'ذكر', '', null, 1, true, ['male']]) {
      const phone = freshPhone();
      const res = await registerWith({
        username: 'قيمة فاسدة',
        phone,
        password: 'secret123',
        gender,
      });
      expect([400, 422], JSON.stringify(gender)).toContain(res.status);

      const { rows } = await db.query(
        'SELECT 1 FROM users WHERE phone LIKE $1',
        [`%${phone.slice(1)}`],
      );
      expect(rows, JSON.stringify(gender)).toHaveLength(0);
    }
  });

  /**
   * استئناف تسجيل لم يكتمل يحدّث الاختيار.
   *
   * محاولة ثانية فورية تصطدم بمهلة إعادة إرسال الرمز (`OTP_RESEND_COOLDOWN`)
   * — وهي حارس إنتاجي حقيقي لا يُعطَّل من أجل اختبار. نُقدّم آخر إرسال في
   * القاعدة بدل تعطيل القاعدة نفسها، فيبقى المسار المُختبَر هو الإنتاجي.
   */
  it('استئناف تسجيل معلّق يحدّث الاختيار', async () => {
    const phone = freshPhone();
    await registerWith({
      username: 'أول محاولة',
      phone,
      password: 'secret123',
      gender: 'male',
    }).expect(200);

    await db.query(
      `UPDATE verification_codes
          SET created_at = created_at - interval '1 hour'
        WHERE phone LIKE $1`,
      [`%${phone.slice(1)}`],
    );

    const resumed = await registerWith({
      username: 'محاولة ثانية',
      phone,
      password: 'secret123',
      gender: 'female',
    });
    expect(resumed.status).toBe(200);
    expect(resumed.body.data.user.gender).toBe('female');
  });
});

describe('تعديل الجنس من الملف الشخصي', () => {
  it('العميل يغيّر جنسه ويُحفظ خادمياً', async () => {
    const session = await signUp('male');

    const updated = await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ gender: 'female' })
      .expect(200);
    expect(updated.body.data.user.gender).toBe('female');

    const me = await api
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.token}`)
      .expect(200);
    expect(me.body.data.user.gender).toBe('female');
  });

  it('[CRITICAL] قيمة غير صالحة في التعديل مرفوضة ولا تغيّر شيئاً', async () => {
    const session = await signUp('female');
    for (const gender of ['unknown', 'x', 42, null]) {
      const res = await api
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${session.token}`)
        .send({ gender });
      expect([400, 422], JSON.stringify(gender)).toContain(res.status);
    }

    const me = await api
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.token}`)
      .expect(200);
    expect(me.body.data.user.gender).toBe('female');
  });

  it('التعديل بلا حقل الجنس لا يمسّه', async () => {
    const session = await signUp('male');
    await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ username: 'اسم جديد' })
      .expect(200);

    const me = await api
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.token}`)
      .expect(200);
    expect(me.body.data.user.username).toBe('اسم جديد');
    expect(me.body.data.user.gender).toBe('male');
  });

  it('[CRITICAL] لا يغيّر أحد جنس غيره', async () => {
    const victim = await signUp('female');
    const attacker = await signUp('male');

    // لا مسار يقبل معرّف مستخدم في التعديل — الجلسة وحدها تحدّد الهدف.
    await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ gender: 'male', userId: victim.userId, id: victim.userId })
      .expect(200);

    const me = await api
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${victim.token}`)
      .expect(200);
    expect(me.body.data.user.gender).toBe('female');
  });

  it('التعديل يحتاج جلسة', async () => {
    const res = await api.patch('/api/auth/me').send({ gender: 'male' });
    expect(res.status).toBe(401);
  });
});

describe('الحسابات القديمة بلا جنس', () => {
  /**
   * [CRITICAL] الحساب الذي أُنشئ قبل الحقل يبقى `null`.
   *
   * لا هجرة تملؤه، ولا استنتاج من الاسم: تخمينٌ خاطئ يخاطب الزبون بصيغة
   * ليست له في كل جملة، بينما «مجهول» تُعامَل بصيغة محايدة في طبقة العرض.
   */
  it('يبقى `null` ولا يُخمَّن، ويعمل الحساب طبيعياً', async () => {
    const legacy = await registerAndLogin();
    // نُعيده إلى حالة ما قبل الحقل كما لو أُنشئ قبل الهجرة.
    await db.query('UPDATE users SET gender = NULL WHERE id = $1', [legacy.userId]);

    const me = await api
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${legacy.token}`)
      .expect(200);
    expect(me.body.data.user.gender).toBeNull();

    // ولا يمنعه ذلك من قراءة نقاطه.
    await api
      .get('/api/points')
      .set('Authorization', `Bearer ${legacy.token}`)
      .expect(200);
  });

  it('يستطيع اختيار جنسه لاحقاً', async () => {
    const legacy = await registerAndLogin();
    await db.query('UPDATE users SET gender = NULL WHERE id = $1', [legacy.userId]);

    const updated = await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${legacy.token}`)
      .send({ gender: 'female' })
      .expect(200);
    expect(updated.body.data.user.gender).toBe('female');
  });
});

describe('تمثيل الجنس في الـAPI', () => {
  it('يظهر في كل ردود المستخدم ولا يُسرَّب معه شيء خاص', async () => {
    const phone = freshPhone();
    const password = 'secret123';
    const registered = await registerWith({
      username: 'تمثيل',
      phone,
      password,
      gender: 'female',
    }).expect(200);
    expect(registered.body.data.user.gender).toBe('female');

    const verified = await api
      .post('/api/auth/verify')
      .send({ phone, code: DEV_CODE })
      .expect(200);
    expect(verified.body.data.user.gender).toBe('female');

    const login = await api.post('/api/auth/login').send({ phone, password }).expect(200);
    expect(login.body.data.user.gender).toBe('female');

    // الشكل المكشوف كما هو + الحقل الجديد، بلا تسريب.
    expect(Object.keys(login.body.data.user).sort()).toEqual(
      [
        'avatarUrl',
        'createdAt',
        'gender',
        'id',
        'isPhoneVerified',
        'phone',
        'role',
        'username',
      ].sort(),
    );
    expect(JSON.stringify(login.body.data.user)).not.toContain('password');
  });

  it('الجنس لا يغيّر أي قرار تجاري', async () => {
    const male = await signUp('male');
    const female = await signUp('female');

    const [maleSummary, femaleSummary] = await Promise.all([
      api.get('/api/points').set('Authorization', `Bearer ${male.token}`).expect(200),
      api.get('/api/points').set('Authorization', `Bearer ${female.token}`).expect(200),
    ]);

    // نفس العتبات، نفس المزايا، نفس القيم — الاختلاف في النصّ لا في القاعدة.
    expect(maleSummary.body.data.levels).toEqual(femaleSummary.body.data.levels);
    expect(maleSummary.body.data.rewards).toEqual(femaleSummary.body.data.rewards);
  });

  it('السلّم يحمل الصيغ الثلاث ليختار التطبيق بينها', async () => {
    const session = await signUp('female');
    const res = await api
      .get('/api/points')
      .set('Authorization', `Bearer ${session.token}`)
      .expect(200);

    for (const level of res.body.data.levels as Record<string, string>[]) {
      expect(level.nameMale).toBeTruthy();
      expect(level.nameFemale).toBeTruthy();
      expect(level.nameNeutral).toBeTruthy();
    }
  });

  it('قائمة الزبائن في اللوحة تعمل بعد إضافة الحقل', async () => {
    await signUp('female');
    const res = await api
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });
});
