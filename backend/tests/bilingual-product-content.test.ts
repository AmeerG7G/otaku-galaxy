import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * [CRITICAL] محتوى المنتج بلغتين (066): اسمٌ ووصفٌ عربيان، واسمٌ ووصفٌ كرديان.
 *
 * ما يُثبَّت هنا، بالمسار الحقيقي (HTTP ← خدمة ← PostgreSQL):
 *   ١. الإنشاء يُلزم الحقول الأربعة ويحفظها كما كُتبت (يونيكود كامل).
 *   ٢. التعديل لغةً بلغة: العربية لا تلمس الكردية ولا العكس.
 *   ٣. الـAPI يُخرج اللغتين صريحتين، و`name` هو اختيارها بلغة الطلب.
 *   ٤. البحث بلغة الواجهة: عربيٌّ في العربية، كرديٌّ في الكردية، اسماً ووصفاً.
 *   ٥. المنتج القديم بلا كردية «ناقص» صراحةً لا مترجَمٌ زيفاً.
 *   ٦. لقطة الطلب والتقييم باللغتين، ولا تتغيّر بتعديل المنتج لاحقاً.
 *
 * كل نصٍّ يحمل ختماً فريداً فلا تتداخل النتائج مع بقية السويتات.
 */

const STAMP = `BL${Date.now()}`;
// محرفٌ غير مرئي يكتبه لوح المفاتيح الكردي (ZWNJ) — يجب أن يُحفظ كما هو.
const ZWNJ = String.fromCharCode(0x200c);

const NARUTO = {
  nameAr: `حقيبة ناروتو ${STAMP}`,
  descriptionAr: `حقيبة مدرسية بتصميم ناروتو ${STAMP}`,
  nameCkb: `جانتای ناروتۆ ${STAMP}`,
  descriptionCkb: `جانتای قوتابخانە بە دیزاینی ناروتۆ ${STAMP}`,
};

/** منتج سويت البحث — نصوصٌ لا يشاركه فيها منتجٌ آخر، فالمطابقة التامة تُقاس. */
const SEARCHED = {
  nameAr: `حقيبة ناروتو بحث ${STAMP}`,
  descriptionAr: `حقيبة مدرسية بتصميم ناروتو بحث ${STAMP}`,
  nameCkb: `جانتای ناروتۆ گەڕان ${STAMP}`,
  descriptionCkb: `جانتای قوتابخانە بە دیزاینی ناروتۆ گەڕان ${STAMP}`,
};

let adminToken: string;
let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
const createdIds: string[] = [];

const A = () => ({ Authorization: `Bearer ${adminToken}` });

function content(overrides: Record<string, unknown> = {}) {
  return {
    nameAr: `منتج ${STAMP} ${randomUUID().slice(0, 6)}`,
    descriptionAr: 'وصف عربي',
    nameCkb: `بەرهەم ${STAMP} ${randomUUID().slice(0, 6)}`,
    descriptionCkb: 'وەسفی کوردی',
    ...overrides,
  };
}

async function createProduct(body: Record<string, unknown>) {
  const res = await api
    .post('/api/admin/products')
    .set(A())
    .send({ price: 12_000, categoryId: catalog.categoryId, stock: 7, ...body });
  if (res.status === 201) createdIds.push(res.body.data.id as string);
  return res;
}

/** منتجٌ «قديم»: عربيٌّ وحده، كما كانت الكتالوجات قبل 066 — إدراجٌ مباشر. */
async function insertLegacyProduct(nameAr: string, descriptionAr: string) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO products (name, description, price, category_id, stock)
     VALUES ($1, $2, 9000, $3, 4) RETURNING id`,
    [nameAr, descriptionAr, catalog.categoryId],
  );
  createdIds.push(rows[0]!.id);
  return rows[0]!.id;
}

async function dbContent(id: string) {
  const { rows } = await db.query<{
    name: string;
    description: string;
    name_ckb: string | null;
    description_ckb: string | null;
    price: string;
    stock: number;
  }>('SELECT name, description, name_ckb, description_ckb, price, stock FROM products WHERE id = $1', [id]);
  return rows[0]!;
}

async function search(q: string, lang: 'ar' | 'ckb', extra: Record<string, unknown> = {}) {
  const res = await api
    .get('/api/catalog/products/search')
    .set('Accept-Language', lang)
    .query({ q, limit: 50, ...extra })
    .expect(200);
  return res.body.data as {
    items: Array<{ id: string; name: string; description: string; nameAr: string; nameCkb: string | null }>;
    total: number;
    hasMore: boolean;
  };
}

const mineIn = (items: Array<{ id: string }>) =>
  items.map((p) => p.id).filter((id) => createdIds.includes(id)).sort();

beforeAll(async () => {
  catalog = await seedTestCatalog();
  adminToken = await createAdminUser();
});

afterAll(async () => {
  if (createdIds.length === 0) return;
  // الطلبات تشير إلى المنتجات بـ`ON DELETE SET NULL`؛ السلات والمفضلة تتبعها.
  await db.query('DELETE FROM restock_subscriptions WHERE product_id = ANY($1::uuid[])', [createdIds]);
  await db.query('DELETE FROM notifications WHERE product_id = ANY($1::uuid[])', [createdIds]);
  await db.query('DELETE FROM cart_items WHERE product_id = ANY($1::uuid[])', [createdIds]);
  await db.query('DELETE FROM favorites WHERE product_id = ANY($1::uuid[])', [createdIds]);
  await db.query('UPDATE products SET is_active = FALSE WHERE id = ANY($1::uuid[])', [createdIds]);
});

// ═══════════════════════════════════════════════════════════════════════
// ١ · الإنشاء
// ═══════════════════════════════════════════════════════════════════════

describe('إنشاء منتج — أربعة حقول إلزامية', () => {
  it('يُنشأ بالعربية والكردية ويُحفظ كل حقلٍ في عموده', async () => {
    const res = await createProduct({ ...NARUTO });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ ...NARUTO, kurdishMissing: false, price: 12_000, stock: 7 });

    const row = await dbContent(res.body.data.id);
    expect(row).toMatchObject({
      name: NARUTO.nameAr,
      description: NARUTO.descriptionAr,
      name_ckb: NARUTO.nameCkb,
      description_ckb: NARUTO.descriptionCkb,
    });
  });

  it.each(['nameAr', 'descriptionAr', 'nameCkb', 'descriptionCkb'] as const)(
    'يرفض غياب %s برسالةٍ تسمّي الحقل ولغته — ولا يُنشئ شيئاً',
    async (field) => {
      const body: Record<string, unknown> = content();
      delete body[field];
      const before = await db.query('SELECT COUNT(*)::int AS n FROM products');
      const res = await createProduct(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const language = field.endsWith('Ar') ? 'بالعربية' : 'بالكردية';
      const kind = field.startsWith('name') ? 'اسم المنتج' : 'وصف المنتج';
      expect(res.body.message).toBe(`${kind} ${language} مطلوب`);
      const after = await db.query('SELECT COUNT(*)::int AS n FROM products');
      expect(after.rows[0].n).toBe(before.rows[0].n);
    },
  );

  it.each(['nameAr', 'descriptionAr', 'nameCkb', 'descriptionCkb'] as const)(
    'يرفض %s الفارغ أو المسافات وحدها (بعد القصّ)',
    async (field) => {
      for (const blank of ['', '   ', '\t \n']) {
        const res = await createProduct(content({ [field]: blank }));
        expect(res.status, JSON.stringify(blank)).toBe(400);
        expect(res.body.message).toMatch(/مطلوب$/);
      }
    },
  );

  it('يقصّ المسافات المحيطة ويحفظ اليونيكود الكردي كما كُتب (ێ ۆ ڵ ڕ ە و ZWNJ)', async () => {
    const nameCkb = `قه${ZWNJ}ڵه${ZWNJ}می ڕەنگکردنی ێ ۆ ${STAMP}`;
    const res = await createProduct(
      content({ nameAr: `  أقلام تلوين ${STAMP}  `, nameCkb: `  ${nameCkb}\n` }),
    );
    expect(res.status).toBe(201);
    const row = await dbContent(res.body.data.id);
    expect(row.name).toBe(`أقلام تلوين ${STAMP}`);
    expect(row.name_ckb).toBe(nameCkb);
    expect(row.name_ckb).toContain(ZWNJ);
  });

  it('يقبل الأرقام والحروف اللاتينية — لا قيد أبجدية على المحتوى', async () => {
    const res = await createProduct(
      content({ nameAr: `دفتر A5 رقم 100 ${STAMP}`, nameCkb: `دەفتەری A5 ژمارە 100 ${STAMP}` }),
    );
    expect(res.status).toBe(201);
  });

  it('[CRITICAL] المفتاحان القديمان `name`/`description` يُرفضان صراحةً لا يُسقَطان بصمت', async () => {
    const res = await createProduct({ ...content(), name: 'اسم قديم' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('nameAr');

    const created = await createProduct(content());
    const id = created.body.data.id as string;
    const patch = await api.patch(`/api/admin/products/${id}`).set(A()).send({ description: 'x' });
    expect(patch.status).toBe(400);
    expect(patch.body.message).toContain('descriptionAr');
  });

  it('قيد القاعدة يمنع وصفاً كردياً فارغاً — «ناقص» صورته NULL وحدها', async () => {
    await expect(
      db.query(
        `INSERT INTO products (name, description, price, category_id, stock, description_ckb)
         VALUES ($1, 'وصف', 1000, $2, 1, '   ')`,
        [`قيد ${STAMP}`, catalog.categoryId],
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'products_description_ckb_not_blank' });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ٢ · التعديل لغةً بلغة
// ═══════════════════════════════════════════════════════════════════════

describe('تعديل منتج — كل لغة مستقلة', () => {
  let id: string;
  const original = content({ descriptionAr: 'وصف أصلي', descriptionCkb: 'وەسفی ڕەسەن' });

  beforeAll(async () => {
    id = (await createProduct(original)).body.data.id;
  });

  it('تعديل العربية وحدها لا يلمس الكردية (ولا السعر ولا المخزون)', async () => {
    const res = await api
      .patch(`/api/admin/products/${id}`)
      .set(A())
      .send({ nameAr: `اسم عربي معدَّل ${STAMP}`, descriptionAr: 'وصف عربي معدَّل' })
      .expect(200);
    expect(res.body.data.nameCkb).toBe(original.nameCkb);
    expect(await dbContent(id)).toMatchObject({
      name: `اسم عربي معدَّل ${STAMP}`,
      description: 'وصف عربي معدَّل',
      name_ckb: original.nameCkb,
      description_ckb: 'وەسفی ڕەسەن',
      price: '12000.00',
      stock: 7,
    });
  });

  it('تعديل الكردية وحدها لا يلمس العربية', async () => {
    await api
      .patch(`/api/admin/products/${id}`)
      .set(A())
      .send({ nameCkb: `ناوی کوردیی نوێ ${STAMP}`, descriptionCkb: 'وەسفی نوێ' })
      .expect(200);
    expect(await dbContent(id)).toMatchObject({
      name: `اسم عربي معدَّل ${STAMP}`,
      description: 'وصف عربي معدَّل',
      name_ckb: `ناوی کوردیی نوێ ${STAMP}`,
      description_ckb: 'وەسفی نوێ',
    });
  });

  it('حقلٌ واحد من لغة لا يمسّ شقيقه في اللغة نفسها', async () => {
    await api.patch(`/api/admin/products/${id}`).set(A()).send({ descriptionCkb: 'تەنها وەسف' }).expect(200);
    const row = await dbContent(id);
    expect(row.name_ckb).toBe(`ناوی کوردیی نوێ ${STAMP}`);
    expect(row.description_ckb).toBe('تەنها وەسف');
  });

  it.each([
    ['nameCkb', null],
    ['nameCkb', '   '],
    ['descriptionCkb', ''],
    ['nameAr', ' '],
    ['descriptionAr', null],
  ] as const)('لا يُفرَّغ محتوى بالتعديل: %s = %j مرفوض ولا يتغيّر شيء', async (field, value) => {
    const before = await dbContent(id);
    const res = await api.patch(`/api/admin/products/${id}`).set(A()).send({ [field]: value });
    expect(res.status).toBe(400);
    expect(await dbContent(id)).toEqual(before);
  });

  it('تعديل غير المحتوى لا يلمس المحتوى', async () => {
    const before = await dbContent(id);
    await api.patch(`/api/admin/products/${id}`).set(A()).send({ price: 13_500, stock: 9 }).expect(200);
    const after = await dbContent(id);
    expect(after).toMatchObject({
      name: before.name,
      description: before.description,
      name_ckb: before.name_ckb,
      description_ckb: before.description_ckb,
      price: '13500.00',
      stock: 9,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ٣ · الاسترجاع: اللغتان صريحتان، و`name` اختيارهما
// ═══════════════════════════════════════════════════════════════════════

describe('الـAPI يُخرج المحتوى بلغتيه', () => {
  let id: string;
  let legacyId: string;

  beforeAll(async () => {
    id = (await createProduct({ ...content(), ...{ nameAr: `قائمة ${STAMP}`, nameCkb: `لیست ${STAMP}` } })).body.data.id;
    legacyId = await insertLegacyProduct(`منتج قديم ${STAMP}`, `وصف قديم ${STAMP}`);
  });

  it.each(['ar', 'ckb'] as const)('التفاصيل (%s): الأربعة صريحة و`name`/`description` اختيارها', async (lang) => {
    const res = await api.get(`/api/catalog/products/${id}`).set('Accept-Language', lang).expect(200);
    const p = res.body.data;
    expect(p.nameAr).toBe(`قائمة ${STAMP}`);
    expect(p.nameCkb).toBe(`لیست ${STAMP}`);
    expect(p.name).toBe(lang === 'ar' ? p.nameAr : p.nameCkb);
    expect(p.description).toBe(lang === 'ar' ? p.descriptionAr : p.descriptionCkb);
  });

  it('القائمة والرئيسية والمفضلة: القاعدة نفسها في كل مسار', async () => {
    const { token } = await registerAndLogin();
    await api.post('/api/favorites').set('Authorization', `Bearer ${token}`).send({ productId: id }).expect(200);

    for (const lang of ['ar', 'ckb'] as const) {
      const list = await api
        .get('/api/catalog/products')
        .set('Accept-Language', lang)
        .query({ categoryId: catalog.categoryId, limit: 50, sort: 'newest' })
        .expect(200);
      const favorites = await api
        .get('/api/favorites')
        .set('Authorization', `Bearer ${token}`)
        .set('Accept-Language', lang)
        .expect(200);
      for (const items of [list.body.data.items, favorites.body.data.items]) {
        const p = (items as Array<Record<string, unknown>>).find((x) => x.id === id)!;
        expect(p, lang).toBeDefined();
        expect(p.name).toBe(lang === 'ar' ? `قائمة ${STAMP}` : `لیست ${STAMP}`);
        expect(p.nameAr).toBe(`قائمة ${STAMP}`);
        expect(p.nameCkb).toBe(`لیست ${STAMP}`);
      }
    }
  });

  it('[CRITICAL] منتجٌ قديم بلا كردية: `null` صريحة و`kurdishMissing` — لا نصٌّ مختلَق', async () => {
    const res = await api.get(`/api/catalog/products/${legacyId}`).set('Accept-Language', 'ckb').expect(200);
    expect(res.body.data).toMatchObject({
      nameAr: `منتج قديم ${STAMP}`,
      nameCkb: null,
      descriptionCkb: null,
      kurdishMissing: true,
      // العرض يسقط إلى العربية — والتطبيق يعرف أنه سقوط من الحقلين أعلاه.
      name: `منتج قديم ${STAMP}`,
    });
    expect(await dbContent(legacyId)).toMatchObject({ name_ckb: null, description_ckb: null });
  });

  it('اللوحة: `missingKurdish=true` يجد القديم وحده، والبحث يشمل الاسم الكردي', async () => {
    const missing = await api
      .get('/api/admin/products')
      .set(A())
      .query({ missingKurdish: 'true', q: STAMP, limit: 50 })
      .expect(200);
    const ids = (missing.body.data.items as Array<{ id: string; kurdishMissing: boolean }>).map((p) => p.id);
    expect(ids).toContain(legacyId);
    expect(ids).not.toContain(id);
    expect((missing.body.data.items as Array<{ kurdishMissing: boolean }>).every((p) => p.kurdishMissing)).toBe(true);

    const byKurdish = await api.get('/api/admin/products').set(A()).query({ q: `لیست ${STAMP}` }).expect(200);
    expect((byKurdish.body.data.items as Array<{ id: string }>).map((p) => p.id)).toEqual([id]);
  });

  it('إكمال الكردية لمنتجٍ قديم من اللوحة يزيل «ناقص» — ولا يُجبَر عليه حفظٌ آخر', async () => {
    // حفظ السعر وحده جائز لمنتجٍ ناقص: الإلزام على الإنشاء لا على كل تعديل.
    await api.patch(`/api/admin/products/${legacyId}`).set(A()).send({ price: 9500 }).expect(200);
    const done = await api
      .patch(`/api/admin/products/${legacyId}`)
      .set(A())
      .send({ nameCkb: `بەرهەمی کۆن ${STAMP}`, descriptionCkb: 'وەسفی کۆن' })
      .expect(200);
    expect(done.body.data).toMatchObject({ kurdishMissing: false, nameAr: `منتج قديم ${STAMP}` });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ٤ · البحث بلغة الواجهة
// ═══════════════════════════════════════════════════════════════════════

describe('[CRITICAL] البحث — عربيٌّ بالعربية وكرديٌّ بالكردية، اسماً ووصفاً', () => {
  let naruto: string;
  let legacy: string;
  let lamp: string;
  const pageIds: string[] = [];

  beforeAll(async () => {
    naruto = (await createProduct(SEARCHED)).body.data.id;
    legacy = await insertLegacyProduct(`مجسم لوفي ${STAMP}`, `مجسم بلاستيكي ${STAMP}`);
    // الكلمة نفسها في الاسم والوصف باللغتين — لا تكرار في النتائج.
    lamp = (
      await createProduct({
        nameAr: `مصباح ${STAMP}`,
        descriptionAr: `مصباح ${STAMP} مضيء للغرفة`,
        nameCkb: `چرا ${STAMP}`,
        descriptionCkb: `چرا ${STAMP} بۆ ژوور`,
      })
    ).body.data.id;
    for (const n of [1, 2, 3]) {
      pageIds.push(
        (
          await createProduct({
            nameAr: `ملف صفحات ${STAMP} ${n}`,
            descriptionAr: 'وصف',
            nameCkb: `فایلی لاپەڕە ${STAMP} ${n}`,
            descriptionCkb: 'وەسف',
          })
        ).body.data.id,
      );
    }
  });

  it('العربية: الاسم العربي يجد المنتج — كاملاً وجزءاً', async () => {
    expect(mineIn((await search(`حقيبة ناروتو بحث ${STAMP}`, 'ar')).items)).toEqual([naruto]);
    expect(mineIn((await search('ناروتو بح', 'ar')).items)).toContain(naruto);
  });

  it('العربية: الوصف العربي يجد المنتج — كاملاً وجزءاً', async () => {
    expect(mineIn((await search(`مدرسية بتصميم ناروتو بحث ${STAMP}`, 'ar')).items)).toEqual([naruto]);
    expect(mineIn((await search('مدرسية بتص', 'ar')).items)).toContain(naruto);
  });

  it('الكردية: الاسم الكردي يجد المنتج — كاملاً وجزءاً', async () => {
    expect(mineIn((await search(`جانتای ناروتۆ گەڕان ${STAMP}`, 'ckb')).items)).toEqual([naruto]);
    expect(mineIn((await search('ناروتۆ گەڕ', 'ckb')).items)).toContain(naruto);
  });

  it('الكردية: الوصف الكردي يجد المنتج — كاملاً وجزءاً', async () => {
    expect(mineIn((await search(`قوتابخانە بە دیزاینی ناروتۆ گەڕان ${STAMP}`, 'ckb')).items)).toEqual([naruto]);
    expect(mineIn((await search('قوتابخان', 'ckb')).items)).toContain(naruto);
  });

  it('مثال المالك: «ناروتو» بالعربية و«ناروتۆ» بالكردية يجدان المنتج نفسه', async () => {
    expect(mineIn((await search('ناروتو', 'ar')).items)).toContain(naruto);
    expect(mineIn((await search('ناروتۆ', 'ckb')).items)).toContain(naruto);
  });

  it('[CRITICAL] لا خلط بين اللغتين: كلمةٌ من لغةٍ لا تجد المنتج في الأخرى', async () => {
    // «جانتای»/«قوتابخانە» كرديتان فقط؛ «حقيبة»/«مدرسية» عربيتان فقط.
    expect(mineIn((await search(`جانتای ناروتۆ گەڕان ${STAMP}`, 'ar')).items)).toEqual([]);
    expect(mineIn((await search(`قوتابخانە بە دیزاینی`, 'ar')).items)).not.toContain(naruto);
    expect(mineIn((await search(`حقيبة ناروتو بحث ${STAMP}`, 'ckb')).items)).toEqual([]);
    expect(mineIn((await search(`مدرسية بتصميم`, 'ckb')).items)).not.toContain(naruto);
  });

  it('النتيجة تُعرض بلغة الواجهة الحالية', async () => {
    const ar = (await search(`حقيبة ناروتو بحث ${STAMP}`, 'ar')).items.find((p) => p.id === naruto)!;
    expect(ar.name).toBe(`حقيبة ناروتو بحث ${STAMP}`);
    expect(ar.description).toBe(SEARCHED.descriptionAr);
    const ckb = (await search(`جانتای ناروتۆ گەڕان ${STAMP}`, 'ckb')).items.find((p) => p.id === naruto)!;
    expect(ckb.name).toBe(`جانتای ناروتۆ گەڕان ${STAMP}`);
    expect(ckb.description).toBe(SEARCHED.descriptionCkb);
  });

  it('المنتج القديم بلا كردية يُوجد في الكردية بما تعرضه له (عربيّه) — ويُعلَن ناقصاً', async () => {
    const found = await search(`مجسم لوفي ${STAMP}`, 'ckb');
    expect(mineIn(found.items)).toEqual([legacy]);
    const item = found.items.find((p) => p.id === legacy)!;
    expect(item.name).toBe(`مجسم لوفي ${STAMP}`);
    expect(item.nameCkb).toBeNull();
    // وصفه القديم كذلك.
    expect(mineIn((await search(`مجسم بلاستيكي ${STAMP}`, 'ckb')).items)).toEqual([legacy]);
  });

  it('لا نتائج مكرَّرة حين يطابق الاسمُ والوصف معاً — والعدّ يعدّه مرة', async () => {
    for (const [q, lang] of [[`مصباح ${STAMP}`, 'ar'], [`چرا ${STAMP}`, 'ckb']] as const) {
      const result = await search(q, lang);
      const ids = result.items.map((p) => p.id);
      expect(new Set(ids).size, q).toBe(ids.length);
      expect(mineIn(result.items), q).toEqual([lamp]);
      expect(result.total, q).toBe(1);
    }
  });

  it('الترقيم: صفحاتٌ بلا تكرار ولا فجوة، والعدّ ثابت، باللغتين', async () => {
    for (const [q, lang] of [[`ملف صفحات ${STAMP}`, 'ar'], [`فایلی لاپەڕە ${STAMP}`, 'ckb']] as const) {
      const seen: string[] = [];
      for (const page of [1, 2, 3]) {
        const res = await api
          .get('/api/catalog/products/search')
          .set('Accept-Language', lang)
          .query({ q, limit: 1, page })
          .expect(200);
        expect(res.body.data.total).toBe(3);
        expect(res.body.data.hasMore).toBe(page < 3);
        seen.push(...(res.body.data.items as Array<{ id: string }>).map((p) => p.id));
      }
      expect([...seen].sort()).toEqual([...pageIds].sort());
      // الترتيب بالاسم المعروض بلغة الواجهة: ١ ثم ٢ ثم ٣.
      expect(seen).toEqual(pageIds);
    }
  });

  it('اسم القسم بلغة الواجهة ما زال يجد منتجاته (فرع القسم في البحث)', async () => {
    const category = await db.query<{ id: string }>(
      `INSERT INTO categories (name, name_ckb, image_url) VALUES ($1, $2, '') RETURNING id`,
      [`قسم لغوي ${STAMP}`, `بەشی زمان ${STAMP}`],
    );
    const categoryId = category.rows[0]!.id;
    try {
      const inCategory = (
        await createProduct({ ...content(), categoryId })
      ).body.data.id as string;
      expect(mineIn((await search(`قسم لغوي ${STAMP}`, 'ar')).items)).toEqual([inCategory]);
      expect(mineIn((await search(`بەشی زمان ${STAMP}`, 'ckb')).items)).toEqual([inCategory]);
      // ولا خلط هنا أيضاً.
      expect(mineIn((await search(`بەشی زمان ${STAMP}`, 'ar')).items)).toEqual([]);
      await db.query('UPDATE products SET category_id = $2 WHERE id = $1', [inCategory, catalog.categoryId]);
    } finally {
      await db.query('DELETE FROM categories WHERE id = $1', [categoryId]);
    }
  });

  it('قسمٌ بلا اسمٍ كردي يُوجد في الكردية باسمه العربي — ما تعرضه له الواجهة الكردية', async () => {
    const category = await db.query<{ id: string }>(
      `INSERT INTO categories (name, image_url) VALUES ($1, '') RETURNING id`,
      [`قسم عربي فقط ${STAMP}`],
    );
    const categoryId = category.rows[0]!.id;
    try {
      const inCategory = (await createProduct({ ...content(), categoryId })).body.data.id as string;
      expect(mineIn((await search(`قسم عربي فقط ${STAMP}`, 'ckb')).items)).toEqual([inCategory]);
      expect(mineIn((await search(`قسم عربي فقط ${STAMP}`, 'ar')).items)).toEqual([inCategory]);
      await db.query('UPDATE products SET category_id = $2 WHERE id = $1', [inCategory, catalog.categoryId]);
    } finally {
      await db.query('DELETE FROM categories WHERE id = $1', [categoryId]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ٥ · السلة والطلب والتقييم والإشعارات
// ═══════════════════════════════════════════════════════════════════════

describe('لقطات الطلب والتقييم باللغتين', () => {
  it('[CRITICAL] السلة ← الطلب ← التقييم: الاسمان يُلتقطان، وتعديل المنتج لاحقاً لا يغيّرهما', async () => {
    const product = await createProduct(content({ nameAr: `كوب ${STAMP}`, nameCkb: `پەرداخ ${STAMP}` }));
    const productId = product.body.data.id as string;
    const legacyId = await insertLegacyProduct(`ملصق قديم ${STAMP}`, 'وصف');
    const user = await registerAndLogin();
    const H = { Authorization: `Bearer ${user.token}` };

    for (const id of [productId, legacyId]) {
      await api.post('/api/cart').set(H).send({ productId: id, quantity: 1 }).expect(200);
    }
    const cart = await api.get('/api/cart').set(H).expect(200);
    const line = (cart.body.data.items as Array<Record<string, unknown>>).find((l) => l.productId === productId)!;
    expect(line).toMatchObject({ productName: `كوب ${STAMP}`, productNameAr: `كوب ${STAMP}`, productNameCkb: `پەرداخ ${STAMP}` });
    const legacyLine = (cart.body.data.items as Array<Record<string, unknown>>).find((l) => l.productId === legacyId)!;
    expect(legacyLine.productNameCkb).toBeNull();

    const order = await api
      .post('/api/orders')
      .set(H)
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد', phone: '07733333333' })
      .expect(201);
    const orderId = order.body.data.id as string;

    // المسؤول يعدّل الاسمين بعد الطلب — اللقطة لا تتبعه.
    await api
      .patch(`/api/admin/products/${productId}`)
      .set(A())
      .send({ nameAr: `كوب معدَّل ${STAMP}`, nameCkb: `پەرداخی گۆڕاو ${STAMP}` })
      .expect(200);

    const detail = await api.get(`/api/orders/${orderId}`).set(H).set('Accept-Language', 'ckb').expect(200);
    const items = detail.body.data.items as Array<Record<string, unknown>>;
    expect(items.find((i) => i.productId === productId)).toMatchObject({
      productName: `كوب ${STAMP}`,
      productNameAr: `كوب ${STAMP}`,
      productNameCkb: `پەرداخ ${STAMP}`,
    });
    // منتجٌ بلا كردية وقت الطلب: لا لقطة كردية تُختلق.
    expect(items.find((i) => i.productId === legacyId)).toMatchObject({
      productNameAr: `ملصق قديم ${STAMP}`,
      productNameCkb: null,
    });

    // التقييم ينسخ لقطة الطلب (لا اسم المنتج الحالي المعدَّل).
    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(A())
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);
    await api.post(`/api/orders/${orderId}/confirm-receipt`).set(H).expect(200);
    const review = await api
      .post('/api/reviews')
      .set(H)
      .send({ orderId, productId, rating: 5, comment: 'ممتاز' })
      .expect(201);
    expect(review.body.data).toMatchObject({
      productName: `كوب ${STAMP}`,
      productNameAr: `كوب ${STAMP}`,
      productNameCkb: `پەرداخ ${STAMP}`,
    });
  });

  it('رسالة رفض الإرسال تسمّي المنتج بلغة الزبون', async () => {
    const product = await createProduct(content({ nameAr: `قلم ${STAMP}`, nameCkb: `پێنووس ${STAMP}` }));
    const productId = product.body.data.id as string;
    const user = await registerAndLogin();
    const H = { Authorization: `Bearer ${user.token}` };
    await api.post('/api/cart').set(H).send({ productId, quantity: 1 }).expect(200);
    await api.patch(`/api/admin/products/${productId}`).set(A()).send({ isActive: false }).expect(200);

    const ckb = await api
      .post('/api/orders')
      .set(H)
      .set('Accept-Language', 'ckb')
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد', phone: '07733333333' })
      .expect(409);
    expect(ckb.body.error.code).toBe('PRODUCT_UNAVAILABLE');
    expect(ckb.body.message).toContain(`پێنووس ${STAMP}`);
    expect(ckb.body.message).not.toContain(`قلم ${STAMP}`);

    const ar = await api
      .post('/api/orders')
      .set(H)
      .set('Accept-Language', 'ar')
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد', phone: '07733333333' })
      .expect(409);
    expect(ar.body.message).toContain(`قلم ${STAMP}`);
  });

  it('إشعار «عاد للتوفر» يسمّي المنتج بلغة كل مشترك', async () => {
    const product = await createProduct(content({ nameAr: `ساعة ${STAMP}`, nameCkb: `کاتژمێر ${STAMP}`, stock: 0 }));
    const productId = product.body.data.id as string;
    const arUser = await registerAndLogin();
    const ckbUser = await registerAndLogin();
    await db.query(`UPDATE users SET preferred_language = 'ckb' WHERE id = $1`, [ckbUser.userId]);
    for (const u of [arUser, ckbUser]) {
      await api
        .post('/api/restock-subscriptions')
        .set('Authorization', `Bearer ${u.token}`)
        .send({ productId })
        .expect((res) => expect([200, 201]).toContain(res.status));
    }

    await api.patch(`/api/admin/products/${productId}`).set(A()).send({ stock: 3 }).expect(200);

    const titleOf = async (userId: string) =>
      (
        await db.query<{ title: string }>(
          `SELECT title FROM notifications WHERE user_id = $1 AND product_id = $2 AND type = 'backInStock'`,
          [userId, productId],
        )
      ).rows[0]?.title;
    expect(await titleOf(arUser.userId)).toContain(`ساعة ${STAMP}`);
    expect(await titleOf(ckbUser.userId)).toContain(`کاتژمێر ${STAMP}`);
  });
});
