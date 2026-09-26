import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, approveAsAdmin, createAdminUser, registerAndLogin, purgeTestUsers } from './helpers.js';

/**
 * إدارة الزبائن: الجنس والهاتف الكامل.
 *
 * حدّان يحكمان هذه السويت:
 *
 *  ١. الجنس والهاتف الكامل معلومتان إداريتان. تظهران خلف `requireAdmin` ولا
 *     تتسرّبان إلى مسار عام ولا إلى زبونٍ آخر.
 *  ٢. `gender IS NULL` تعني «لم يُسأل» لا «ذكر». الحسابات السابقة لهجرة
 *     `040_user_gender.sql` تبقى بلا قيمة، وتُعدّ في خانة مستقلة.
 */

let adminToken: string;
let customerToken: string;
let maleId: string;
let femaleId: string;
let legacyId: string;
let legacyPhone: string;

function freshPhone() {
  return `077${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

async function signUp(gender: 'male' | 'female') {
  const phone = freshPhone();
  const registered = await api
    .post('/api/auth/register')
    .send({ username: 'زبون إدارة', phone, password: 'secret123', gender })
    .expect(202);
  await approveAsAdmin(registered.body.data.request.id as string);
  const login = await api
    .post('/api/auth/login')
    .send({ phone, password: 'secret123' })
    .expect(200);
  return {
    id: login.body.data.user.id as string,
    phone: login.body.data.user.phone as string,
    token: login.body.data.token as string,
  };
}

/** يبحث عن زبون في قائمة الإدارة عبر الصفحات حتى يجده. */
async function findCustomer(id: string, query = '') {
  for (let page = 1; page <= 20; page += 1) {
    const res = await api
      .get(`/api/admin/users?page=${page}&limit=50${query}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const found = res.body.data.items.find((u: { id: string }) => u.id === id);
    if (found) return found as Record<string, unknown>;
    if (!res.body.data.hasMore) return null;
  }
  return null;
}

beforeAll(async () => {
  adminToken = await createAdminUser();
  const male = await signUp('male');
  const female = await signUp('female');
  maleId = male.id;
  femaleId = female.id;
  customerToken = male.token;

  // حساب «قديم»: سُجِّل ثم أُفرغ جنسه مباشرةً في القاعدة — هذا ما تبدو عليه
  // الحسابات التي سبقت الهجرة.
  const legacy = await registerAndLogin();
  legacyId = legacy.userId;
  legacyPhone = legacy.phone;
  await db.query('UPDATE users SET gender = NULL WHERE id = $1', [legacyId]);
});

afterAll(async () => {
  await purgeTestUsers();
});

describe('الجنس في قائمة الإدارة', () => {
  it('يُعاد الجنس للمسؤول', async () => {
    const male = await findCustomer(maleId);
    const female = await findCustomer(femaleId);
    expect(male?.gender).toBe('male');
    expect(female?.gender).toBe('female');
  });

  it('[CRITICAL] الحساب القديم يعود بـnull لا بـmale', async () => {
    const legacy = await findCustomer(legacyId);
    expect(legacy).not.toBeNull();
    expect(legacy!.gender).toBeNull();
  });

  it('ترشيح الذكور يُرجع الذكور وحدهم', async () => {
    const res = await api
      .get('/api/admin/users?gender=male&limit=50')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(
      res.body.data.items.every((u: { gender: string }) => u.gender === 'male'),
    ).toBe(true);
  });

  it('ترشيح الإناث يُرجع الإناث وحدهنّ', async () => {
    const res = await api
      .get('/api/admin/users?gender=female&limit=50')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      res.body.data.items.every((u: { gender: string }) => u.gender === 'female'),
    ).toBe(true);
  });

  it('ترشيح «غير محدد» يُرجع الحسابات بلا جنس', async () => {
    const res = await api
      .get('/api/admin/users?gender=unknown&limit=50')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      res.body.data.items.every((u: { gender: null }) => u.gender === null),
    ).toBe(true);
    expect(res.body.data.items.some((u: { id: string }) => u.id === legacyId)).toBe(true);
  });

  it('[CRITICAL] الترشيح يجري في القاعدة لا في المتصفح', async () => {
    // لو كان الترشيح في الواجهة لبقي `total` هو عدد كل الزبائن.
    const all = await api
      .get('/api/admin/users?limit=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const males = await api
      .get('/api/admin/users?gender=male&limit=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(males.body.data.total).toBeLessThan(all.body.data.total);
  });

  it('قيمة جنس معطوبة تُرفض', async () => {
    const res = await api
      .get('/api/admin/users?gender=Male')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('تعداد الزبائن حسب الجنس', () => {
  it('العدّادات تأتي من الخادم مع كل صفحة', async () => {
    const res = await api
      .get('/api/admin/users?page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const counts = res.body.data.genderCounts;
    expect(counts).toBeDefined();
    expect(typeof counts.total).toBe('number');
    expect(counts.male + counts.female + counts.unknown).toBe(counts.total);
  });

  it('[CRITICAL] العدّاد لا يعتمد على الصفحة المعروضة', async () => {
    const small = await api
      .get('/api/admin/users?page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const large = await api
      .get('/api/admin/users?page=1&limit=50')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(small.body.data.genderCounts).toEqual(large.body.data.genderCounts);
    expect(small.body.data.genderCounts.total).toBeGreaterThan(
      small.body.data.items.length,
    );
  });

  it('العدّاد يطابق القاعدة', async () => {
    const res = await api
      .get('/api/admin/users?limit=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const { rows } = await db.query<{ male: string; female: string; unknown: string }>(
      `SELECT COUNT(*) FILTER (WHERE gender = 'male')::text   AS male,
              COUNT(*) FILTER (WHERE gender = 'female')::text AS female,
              COUNT(*) FILTER (WHERE gender IS NULL)::text    AS unknown
         FROM users WHERE role = 'customer'`,
    );
    expect(res.body.data.genderCounts.male).toBe(Number(rows[0]!.male));
    expect(res.body.data.genderCounts.female).toBe(Number(rows[0]!.female));
    expect(res.body.data.genderCounts.unknown).toBe(Number(rows[0]!.unknown));
  });

  it('العدّادات تحترم البحث النشط', async () => {
    const res = await api
      .get('/api/admin/users?search=زبون إدارة&limit=50')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.genderCounts.total).toBe(res.body.data.total);
  });
});

describe('رقم الهاتف الكامل', () => {
  it('يُعاد كاملاً للمسؤول بلا إخفاء', async () => {
    const legacy = await findCustomer(legacyId);
    expect(legacy!.phone).toBe(legacyPhone);
    expect(String(legacy!.phone)).not.toContain('*');
    expect(String(legacy!.phone)).toMatch(/^\+964\d{10}$/);
  });

  it('[CRITICAL] المسار العام لا يكشف هاتفاً ولا جنساً', async () => {
    const products = await api.get('/api/catalog/products?limit=5').expect(200);
    const body = JSON.stringify(products.body);
    expect(body).not.toContain('"phone"');
    expect(body).not.toContain('"gender"');
  });

  it('[CRITICAL] مراجعات المنتج العامة لا تكشف هاتفاً ولا جنساً', async () => {
    const first = await api.get('/api/catalog/products?limit=1').expect(200);
    const productId = first.body.data.items[0]?.id;
    if (!productId) return;
    const reviews = await api.get(`/api/community/products/${productId}/reviews`);
    if (reviews.status !== 200) return;
    const body = JSON.stringify(reviews.body);
    expect(body).not.toContain('"phone"');
    expect(body).not.toContain('"gender"');
  });

  it('[CRITICAL] الزبون لا يرى بيانات زبون آخر عبر مسار الإدارة', async () => {
    await api
      .get('/api/admin/users?limit=50')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('الزبون يرى جنسه هو فقط عبر /auth/me', async () => {
    const me = await api
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(me.body.data.user.id).toBe(maleId);
    expect(me.body.data.user.gender).toBe('male');
  });
});

describe('صلاحية قائمة الزبائن', () => {
  it('بلا مصادقة → 401', async () => {
    await api.get('/api/admin/users').expect(401);
  });

  it('زبون مصادَق → 403', async () => {
    await api
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('[CRITICAL] زبون يحاول الترشيح بالجنس → 403 لا نتيجة', async () => {
    const res = await api
      .get('/api/admin/users?gender=female')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
    // مغلّف الخطأ يحمل `data: null` — المهم ألّا يحمل قائمةً.
    expect(res.body.data).toBeFalsy();
    expect(res.body.success).toBe(false);
  });

  it('[CRITICAL] الترشيح لا يتخطّى الحدّ الأقصى للصفحة', async () => {
    const res = await api
      .get('/api/admin/users?gender=male&limit=5000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('[CRITICAL] لا مسار إداري يعدّل جنس زبون', async () => {
    // الجنس يملكه صاحبه: يُضبط عند التسجيل ويُعدَّل من إعدادات حسابه. لا
    // مسار في `/admin` يكتبه، ومحاولة ذلك لا تغيّر القيمة.
    await api
      .patch(`/api/admin/users/${femaleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ gender: 'male' });

    const { rows } = await db.query<{ gender: string }>(
      'SELECT gender FROM users WHERE id = $1',
      [femaleId],
    );
    expect(rows[0]!.gender).toBe('female');
  });
});
