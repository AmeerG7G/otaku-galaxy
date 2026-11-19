import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  PASSWORD_MESSAGES,
  passwordIdentityProblem,
  passwordPatternProblem,
} from '../src/domain/passwordPolicy.js';
import {
  api,
  createAdminUser,
  createSubAdmin,
  purgeSubAdmins,
  purgeTestUsers,
  registerAndLogin,
} from './helpers.js';

/**
 * سياسة كلمة المرور (2026-11-14): طولٌ + قائمة حظر + هوية، لا قواعد تعقيد.
 * الزبون ٨، المسؤول ١٢، والسقف ٧٢ بايتاً على **كل** مسارٍ يضبط كلمة مرور.
 * انظر `domain/passwordPolicy.ts` و`PROJECT_FEATURE_SPEC.md` STEP 84.
 */

/** الأمثلة التي طلب تدقيق 2026-11-14 رفضها، وأخواتها. */
const WEAK = [
  '12345678',
  'password',
  'password123',
  '11111111',
  'qwerty123',
  '87654321',
  'abcdefgh',
  'abababab',
  'P@ssw0rd!',
  'Password1!',
  'trustno1',
  'iloveyou',
  '1q2w3e4r',
  'naruto2024',
  'Otaku-Galaxy',
  'a1234567',
  '١٢٣٤٥٦٧٨',
  '        ',
];

/** ما يجب أن يبقى مقبولاً: عبارات المرور، العربية، ما لا نمط فيه. */
const STRONG = [
  'k7#mPq2z',
  'quiet-river-731',
  'x83920571',
  'correct horse battery staple',
  'أحب القهوة كثيراً',
  'tr4in-st4tion',
  'Ahmed-1990-Baghdad',
];

describe('passwordPatternProblem — القواعد بلا قاعدة', () => {
  it.each(WEAK)('«%s» مرفوضة', (password) => {
    expect(passwordPatternProblem(password)).not.toBeNull();
  });

  it.each(STRONG)('«%s» مقبولة', (password) => {
    expect(passwordPatternProblem(password)).toBeNull();
  });

  it('الفراغات وحدها لها رسالتها', () => {
    expect(passwordPatternProblem('          ')).toBe(PASSWORD_MESSAGES.blank);
  });
});

describe('passwordIdentityProblem — رقم صاحب الحساب واسمه', () => {
  const me = { phone: '+9647701234567', username: 'Ameer' };

  it.each(['07701234567!x', 'x+9647701234567', 'my-770-1234-567', '٠٧٧٠١٢٣٤٥٦٧ab'])('«%s» تحوي الرقم', (pw) => {
    expect(passwordIdentityProblem(pw, [me])).toBe(PASSWORD_MESSAGES.containsPhone);
  });

  it('الاسم بأي حالة أحرف، والعربي كذلك', () => {
    expect(passwordIdentityProblem('AMEER-rocks-9', [me])).toBe(PASSWORD_MESSAGES.containsUsername);
    expect(passwordIdentityProblem('أمير2024!!', [{ username: 'أمير' }])).toBe(PASSWORD_MESSAGES.containsUsername);
  });

  it('اسمٌ من حرفين لا يحظر شيئاً، وكلمةٌ بلا هوية تمرّ', () => {
    expect(passwordIdentityProblem('ab-river-731', [{ username: 'ab' }])).toBeNull();
    expect(passwordIdentityProblem('quiet-river-731', [me])).toBeNull();
  });
});

describe('سياسة كلمة المرور عبر الـAPI', () => {
  let adminToken: string;
  let seq = 0;
  const freshPhone = () => {
    seq += 1;
    return `077${String(Date.now()).slice(-6)}${String(seq).padStart(2, '0')}`;
  };
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });
  const register = (password: string, extra: Record<string, unknown> = {}) =>
    api.post('/api/auth/register').send({ username: 'مختبر', phone: freshPhone(), password, gender: 'male', ...extra });

  beforeAll(async () => {
    adminToken = await createAdminUser();
  });

  afterAll(async () => {
    await purgeTestUsers();
    await purgeSubAdmins();
  });

  describe('التسجيل', () => {
    it.each(WEAK)('«%s» تُرفض بـ٤٠٠ — الخادم لا يعتمد على التطبيق', async (password) => {
      const res = await register(password);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('`123456` قصيرة قبل أن تكون شائعة', async () => {
      const res = await register('123456');
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(PASSWORD_MESSAGES.tooShort);
    });

    it('سبعة أحرف تُرفض وثمانية قوية تُقبل', async () => {
      expect((await register('k7#mPq2')).status).toBe(400);
      expect((await register('k7#mPq2z')).status).toBe(202);
    });

    it('كلمةٌ تحوي الرقم المسجَّل أو الاسم تُرفض بـWEAK_PASSWORD', async () => {
      const phone = freshPhone();
      const withPhone = await api
        .post('/api/auth/register')
        .send({ username: 'مختبر', phone, password: `${phone}-x`, gender: 'male' });
      expect(withPhone.status).toBe(400);
      expect(withPhone.body.error.code).toBe('WEAK_PASSWORD');
      expect(withPhone.body.message).toBe(PASSWORD_MESSAGES.containsPhone);

      const withName = await register('river-مختبر-731');
      expect(withName.status).toBe(400);
      expect(withName.body.message).toBe(PASSWORD_MESSAGES.containsUsername);
    });

    it('الرسالة تصل الواجهة الكردية مترجمة', async () => {
      const res = await api
        .post('/api/auth/register')
        .set('Accept-Language', 'ckb')
        .send({ username: 'مختبر', phone: freshPhone(), password: 'password123', gender: 'male' });
      expect(res.status).toBe(400);
      expect(res.body.message).not.toBe(PASSWORD_MESSAGES.weak);
      expect(res.body.message).toContain('وشەی نهێنی');
    });
  });

  describe('تغيير كلمة المرور من الإعدادات', () => {
    it('كلمةٌ ضعيفة أو تحوي الرقم تُرفض، والقوية تُقبل', async () => {
      const user = await registerAndLogin(freshPhone());
      const bearer = { Authorization: `Bearer ${user.token}` };
      for (const newPassword of ['password123', '11111111', '1234567']) {
        await api.patch('/api/auth/me/password').set(bearer).send({ currentPassword: user.password, newPassword }).expect(400);
      }
      const withPhone = await api
        .patch('/api/auth/me/password')
        .set(bearer)
        .send({ currentPassword: user.password, newPassword: `x${user.phone.slice(-10)}y` });
      expect(withPhone.status).toBe(400);
      expect(withPhone.body.error.code).toBe('WEAK_PASSWORD');
      await api.patch('/api/auth/me/password').set(bearer).send({ currentPassword: user.password, newPassword: 'amber-lantern-77' }).expect(200);
    });

    it('[SECURITY] المسؤول على المسار المشترك يحتاج ١٢ حرفاً', async () => {
      const sub = await createSubAdmin(['orders'], { suffix: 7701 });
      const bearer = { Authorization: `Bearer ${sub.token}` };
      const short = await api.patch('/api/auth/me/password').set(bearer).send({ currentPassword: sub.password, newPassword: 'k7#mPq2z-9' });
      expect(short.status).toBe(400);
      expect(short.body.message).toBe(PASSWORD_MESSAGES.adminTooShort);
      await api.patch('/api/auth/me/password').set(bearer).send({ currentPassword: sub.password, newPassword: 'amber-lantern-orbit' }).expect(200);
    });
  });

  describe('إعادة التعيين من اللوحة', () => {
    it('[P0] ما يتجاوز ٧٢ بايتاً يُرفض — كان يُقبل حتى ٢٠٠ حرف ويُقتطع بصمت', async () => {
      const user = await registerAndLogin(freshPhone());
      const tooLong = 'قهوة صباحية مع '.repeat(3).slice(0, 40); // ٧٣ بايتاً
      const res = await api.patch(`/api/admin/customers/${user.userId}/password`).set(admin()).send({ newPassword: tooLong });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(PASSWORD_MESSAGES.tooLong);
    });

    it('الضعيفة وما يحوي رقم الزبون يُرفضان، والقوية تفتح جلسة', async () => {
      const user = await registerAndLogin(freshPhone());
      const url = `/api/admin/customers/${user.userId}/password`;
      await api.patch(url).set(admin()).send({ newPassword: 'qwerty123' }).expect(400);
      const withPhone = await api.patch(url).set(admin()).send({ newPassword: `0${user.phone.slice(-10)}!` });
      expect(withPhone.status).toBe(400);
      expect(withPhone.body.error.code).toBe('WEAK_PASSWORD');
      await api.patch(url).set(admin()).send({ newPassword: 'amber-lantern-88' }).expect(200);
      await api.post('/api/auth/login').send({ phone: user.phone, password: 'amber-lantern-88' }).expect(200);
    });
  });

  describe('حسابات المسؤولين', () => {
    it('إنشاء مسؤول فرعي: أقل من ١٢ أو ضعيفة أو تحوي اسمه تُرفض', async () => {
      const body = (password: string, username = 'مسؤول السياسة') => ({ username, phone: '07800007702', password, permissions: ['orders'] });
      const short = await api.post('/api/admin/admins').set(admin()).send(body('k7#mPq2z-9'));
      expect(short.status).toBe(400);
      expect(short.body.message).toBe(PASSWORD_MESSAGES.adminTooShort);
      await api.post('/api/admin/admins').set(admin()).send(body('password1234')).expect(400);
      const named = await api.post('/api/admin/admins').set(admin()).send(body('mod-zainab-river-7', 'zainab'));
      expect(named.status).toBe(400);
      expect(named.body.message).toBe(PASSWORD_MESSAGES.containsUsername);
      await api.post('/api/admin/admins').set(admin()).send(body('amber-lantern-orbit')).expect(201);
    });

    it('إعادة تعيين مسؤول فرعي: الحدّ ١٢ ورقم المسؤول الهدف محظور', async () => {
      const sub = await createSubAdmin(['orders'], { suffix: 7703 });
      const url = `/api/admin/admins/${sub.userId}`;
      await api.patch(url).set(admin()).send({ newPassword: 'k7#mPq2z-9' }).expect(400);
      const withPhone = await api.patch(url).set(admin()).send({ newPassword: `ops-${sub.phone.slice(-10)}` });
      expect(withPhone.status).toBe(400);
      expect(withPhone.body.error.code).toBe('WEAK_PASSWORD');
      await api.patch(url).set(admin()).send({ newPassword: 'amber-lantern-orbit' }).expect(200);
    });

    it('PATCH /admin/me: الحدّ ١٢ والقائمة', async () => {
      const sub = await createSubAdmin(['admins'], { suffix: 7704 });
      const bearer = { Authorization: `Bearer ${sub.token}` };
      await api.patch('/api/admin/me').set(bearer).send({ newPassword: 'k7#mPq2z-9', currentPassword: sub.password }).expect(400);
      await api.patch('/api/admin/me').set(bearer).send({ newPassword: 'qwerty123456', currentPassword: sub.password }).expect(400);
      await api.patch('/api/admin/me').set(bearer).send({ newPassword: 'amber-lantern-orbit', currentPassword: sub.password }).expect(200);
    });
  });

  it('[CRITICAL] حسابٌ ضُبط أيام الحدّ القديم (ستة أحرف) ما زال يدخل', async () => {
    const user = await registerAndLogin(freshPhone());
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash('123456', 4), user.userId]);
    await api.post('/api/auth/login').send({ phone: user.phone, password: '123456' }).expect(200);
  });

  // ── التوافق مع الحسابات القائمة: السياسة تسري على ما يُضبط لا على ما ضُبط ──
  describe('[CRITICAL] الحسابات القائمة: الدخول والتحقق من الحالية لم يتغيّرا', () => {
    const setHash = async (userId: string, password: string) =>
      db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(password, 4), userId]);

    it('كلمةٌ قديمة تخالف القواعد الجديدة (تحوي رقم صاحبها) ما زالت تدخل، والخاطئة تُرفض كما كانت', async () => {
      const user = await registerAndLogin(freshPhone());
      const legacy = user.phone.slice(-8); // ثمانية أرقام من رقمه — مرفوضةٌ لو ضُبطت اليوم
      await setHash(user.userId, legacy);
      const ok = await api.post('/api/auth/login').send({ phone: user.phone, password: legacy }).expect(200);
      expect(ok.body.data.token).toEqual(expect.any(String));
      expect(ok.body.data.user.role).toBe('customer');
      const wrong = await api.post('/api/auth/login').send({ phone: user.phone, password: `${legacy}x` });
      expect(wrong.status).toBe(401);
    });

    it('مسؤولٌ فرعي بكلمةٍ أقصر من ١٢ (ضُبطت قبل السياسة) ما زال يدخل بصلاحياته', async () => {
      const sub = await createSubAdmin(['orders'], { suffix: 7731 });
      await setHash(sub.userId, 'abc123');
      const res = await api.post('/api/auth/login').send({ phone: sub.phone, password: 'abc123' }).expect(200);
      expect(res.body.data.user.role).toBe('admin');
      const bearer = { Authorization: `Bearer ${res.body.data.token}` };
      await api.get('/api/admin/orders').set(bearer).expect(200);
    });

    it('تغيير كلمة المرور بكلمةٍ حالية قصيرة: الصحيحة تُقبل والخاطئة تُرفض، ثم القديمة لا تدخل والجديدة تدخل', async () => {
      const user = await registerAndLogin(freshPhone());
      await setHash(user.userId, '123456');
      const login = await api.post('/api/auth/login').send({ phone: user.phone, password: '123456' }).expect(200);
      const bearer = { Authorization: `Bearer ${login.body.data.token}` };

      const wrong = await api.patch('/api/auth/me/password').set(bearer).send({ currentPassword: '654321', newPassword: 'amber-lantern-88' });
      expect(wrong.status).toBe(400);
      expect(wrong.body.error.code).toBe('INVALID_CURRENT_PASSWORD');

      // الجديدة تخضع للسياسة حتى لو كانت الحالية قديمة.
      const weakNew = await api.patch('/api/auth/me/password').set(bearer).send({ currentPassword: '123456', newPassword: '1234567' });
      expect(weakNew.status).toBe(400);

      await api.patch('/api/auth/me/password').set(bearer).send({ currentPassword: '123456', newPassword: 'amber-lantern-88' }).expect(200);
      await api.post('/api/auth/login').send({ phone: user.phone, password: '123456' }).expect(401);
      await api.post('/api/auth/login').send({ phone: user.phone, password: 'amber-lantern-88' }).expect(200);
    });

    it('التفعيل لم يتغيّر: طلبٌ بانتظار الإدارة لا يدخل ولو بكلمةٍ قوية صحيحة', async () => {
      const phone = freshPhone();
      await register('amber-lantern-55', { phone }).expect(202);
      const res = await api.post('/api/auth/login').send({ phone, password: 'amber-lantern-55' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_PENDING_APPROVAL');
    });
  });
});
