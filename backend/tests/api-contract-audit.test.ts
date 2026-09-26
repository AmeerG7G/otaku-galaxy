import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  createAdminUser,
  purgeTestUsers,
  registerAndLogin,
  seedTestCatalog,
} from './helpers.js';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { birthdayRepo } from '../src/repositories/birthdayRepo.js';
import { BIRTHDAY_DISCOUNT_PERCENT } from '../src/domain/birthday.js';
import {
  BANNER_DESTINATIONS,
  BANNER_PLACEMENTS,
  GENDERS,
  MEDIA_PURPOSES,
  NOTIFICATION_TYPES,
  REVIEW_STATUSES,
} from '../src/types/index.js';
import { ORDER_STATUSES } from '../src/types/order-status.js';

/**
 * تدقيق عقد الـAPI وسلامة البيانات (التدقيق الثالث، 2026-09-21).
 *
 * كل حالة هنا كانت إمّا عيباً مؤكَّداً أُصلح (أقسام CD-*) أو عقداً يجب أن
 * يبقى محروساً (قسم «حرّاس»). لا تعيد هذه السويت اختبار ما تغطّيه
 * `authz-matrix` (الصلاحيات) ولا `order-concurrency-audit` (التزامن).
 */

let adminToken = '';
let seed: Awaited<ReturnType<typeof seedTestCatalog>>;
const tag = randomUUID().slice(0, 8);

const A = () => ({ Authorization: `Bearer ${adminToken}` });
const U = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  adminToken = await createAdminUser();
  seed = await seedTestCatalog();
});

afterAll(async () => {
  await purgeTestUsers();
});

/** «اليوم» (يوم/شهر) بمنطقة زمنية بعينها — بساعة النظام، بلا لمس القاعدة. */
function todayIn(timeZone: string): { day: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(new Date());
  const read = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { day: read('day'), month: read('month'), year: read('year') };
}

/**
 * منطقتان على طرفي خطّ التاريخ (+14 و−11: خمس وعشرون ساعة بينهما)، فلا
 * تتّفقان على تاريخ اليوم في أي لحظة. أياً كان تقويم الجهاز، إحداهما على
 * الأقل تخالفه — وهذا ما يجعل اختبار «تقويم المتجر لا تقويم الخادم» حتمياً
 * لا مرهوناً بساعة التشغيل.
 */
const FAR_EAST = 'Pacific/Kiritimati';
const FAR_WEST = 'Pacific/Pago_Pago';

function sameDate(a: { day: number; month: number }, b: { day: number; month: number }) {
  return a.day === b.day && a.month === b.month;
}

/** منطقة يخالف تاريخُها تاريخَ الجهاز المحلي الآن (موجودة دائماً — انظر أعلاه). */
function timezoneDisagreeingWithLocal(): string {
  const local = { day: new Date().getDate(), month: new Date().getMonth() + 1 };
  return sameDate(todayIn(FAR_EAST), local) ? FAR_WEST : FAR_EAST;
}

async function customer() {
  const user = await registerAndLogin();
  return { ...user, H: U(user.token) };
}

async function createProduct(overrides: Record<string, unknown> = {}) {
  const res = await api
    .post('/api/admin/products')
    .set(A())
    .send({
      name: `منتج تدقيق ${randomUUID().slice(0, 8)}`,
      price: 1000,
      categoryId: seed.categoryId,
      stock: 5,
      ...overrides,
    });
  return res;
}

// ═══════════════════════════════════════════════════════════════════════
// CD-1 · أخطاء القاعدة المتوقَّعة (تفرّد/مفتاح أجنبي/معرّف) لا تخرج ٥٠٠
// ═══════════════════════════════════════════════════════════════════════
describe('CD-1 · تعارض التفرّد والمفاتيح الأجنبية يصل العميل برمزٍ ثابت لا ٥٠٠', () => {
  it('POST /admin/categories باسمٍ مكرّر → 409 DUPLICATE_VALUE', async () => {
    const name = `قسم مكرر ${tag}`;
    await api.post('/api/admin/categories').set(A()).send({ name }).expect(201);
    const res = await api.post('/api/admin/categories').set(A()).send({ name });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_VALUE');
    expect(res.body.message).not.toContain('duplicate key');
  });

  it('PATCH /admin/categories/:id إلى اسم قسمٍ آخر → 409', async () => {
    const first = await api.post('/api/admin/categories').set(A()).send({ name: `قسم أ ${tag}` }).expect(201);
    await api.post('/api/admin/categories').set(A()).send({ name: `قسم ب ${tag}` }).expect(201);
    const res = await api.patch(`/api/admin/categories/${first.body.data.id}`).set(A()).send({ name: `قسم ب ${tag}` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_VALUE');
  });

  it('POST /admin/subcategories بالثنائي (القسم، الاسم) المكرّر → 409', async () => {
    const res = await api
      .post('/api/admin/subcategories')
      .set(A())
      .send({ categoryId: seed.categoryId, name: 'تيشيرتات' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_VALUE');
  });

  it('PATCH /admin/subcategories/:id إلى اسم شقيقٍ قائم → 409', async () => {
    const created = await api
      .post('/api/admin/subcategories')
      .set(A())
      .send({ categoryId: seed.categoryId, name: `فرعي ${tag}` })
      .expect(201);
    const res = await api
      .patch(`/api/admin/subcategories/${created.body.data.id}`)
      .set(A())
      .send({ name: 'تيشيرتات' });
    expect(res.status).toBe(409);
  });

  /**
   * الاسم المكرَّر يُنشئه الاختبار بنفسه. كان يفترض «بغداد» موجودة — وهي من
   * `scripts/seed.ts` لا من السويت — فعلى قاعدةٍ جديدة (CI) كان أول POST يُنشئها
   * بـ201 ويسقط، ثم ينجح في كل تشغيلٍ لاحق على الأثر الذي تركه.
   */
  it('POST/PATCH /admin/governorates باسمٍ مكرّر → 409', async () => {
    const taken = `محافظة مأخوذة ${tag}`;
    const ids: string[] = [];
    try {
      const original = await api
        .post('/api/admin/governorates')
        .set(A())
        .send({ name: taken, deliveryFee: 1 })
        .expect(201);
      ids.push(original.body.data.id);

      const dup = await api.post('/api/admin/governorates').set(A()).send({ name: taken, deliveryFee: 1 });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('DUPLICATE_VALUE');

      const other = await api
        .post('/api/admin/governorates')
        .set(A())
        .send({ name: `محافظة ${tag}`, deliveryFee: 1 })
        .expect(201);
      ids.push(other.body.data.id);
      const renamed = await api
        .patch(`/api/admin/governorates/${other.body.data.id}`)
        .set(A())
        .send({ name: taken });
      expect(renamed.status).toBe(409);
      expect(renamed.body.error.code).toBe('DUPLICATE_VALUE');
    } finally {
      await db.query('DELETE FROM governorates WHERE id = ANY($1::uuid[])', [ids]);
    }
  });

  it('PATCH /admin/zones/:id إلى اسم منطقةٍ شقيقة → 409', async () => {
    const z1 = await api
      .post('/api/admin/zones')
      .set(A())
      .send({ governorateId: seed.governorateId, name: `منطقة١ ${tag}`, deliveryFee: 1 })
      .expect(201);
    await api
      .post('/api/admin/zones')
      .set(A())
      .send({ governorateId: seed.governorateId, name: `منطقة٢ ${tag}`, deliveryFee: 1 })
      .expect(201);
    const res = await api
      .patch(`/api/admin/zones/${z1.body.data.id}`)
      .set(A())
      .send({ name: `منطقة٢ ${tag}` });
    await db.query('DELETE FROM governorate_zones WHERE governorate_id = $1 AND name LIKE $2', [
      seed.governorateId,
      `%${tag}`,
    ]);
    expect(res.status).toBe(409);
  });

  it('PATCH /admin/franchises/:id إلى اسم أنمي قائم → 409 (الإنشاء كان محمياً أصلاً)', async () => {
    const f1 = await api.post('/api/admin/franchises').set(A()).send({ name: `أنمي١ ${tag}` }).expect(201);
    await api.post('/api/admin/franchises').set(A()).send({ name: `أنمي٢ ${tag}` }).expect(201);
    const res = await api
      .patch(`/api/admin/franchises/${f1.body.data.id}`)
      .set(A())
      .send({ name: `أنمي٢ ${tag}` });
    expect(res.status).toBe(409);
  });

  it('PATCH /collections/:id إلى اسم مجموعةٍ أخرى للزبون نفسه → 409 COLLECTION_NAME_TAKEN', async () => {
    const { H } = await customer();
    const first = await api.post('/api/collections').set(H).send({ name: 'أولى' }).expect(201);
    await api.post('/api/collections').set(H).send({ name: 'ثانية' }).expect(201);
    const res = await api.patch(`/api/collections/${first.body.data.id}`).set(H).send({ name: 'ثانية' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COLLECTION_NAME_TAKEN');
    // الاسم القديم باقٍ — لا كتابة جزئية.
    const { rows } = await db.query<{ name: string }>('SELECT name FROM collections WHERE id = $1', [
      first.body.data.id,
    ]);
    expect(rows[0]!.name).toBe('أولى');
  });

  it('POST /admin/notifications لمستخدمٍ لا وجود له → 404 لا ٥٠٠', async () => {
    const res = await api
      .post('/api/admin/notifications')
      .set(A())
      .send({ userId: randomUUID(), title: 'تجربة' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /admin/products/:id/franchises بمعرّفٍ ليس UUID → 400 لا ٥٠٠', async () => {
    const res = await api.get('/api/admin/products/not-a-uuid/franchises').set(A());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('المترجم المركزي: أصناف السلامة فقط تصير 4xx، وما عداها يبقى ٥٠٠', async () => {
    // استيرادٌ متأخّر: غيابُ الدالة يجب أن يُسقط هذا الاختبار وحده لا الملف كله.
    const { pgErrorToAppError } = (await import('../src/middleware/error-handler.js')) as unknown as {
      pgErrorToAppError: (error: unknown) => { statusCode: number } | null;
    };
    expect(typeof pgErrorToAppError).toBe('function');
    const pg = (code: string, extra: Record<string, unknown> = {}) =>
      Object.assign(new Error('pg'), { code, ...extra });
    expect(pgErrorToAppError(pg('23505'))?.statusCode).toBe(409);
    expect(pgErrorToAppError(pg('23503', { detail: 'Key (user_id)=(x) is not present in table "users".' }))?.statusCode).toBe(404);
    expect(pgErrorToAppError(pg('23503', { detail: 'Key (id)=(x) is still referenced from table "orders".' }))?.statusCode).toBe(409);
    expect(pgErrorToAppError(pg('23514'))?.statusCode).toBe(400);
    expect(pgErrorToAppError(pg('22P02'))?.statusCode).toBe(400);
    expect(pgErrorToAppError(pg('22003'))?.statusCode).toBe(400);
    expect(pgErrorToAppError(pg('22001'))?.statusCode).toBe(400);
    // أعطال حقيقية: انقطاع، جمود، صياغة — تبقى «خطأ غير متوقَّع».
    for (const code of ['40P01', '40001', '42601', '08006', '57P01']) {
      expect(pgErrorToAppError(pg(code))).toBeNull();
    }
    expect(pgErrorToAppError(new Error('plain'))).toBeNull();
    expect(pgErrorToAppError({ code: 42 })).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CD-2 · القسم الفرعي يتبع قسم المنتج
// ═══════════════════════════════════════════════════════════════════════
describe('CD-2 · القسم الفرعي للمنتج يجب أن يتبع قسمه', () => {
  let otherCategoryId = '';
  let otherSubcategoryId = '';

  beforeAll(async () => {
    const category = await api
      .post('/api/admin/categories')
      .set(A())
      .send({ name: `قسم آخر ${tag}` })
      .expect(201);
    otherCategoryId = category.body.data.id;
    const sub = await api
      .post('/api/admin/subcategories')
      .set(A())
      .send({ categoryId: otherCategoryId, name: `فرعي آخر ${tag}` })
      .expect(201);
    otherSubcategoryId = sub.body.data.id;
  });

  it('الإنشاء بقسمٍ فرعي من قسمٍ آخر → 400 SUBCATEGORY_MISMATCH ولا صفّ يُكتب', async () => {
    const name = `منتج متناقض ${tag}`;
    const res = await createProduct({ name, categoryId: otherCategoryId, subcategoryId: seed.subcategoryId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SUBCATEGORY_MISMATCH');
    const { rows } = await db.query('SELECT 1 FROM products WHERE name = $1', [name]);
    expect(rows).toHaveLength(0);
  });

  it('التعديل: تغيير القسم الفرعي إلى قسمٍ آخر → 400', async () => {
    const created = await createProduct({ subcategoryId: seed.subcategoryId });
    expect(created.status).toBe(201);
    const res = await api
      .patch(`/api/admin/products/${created.body.data.id}`)
      .set(A())
      .send({ subcategoryId: otherSubcategoryId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SUBCATEGORY_MISMATCH');
  });

  it('التعديل: نقل القسم وحده بينما القسم الفرعي القديم لا يتبعه → 400', async () => {
    const created = await createProduct({ subcategoryId: seed.subcategoryId });
    const res = await api
      .patch(`/api/admin/products/${created.body.data.id}`)
      .set(A())
      .send({ categoryId: otherCategoryId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SUBCATEGORY_MISMATCH');
    // النقل الصحيح: القسم ومعه فرعيّه، أو القسم مع `subcategoryId: null`.
    await api
      .patch(`/api/admin/products/${created.body.data.id}`)
      .set(A())
      .send({ categoryId: otherCategoryId, subcategoryId: otherSubcategoryId })
      .expect(200);
    await api
      .patch(`/api/admin/products/${created.body.data.id}`)
      .set(A())
      .send({ categoryId: seed.categoryId, subcategoryId: null })
      .expect(200);
  });

  it('القسم الفرعي الغائب عن التحديث يبقى كما هو (لا مسح ولا رفض)', async () => {
    const created = await createProduct({ subcategoryId: seed.subcategoryId });
    const res = await api
      .patch(`/api/admin/products/${created.body.data.id}`)
      .set(A())
      .send({ price: 2000 })
      .expect(200);
    expect(res.body.data.subcategoryId).toBe(seed.subcategoryId);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CD-3 · لا إكراهَ أنواعٍ في أجسام JSON: null ≠ 0 و true ≠ 1
// ═══════════════════════════════════════════════════════════════════════
describe('CD-3 · القيم الرقمية في الجسم تُرفض إن لم تكن أرقاماً', () => {
  let zoneId = '';
  beforeAll(async () => {
    const zone = await api
      .post('/api/admin/zones')
      .set(A())
      .send({ governorateId: seed.governorateId, name: `منطقة رسوم ${tag}`, deliveryFee: 2500 })
      .expect(201);
    zoneId = zone.body.data.id;
  });
  afterAll(async () => {
    await db.query('DELETE FROM governorate_zones WHERE id = $1', [zoneId]);
  });

  it('رسوم المنطقة: null و"" و[] و true → 400 ولا تتحوّل إلى ٠ أو ١', async () => {
    for (const value of [null, '', [], true, '2500']) {
      const res = await api.patch(`/api/admin/zones/${zoneId}`).set(A()).send({ deliveryFee: value });
      expect(res.status, `deliveryFee=${JSON.stringify(value)}`).toBe(400);
    }
    const { rows } = await db.query<{ delivery_fee: string }>(
      'SELECT delivery_fee FROM governorate_zones WHERE id = $1',
      [zoneId],
    );
    expect(Number(rows[0]!.delivery_fee)).toBe(2500);
  });

  it('رسوم المنطقة وترتيبها فوق سقف العمود → 400 لا ٥٠٠ (فيض NUMERIC/int4)', async () => {
    const fee = await api.patch(`/api/admin/zones/${zoneId}`).set(A()).send({ deliveryFee: 1e13 });
    expect(fee.status).toBe(400);
    const order = await api.patch(`/api/admin/zones/${zoneId}`).set(A()).send({ sortOrder: 2_147_483_648 });
    expect(order.status).toBe(400);
    const franchise = await api
      .post('/api/admin/franchises')
      .set(A())
      .send({ name: `أنمي ترتيب ${tag}`, sortOrder: 2_147_483_648 });
    expect(franchise.status).toBe(400);
  });

  it('تقييم المنتج: true و"3" و null → 400 — لا نجمة واحدة من قيمةٍ منطقية', async () => {
    const { H } = await customer();
    for (const rating of [true, '3', null]) {
      const res = await api
        .post('/api/reviews')
        .set(H)
        .send({ orderId: randomUUID(), productId: randomUUID(), rating, comment: 'x' });
      expect(res.status, `rating=${JSON.stringify(rating)}`).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('عيد الميلاد: day=true أو month="1" → 400 — لا «١ كانون الثاني» من true', async () => {
    const { H } = await customer();
    for (const body of [{ day: true, month: 1 }, { day: 1, month: '1' }, { day: null, month: 1 }]) {
      const res = await api.post('/api/birthday').set(H).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('تذكير الاستلام: remindAt=null أو delayHours="1" → 400 — لا موعد من بداية العصر', async () => {
    for (const body of [{ remindAt: null }, { delayHours: '1' }, { remindAt: 0 }, { remindAt: 'غداً' }]) {
      const res = await api.patch(`/api/admin/orders/${randomUUID()}/reminder`).set(A()).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CD-4 · عيد الميلاد يُقاس بتقويم المتجر لا بساعة الخادم
// ═══════════════════════════════════════════════════════════════════════
describe('CD-4 · «عيد ميلادي اليوم» بتقويم المتجر (config.storeTimezone) لا بمنطقة العملية', () => {
  const originalTimezone = config.storeTimezone;
  afterEach(() => {
    (config as { storeTimezone: string }).storeTimezone = originalTimezone;
  });

  it('المستودع: التاريخ يُحسم بالمنطقة المُمرَّرة — منطقتان على طرفي خطّ التاريخ تختلفان', async () => {
    const user = await registerAndLogin();
    const zone = timezoneDisagreeingWithLocal();
    const other = zone === FAR_EAST ? FAR_WEST : FAR_EAST;
    const today = todayIn(zone);
    await db.query('UPDATE users SET birth_day = $2, birth_month = $3 WHERE id = $1', [
      user.userId,
      today.day,
      today.month,
    ]);
    const inZone = await birthdayRepo.status(db, user.userId, zone);
    expect(inZone.isBirthdayToday).toBe(true);
    const elsewhere = await birthdayRepo.status(db, user.userId, other);
    expect(elsewhere.isBirthdayToday).toBe(false);
  });

  it('المستودع: سنة الاستهلاك تُكتب بتقويم المنطقة نفسها التي حكمت على «اليوم»', async () => {
    const user = await registerAndLogin();
    const zone = timezoneDisagreeingWithLocal();
    const { rows: [order] } = await db.query<{ id: string }>(
      `INSERT INTO orders (number, user_id, governorate_id, province, delivery_fee, full_address, phone,
                           products_total, discount, total)
       VALUES (nextval('order_number_seq')::text, $1, $2, 'بغداد', 0, 'عنوان', $3, 0, 0, 0) RETURNING id`,
      [user.userId, seed.governorateId, user.phone],
    );
    expect(await birthdayRepo.consume(db, user.userId, order!.id, 500, zone)).toBe(true);
    const { rows } = await db.query<{ used_year: number }>(
      'SELECT used_year FROM birthday_discount_usage WHERE user_id = $1',
      [user.userId],
    );
    expect(rows[0]!.used_year).toBe(todayIn(zone).year);
  });

  it('عبر الـAPI: خصم الميلاد يُمنح حين يكون اليوم عيداً بتقويم المتجر — أياً كان تقويم الخادم', async () => {
    const zone = timezoneDisagreeingWithLocal();
    (config as { storeTimezone: string }).storeTimezone = zone;
    const user = await customer();
    const today = todayIn(zone);
    // أهلية الميلاد: طلب مكتمل واحد + تاريخ مسجَّل (بتقويم المتجر).
    await db.query(
      'UPDATE users SET birth_day = $2, birth_month = $3, birthday_set_at = now() WHERE id = $1',
      [user.userId, today.day, today.month],
    );
    const status = await api.get('/api/birthday').set(user.H).expect(200);
    expect(status.body.data.isBirthdayToday).toBe(true);
    expect(status.body.data.rewardAvailable).toBe(true);

    await api.post('/api/cart').set(user.H).send({ productId: seed.productIds[0], quantity: 2 }).expect(200);
    const order = await api
      .post('/api/orders')
      .set(user.H)
      .send({ governorateId: seed.governorateId, fullAddress: 'شارع الاختبار ١٢', phone: user.phone })
      .expect(201);
    const productsTotal = 2 * 15000;
    expect(order.body.data.discount).toBe(Math.round((productsTotal * BIRTHDAY_DISCOUNT_PERCENT) / 100));
    expect(order.body.data.total).toBe(productsTotal + 4000 - order.body.data.discount);
  });

  it('عبر الـAPI: لا خصم حين لا يكون اليوم عيداً بتقويم المتجر ولو كان عيداً بتقويم الخادم', async () => {
    const zone = timezoneDisagreeingWithLocal();
    (config as { storeTimezone: string }).storeTimezone = zone;
    const user = await customer();
    const local = new Date();
    await db.query(
      'UPDATE users SET birth_day = $2, birth_month = $3, birthday_set_at = now() WHERE id = $1',
      [user.userId, local.getDate(), local.getMonth() + 1],
    );
    const status = await api.get('/api/birthday').set(user.H).expect(200);
    expect(status.body.data.isBirthdayToday).toBe(false);
    expect(status.body.data.rewardAvailable).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CD-7 · تعداد أنواع الإشعارات واحد في كل الطبقات
// ═══════════════════════════════════════════════════════════════════════
describe('CD-7 · أنواع الإشعارات: القاعدة == الخادم == مرشِّح اللوحة', () => {
  it('GET /admin/notifications?type= يقبل كل نوعٍ تعرفه القاعدة', async () => {
    for (const type of NOTIFICATION_TYPES) {
      const res = await api.get('/api/admin/notifications').set(A()).query({ type });
      expect(res.status, type).toBe(200);
    }
    await api.get('/api/admin/notifications').set(A()).query({ type: 'bogus' }).expect(400);
  });

  it('قائمة اللوحة (admin/src/types/notifications.ts) تحمل الأنواع كلها', async () => {
    const file = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../admin/src/types/notifications.ts',
    );
    const source = await readFile(file, 'utf8');
    for (const type of NOTIFICATION_TYPES) {
      expect(source, type).toContain(`'${type}'`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CD-8 · حدّ اسم المنتج عند الحدّ لا عند القاعدة
// ═══════════════════════════════════════════════════════════════════════
describe('CD-8 · اسم المنتج: المدقّق يطابق قيد القاعدة (١٢٠ حرفاً)', () => {
  it('اسم من ١٢١ حرفاً → 400 VALIDATION_ERROR لا «قيمة غير صالحة لأحد الحقول»', async () => {
    const res = await createProduct({ name: 'م'.repeat(121) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('اسم من ١٢٠ حرفاً يمرّ', async () => {
    const res = await createProduct({ name: 'م'.repeat(120) });
    expect(res.status).toBe(201);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// حرّاس العقد — لا عيوب، بل ما يجب أن يبقى صحيحاً
// ═══════════════════════════════════════════════════════════════════════
describe('حرّاس · الحقول التي يملكها الخادم لا يكتبها العميل', () => {
  it('إنشاء الطلب يتجاهل أي مجموع أو حالة أو مالك يرسله العميل', async () => {
    const user = await customer();
    await api.post('/api/cart').set(user.H).send({ productId: seed.productIds[0], quantity: 2 }).expect(200);
    const res = await api
      .post('/api/orders')
      .set(user.H)
      .send({
        governorateId: seed.governorateId,
        fullAddress: 'شارع الاختبار ١٢',
        phone: user.phone,
        total: 1,
        productsTotal: 1,
        deliveryFee: 0,
        discount: 999_999,
        deliveryDiscount: 999_999,
        status: 'COMPLETED',
        userId: randomUUID(),
        items: [{ productId: seed.productIds[1], quantity: 99, price: 1 }],
      })
      .expect(201);
    const order = res.body.data;
    expect(order.status).toBe('PENDING_ADMIN_CONFIRMATION');
    expect(order.productsTotal).toBe(30000);
    expect(order.deliveryFee).toBe(4000);
    expect(order.discount).toBe(0);
    expect(order.total).toBe(34000);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].quantity).toBe(2);
    const { rows } = await db.query<{ user_id: string; total: string }>(
      'SELECT user_id, total FROM orders WHERE id = $1',
      [order.id],
    );
    expect(rows[0]!.user_id).toBe(user.userId);
    expect(Number(rows[0]!.total)).toBe(34000);
  });

  it('PATCH /auth/me يتجاهل role/isActive/phone/points', async () => {
    const user = await customer();
    const res = await api
      .patch('/api/auth/me')
      .set(user.H)
      .send({ username: 'مغيَّر', role: 'admin', isActive: false, phone: '+9647800000001', points: 9999 })
      .expect(200);
    expect(res.body.data.user.role).toBe('customer');
    expect(res.body.data.user.phone).toBe(user.phone);
    const { rows } = await db.query<{ role: string; is_active: boolean; phone: string }>(
      'SELECT role, is_active, phone FROM users WHERE id = $1',
      [user.userId],
    );
    expect(rows[0]).toMatchObject({ role: 'customer', is_active: true, phone: user.phone });
  });

  it('التسجيل يتجاهل role وisPhoneVerified وid', async () => {
    const phone = `077${Math.floor(10000000 + Math.random() * 89999999)}`;
    const res = await api
      .post('/api/auth/register')
      .send({ username: 'دخيل', phone, password: 'secret123', gender: 'male', role: 'admin', isPhoneVerified: true, id: randomUUID() })
      .expect(202);
    expect(res.body.data.user.role).toBe('customer');
    expect(res.body.data.user.isPhoneVerified).toBe(false);
  });

  it('المنتج: rating وreviewCount يتجاهلهما الإنشاء والتعديل', async () => {
    const created = await createProduct({ rating: 5, reviewCount: 100 });
    expect(created.status).toBe(201);
    expect(created.body.data.rating).toBeNull();
    expect(created.body.data.reviewCount).toBe(0);
    const updated = await api
      .patch(`/api/admin/products/${created.body.data.id}`)
      .set(A())
      .send({ rating: 5, reviewCount: 100 })
      .expect(200);
    expect(updated.body.data.rating).toBeNull();
    expect(updated.body.data.reviewCount).toBe(0);
  });

  it('تسجيل الجهاز يتجاهل userId في الجسم — الرمز لصاحب الجلسة وحده', async () => {
    const owner = await customer();
    const token = `tok-${randomUUID()}`;
    await api
      .post('/api/devices')
      .set(owner.H)
      .send({ token, platform: 'android', userId: randomUUID() })
      .expect(200);
    const { rows } = await db.query<{ user_id: string }>('SELECT user_id FROM device_tokens WHERE token = $1', [token]);
    expect(rows[0]!.user_id).toBe(owner.userId);
  });
});

describe('حرّاس · دلالات الغياب و null في التعديل', () => {
  it('المنتج: الغائب يبقى، وnull يمسح (previousPrice/subcategoryId/restockAt)', async () => {
    const restockAt = '2030-01-01T10:00:00.000Z';
    const created = await createProduct({
      price: 1000,
      previousPrice: 2000,
      subcategoryId: seed.subcategoryId,
      restockAt,
      stock: 0,
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const untouched = await api.patch(`/api/admin/products/${id}`).set(A()).send({ description: 'x' }).expect(200);
    expect(untouched.body.data.previousPrice).toBe(2000);
    expect(untouched.body.data.subcategoryId).toBe(seed.subcategoryId);
    expect(untouched.body.data.restockAt).toBe(restockAt);

    const cleared = await api
      .patch(`/api/admin/products/${id}`)
      .set(A())
      .send({ previousPrice: null, subcategoryId: null, restockAt: null })
      .expect(200);
    expect(cleared.body.data.previousPrice).toBeNull();
    expect(cleared.body.data.discountPercent).toBeNull();
    expect(cleared.body.data.subcategoryId).toBeNull();
    expect(cleared.body.data.restockAt).toBeNull();
  });

  it('المنتج: images: [] وoptions: [] تمسحان، وغيابهما يحفظ', async () => {
    const created = await createProduct({
      images: ['/uploads/a.png'],
      options: [{ name: 'اللون', values: ['أحمر'] }],
    });
    const id = created.body.data.id;
    const kept = await api.patch(`/api/admin/products/${id}`).set(A()).send({ price: 1500 }).expect(200);
    expect(kept.body.data.images).toEqual(['/uploads/a.png']);
    const { rows: before } = await db.query('SELECT 1 FROM product_options WHERE product_id = $1', [id]);
    expect(before).toHaveLength(1);
    await api.patch(`/api/admin/products/${id}`).set(A()).send({ images: [], options: [] }).expect(200);
    const { rows: after } = await db.query('SELECT 1 FROM product_options WHERE product_id = $1', [id]);
    expect(after).toHaveLength(0);
  });

  it('البنر: title: null يمسح، وغيابه يحفظ، وdestinationType الغائب لا يعود إلى none', async () => {
    const created = await api
      .post('/api/admin/banners')
      .set(A())
      .send({ imageUrl: '/uploads/b.png', title: 'عنوان', destinationType: 'category', destinationValue: 'x' })
      .expect(201);
    const id = created.body.data.id;
    const kept = await api.patch(`/api/admin/banners/${id}`).set(A()).send({ imageUrl: '/uploads/c.png' }).expect(200);
    expect(kept.body.data.title).toBe('عنوان');
    expect(kept.body.data.destinationType).toBe('category');
    const cleared = await api.patch(`/api/admin/banners/${id}`).set(A()).send({ title: null }).expect(200);
    expect(cleared.body.data.title).toBeNull();
  });

  it('الملف الشخصي: avatarUrl: null يمسح الصورة، و"" تُرفض، وغيابه يحفظها', async () => {
    const user = await customer();
    const storageKey = `avatar/test/${randomUUID()}.png`;
    const url = `${config.uploads.publicPath}/${storageKey}`;
    await db.query(
      `INSERT INTO media_files (storage_key, url, purpose, mime_type, size_bytes, uploaded_by)
       VALUES ($1, $2, 'avatar', 'image/png', 10, $3)`,
      [storageKey, url, user.userId],
    );
    const set = await api.patch('/api/auth/me').set(user.H).send({ avatarUrl: url }).expect(200);
    expect(set.body.data.user.avatarUrl).toBe(url);
    const kept = await api.patch('/api/auth/me').set(user.H).send({ username: 'اسم جديد' }).expect(200);
    expect(kept.body.data.user.avatarUrl).toBe(url);
    // «فارغ» ليس «لا صورة»: التطبيق يرسل `null` للمسح (auth_repository_impl.dart).
    await api.patch('/api/auth/me').set(user.H).send({ avatarUrl: '' }).expect(400);
    const cleared = await api.patch('/api/auth/me').set(user.H).send({ avatarUrl: null }).expect(200);
    expect(cleared.body.data.user.avatarUrl).toBeNull();
  });
});

describe('حرّاس · المال والكميات', () => {
  it('مجاميع الطلب بأسعارٍ عشرية تُقرَّب مرّةً واحدة في القاعدة وتتّسق مع القيود', async () => {
    const product = await createProduct({ price: 1234.57, stock: 10, hasDeliveryPromo: true, deliveryPromoAmount: 1500.25 });
    expect(product.status).toBe(201);
    const user = await customer();
    await api.post('/api/cart').set(user.H).send({ productId: product.body.data.id, quantity: 3 }).expect(200);
    const res = await api
      .post('/api/orders')
      .set(user.H)
      .send({ governorateId: seed.governorateId, fullAddress: 'شارع الاختبار ١٢', phone: user.phone })
      .expect(201);
    const order = res.body.data;
    // 1234.57 × 3 = 3703.71؛ ترويج التوصيل 1500.25 × 3 = 4500.75 > الرسوم 4000.
    expect(order.productsTotal).toBe(3703.71);
    expect(order.deliveryFee).toBe(4000);
    expect(order.deliveryDiscount).toBe(4000);
    expect(order.total).toBe(3703.71);
    const { rows } = await db.query<{ products_total: string; delivery_discount_excess: string; total: string }>(
      'SELECT products_total, delivery_discount_excess, total FROM orders WHERE id = $1',
      [order.id],
    );
    expect(rows[0]!.products_total).toBe('3703.71');
    expect(rows[0]!.delivery_discount_excess).toBe('500.75');
    expect(rows[0]!.total).toBe('3703.71');
  });

  it('الكمية والمخزون والسعر: الحدود ترفض الصفر والسالب والكسور في مواضعها', async () => {
    const user = await customer();
    for (const quantity of [0, -1, 1.5, 101, '2', null]) {
      const res = await api.post('/api/cart').set(user.H).send({ productId: seed.productIds[0], quantity });
      expect(res.status, `quantity=${JSON.stringify(quantity)}`).toBe(400);
    }
    for (const body of [{ price: 0 }, { price: -1 }, { price: 1_000_000_001 }, { stock: -1 }, { stock: 1.5 }, { stock: 100_001 }]) {
      const res = await createProduct(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe('حرّاس · التعدادات: القاعدة == الشيفرة', () => {
  async function checkValues(table: string, constraint: string): Promise<string[]> {
    const { rows } = await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = $1 AND c.conname = $2`,
      [table, constraint],
    );
    const def = rows[0]?.def ?? '';
    return [...def.matchAll(/'([^']+)'::text/g)].map((m) => m[1]!);
  }

  it.each([
    ['orders', 'orders_status_check', ORDER_STATUSES],
    ['reviews', 'reviews_status_check', REVIEW_STATUSES],
    ['notifications', 'notifications_type_check', NOTIFICATION_TYPES],
    ['media_files', 'media_files_purpose_check', MEDIA_PURPOSES],
    ['users', 'users_gender_check', GENDERS],
    ['banners', 'banners_placement_check', BANNER_PLACEMENTS],
    ['banners', 'banners_destination_type_check', BANNER_DESTINATIONS],
  ])('%s.%s يطابق ثابت الشيفرة حرفياً', async (table, constraint, values) => {
    const inDb = await checkValues(table, constraint);
    expect(new Set(inDb)).toEqual(new Set(values));
  });

  it('حالة الطلب: قيمة خارج التعداد أو بحروفٍ صغيرة تُرفض عند الحدّ', async () => {
    const res = await api
      .patch(`/api/admin/orders/${randomUUID()}/status`)
      .set(A())
      .send({ status: 'completed' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('حرّاس · شكل الاستجابة لا يسرّب أعمدةً حسّاسة', () => {
  const FORBIDDEN = ['password_hash', 'passwordHash', 'token_version', 'tokenVersion', 'storage_key'];

  it('ملف الزبون للإدارة، وقائمة الزبائن، وطلبات الحساب، والملف الشخصي — كلها خالية منها', async () => {
    const user = await customer();
    const bodies = await Promise.all([
      api.get(`/api/admin/customers/${user.userId}`).set(A()).expect(200),
      api.get('/api/admin/users').set(A()).query({ search: user.phone }).expect(200),
      api.get('/api/admin/account-requests').set(A()).query({ search: user.phone }).expect(200),
      api.get('/api/auth/me').set(user.H).expect(200),
      api.get(`/api/admin/customers/${user.userId}/points`).set(A()).expect(200),
    ]);
    for (const res of bodies) {
      const text = JSON.stringify(res.body);
      for (const key of FORBIDDEN) expect(text).not.toContain(key);
    }
  });

  it('الطلب كما يراه الزبون لا يحمل الفائض المحاسبي، والإدارة تراه', async () => {
    const user = await customer();
    await api.post('/api/cart').set(user.H).send({ productId: seed.productIds[0], quantity: 1 }).expect(200);
    const created = await api
      .post('/api/orders')
      .set(user.H)
      .send({ governorateId: seed.governorateId, fullAddress: 'شارع الاختبار ١٢', phone: user.phone })
      .expect(201);
    const mine = await api.get(`/api/orders/${created.body.data.id}`).set(user.H).expect(200);
    expect(mine.body.data).not.toHaveProperty('deliveryDiscountExcess');
    const admin = await api.get(`/api/admin/orders/${created.body.data.id}`).set(A()).expect(200);
    expect(admin.body.data).toHaveProperty('deliveryDiscountExcess', 0);
  });
});

describe('حرّاس · الترقيم', () => {
  it('حدود page وlimit تُرفض عند الحدّ: صفر وسالب وفوق السقف وغير الرقمي', async () => {
    for (const query of [{ page: 0 }, { page: -1 }, { limit: 0 }, { limit: 51 }, { page: 'x' }, { page: '1e300' }]) {
      const res = await api.get('/api/catalog/products').query(query);
      expect(res.status, JSON.stringify(query)).toBe(400);
    }
    const far = await api.get('/api/catalog/products').query({ page: 100000 }).expect(200);
    expect(far.body.data.items).toEqual([]);
    expect(far.body.data.hasMore).toBe(false);
  });

  it('total وhasMore يتّسقان مع الصفحات', async () => {
    const first = await api.get('/api/catalog/products').query({ page: 1, limit: 2 }).expect(200);
    expect(first.body.data.limit).toBe(2);
    expect(first.body.data.hasMore).toBe(first.body.data.total > 2);
  });
});
