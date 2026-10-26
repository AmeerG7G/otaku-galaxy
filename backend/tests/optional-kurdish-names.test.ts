import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser } from './helpers.js';

/**
 * [PRODUCT] (المالك، 2026-10-26) الأسماء الكردية اختيارية في كل محتوى تديره
 * اللوحة وله عمود `*_ckb` (046): الأقسام، الأقسام الفرعية، المحافظات، المناطق.
 *
 * ما يُثبَّت بالمسار الحقيقي (HTTP ← خدمة ← PostgreSQL):
 *   - الإنشاء بلا كردية يُقبل ويُخزَّن NULL، والزبون الكردي يرى العربية.
 *   - إضافة الكردية لاحقاً تظهر للزبون الكردي بلا إعادة إنشاء.
 *   - `null` أو الفارغ يمسح الكردية وحدها؛ والعربية لا تُمسّ بتعديل الكردية ولا العكس.
 *   - رسائل الرفض عربيةٌ تسمّي الحقل ولغته (لا رسائل zod الإنجليزية).
 *
 * قبل هذا لم يكن للوحة ولا للـAPI مفتاحٌ كرديّ لهذه الأنواع: ما ملأته الهجرة
 * 047 بقي، وكل جديدٍ عربيٌّ إلى الأبد.
 */

const STAMP = `OK${randomUUID().slice(0, 8)}`;
let adminToken: string;
const A = () => ({ Authorization: `Bearer ${adminToken}` });
const created = { categories: [] as string[], governorates: [] as string[] };

beforeAll(async () => {
  adminToken = await createAdminUser();
});

afterAll(async () => {
  await db.query('DELETE FROM subcategories WHERE category_id = ANY($1::uuid[])', [created.categories]);
  await db.query('DELETE FROM categories WHERE id = ANY($1::uuid[])', [created.categories]);
  await db.query('DELETE FROM governorate_zones WHERE governorate_id = ANY($1::uuid[])', [created.governorates]);
  await db.query('DELETE FROM governorates WHERE id = ANY($1::uuid[])', [created.governorates]);
});

async function nameCkbOf(table: string, id: string) {
  const { rows } = await db.query<{ name: string; name_ckb: string | null }>(
    `SELECT name, name_ckb FROM ${table} WHERE id = $1`,
    [id],
  );
  return rows[0]!;
}

async function publicCategory(id: string, lang: 'ar' | 'ckb') {
  const res = await api.get('/api/catalog/categories').set('Accept-Language', lang).expect(200);
  const items = (res.body.data.items ?? res.body.data) as Array<{
    id: string;
    name: string;
    subcategories: Array<{ id: string; name: string }>;
  }>;
  return items.find((c) => c.id === id)!;
}

describe('الأقسام والأقسام الفرعية', () => {
  it('[CRITICAL] إنشاء بلا كردية ← NULL، والزبون الكردي يرى العربية', async () => {
    const res = await api
      .post('/api/admin/categories')
      .set(A())
      .send({ name: `قسم ${STAMP}` })
      .expect(201);
    const id = res.body.data.id as string;
    created.categories.push(id);
    expect(await nameCkbOf('categories', id)).toEqual({ name: `قسم ${STAMP}`, name_ckb: null });
    expect((await publicCategory(id, 'ckb')).name).toBe(`قسم ${STAMP}`);
  });

  it('إضافة الكردية لاحقاً تظهر للكردي، والعربي يبقى عربياً، ثم المسح يعيد العربية', async () => {
    const id = (
      await api.post('/api/admin/categories').set(A()).send({ name: `قسم لاحق ${STAMP}`, nameCkb: '' }).expect(201)
    ).body.data.id as string;
    created.categories.push(id);
    expect((await nameCkbOf('categories', id)).name_ckb).toBeNull();

    await api.patch(`/api/admin/categories/${id}`).set(A()).send({ nameCkb: `بەش ${STAMP}` }).expect(200);
    expect((await publicCategory(id, 'ckb')).name).toBe(`بەش ${STAMP}`);
    expect((await publicCategory(id, 'ar')).name).toBe(`قسم لاحق ${STAMP}`);

    // تعديل العربية لا يمسّ الكردية.
    await api.patch(`/api/admin/categories/${id}`).set(A()).send({ name: `قسم معدَّل ${STAMP}` }).expect(200);
    expect(await nameCkbOf('categories', id)).toEqual({ name: `قسم معدَّل ${STAMP}`, name_ckb: `بەش ${STAMP}` });

    // المسح بـnull: العربية لا تُمسّ، والكردي يرى العربية.
    await api.patch(`/api/admin/categories/${id}`).set(A()).send({ nameCkb: null }).expect(200);
    expect(await nameCkbOf('categories', id)).toEqual({ name: `قسم معدَّل ${STAMP}`, name_ckb: null });
    expect((await publicCategory(id, 'ckb')).name).toBe(`قسم معدَّل ${STAMP}`);
  });

  it('القسم الفرعي: إنشاء بلا كردية ومعها، ثم المسح بالفارغ', async () => {
    const categoryId = (
      await api.post('/api/admin/categories').set(A()).send({ name: `أب ${STAMP}` }).expect(201)
    ).body.data.id as string;
    created.categories.push(categoryId);

    const plain = await api
      .post('/api/admin/subcategories')
      .set(A())
      .send({ categoryId, name: `فرعي ${STAMP}` })
      .expect(201);
    expect(plain.body.data.nameCkb).toBeNull();

    const both = await api
      .post('/api/admin/subcategories')
      .set(A())
      .send({ categoryId, name: `فرعي ثانٍ ${STAMP}`, nameCkb: `لاوەکی ${STAMP}` })
      .expect(201);
    const subId = both.body.data.id as string;
    expect(both.body.data.nameCkb).toBe(`لاوەکی ${STAMP}`);

    const ckb = await publicCategory(categoryId, 'ckb');
    expect(ckb.subcategories.map((s) => s.name).sort()).toEqual(
      [`فرعي ${STAMP}`, `لاوەکی ${STAMP}`].sort(),
    );

    const cleared = await api
      .patch(`/api/admin/subcategories/${subId}`)
      .set(A())
      .send({ nameCkb: '   ' })
      .expect(200);
    expect(cleared.body.data).toMatchObject({ name: `فرعي ثانٍ ${STAMP}`, nameCkb: null });
  });

  it('رسائل الرفض عربية تسمّي الحقل ولغته', async () => {
    const short = await api.post('/api/admin/categories').set(A()).send({ name: 'ق' }).expect(400);
    expect(short.body.message).toBe('اسم القسم قصير جداً (حرفان كحد أدنى)');
    const longCkb = await api
      .post('/api/admin/categories')
      .set(A())
      .send({ name: `قسم ${STAMP} طويل`, nameCkb: 'ب'.repeat(61) })
      .expect(400);
    expect(longCkb.body.message).toBe('اسم القسم بالكردية طويل جداً (60 حرفاً كحد أقصى)');
    const wrongType = await api
      .post('/api/admin/categories')
      .set(A())
      .send({ name: `قسم ${STAMP} نوع`, nameCkb: 5 })
      .expect(400);
    expect(wrongType.body.message).toBe('اسم القسم بالكردية يجب أن يكون نصاً');
  });
});

describe('المحافظات والمناطق', () => {
  it('[CRITICAL] محافظة بلا كردية ثم بها ثم مسحها — والزبون الكردي يتبعها', async () => {
    const res = await api
      .post('/api/admin/governorates')
      .set(A())
      .send({ name: `محافظة ${STAMP}`, deliveryFee: 5000 })
      .expect(201);
    const id = res.body.data.id as string;
    created.governorates.push(id);
    expect((await nameCkbOf('governorates', id)).name_ckb).toBeNull();

    const listed = await api.get('/api/admin/governorates').set(A()).expect(200);
    const items = (listed.body.data.items ?? listed.body.data) as Array<{ id: string; nameCkb: string | null }>;
    expect(items.find((g) => g.id === id)).toMatchObject({ nameCkb: null });

    const publicName = async () => {
      const r = await api.get('/api/catalog/governorates').set('Accept-Language', 'ckb').expect(200);
      return (r.body.data.items as Array<{ id: string; name: string }>).find((g) => g.id === id)!.name;
    };
    expect(await publicName()).toBe(`محافظة ${STAMP}`);

    await api.patch(`/api/admin/governorates/${id}`).set(A()).send({ nameCkb: `پارێزگا ${STAMP}` }).expect(200);
    expect(await publicName()).toBe(`پارێزگا ${STAMP}`);

    await api.patch(`/api/admin/governorates/${id}`).set(A()).send({ deliveryFee: 6000 }).expect(200);
    expect((await nameCkbOf('governorates', id)).name_ckb).toBe(`پارێزگا ${STAMP}`);

    await api.patch(`/api/admin/governorates/${id}`).set(A()).send({ nameCkb: null }).expect(200);
    expect(await publicName()).toBe(`محافظة ${STAMP}`);
  });

  it('منطقة: إنشاء بلا كردية ومعها، المسح، والعربية لا تُمسّ', async () => {
    const governorateId = (
      await api
        .post('/api/admin/governorates')
        .set(A())
        .send({ name: `محافظة مناطق ${STAMP}`, deliveryFee: 5000 })
        .expect(201)
    ).body.data.id as string;
    created.governorates.push(governorateId);

    const plain = await api
      .post('/api/admin/zones')
      .set(A())
      .send({ governorateId, name: `منطقة ${STAMP}`, deliveryFee: 3000 })
      .expect(201);
    expect(plain.body.data.nameCkb).toBeNull();

    const zoneId = plain.body.data.id as string;
    const zonesCkb = async () => {
      const r = await api
        .get(`/api/catalog/governorates/${governorateId}/zones`)
        .set('Accept-Language', 'ckb')
        .expect(200);
      return (r.body.data.items as Array<{ id: string; name: string }>).find((z) => z.id === zoneId)!.name;
    };
    expect(await zonesCkb()).toBe(`منطقة ${STAMP}`);

    const named = await api
      .patch(`/api/admin/zones/${zoneId}`)
      .set(A())
      .send({ nameCkb: `ناوچە ${STAMP}` })
      .expect(200);
    expect(named.body.data).toMatchObject({ name: `منطقة ${STAMP}`, nameCkb: `ناوچە ${STAMP}` });
    expect(await zonesCkb()).toBe(`ناوچە ${STAMP}`);

    const cleared = await api.patch(`/api/admin/zones/${zoneId}`).set(A()).send({ nameCkb: '' }).expect(200);
    expect(cleared.body.data).toMatchObject({ name: `منطقة ${STAMP}`, nameCkb: null });
  });
});
