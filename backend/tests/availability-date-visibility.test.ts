import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { CATALOG_UNPRICED_HEADER } from '../src/controllers/catalogController.js';
import { api, createAdminUser, seedTestCatalog } from './helpers.js';

/**
 * [CRITICAL REGRESSION GUARD] (2026-10-26) «منتجٌ له موعد توفر يظهر في الموقع
 * ولا يظهر في التطبيق».
 *
 * الجذر المقيس على الاختبار المسبق: المنتج بلا سعرٍ معلن (084)، والكتالوج يُخفيه
 * عن كل عميلٍ لا يرسل `X-OG-Unpriced: 1` — الموقع يرسله والتطبيق المثبَّت لا.
 * الموعد لم يكن السبب: الكتالوج لا يُرشِّح بالموعد أبداً. هذا الحارس يثبّت
 * الأمرين: كل موعد (بلا، ماضٍ، اليوم، قادم) يُعرض بسعره للجميع، و`restockAt`
 * يعود كما خُزّن (منتصف ليل بغداد)؛ والمنتج بلا سعر يظهر لمن يطلبه وحده.
 */
const TAG = `AVAIL ${Date.now()}`;
let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
let adminToken: string;
const admin = () => ({ Authorization: `Bearer ${adminToken}` });

/** يومٌ تقويمي في بغداد ← منتصف ليله بتوقيت UTC (كما تحفظه اللوحة). */
function baghdadMidnight(daysFromToday: number) {
  const nowBaghdad = new Date(Date.now() + 3 * 3600_000);
  const day = Date.UTC(nowBaghdad.getUTCFullYear(), nowBaghdad.getUTCMonth(), nowBaghdad.getUTCDate() + daysFromToday);
  return new Date(day - 3 * 3600_000).toISOString();
}

const VARIANTS = {
  none: null,
  past: baghdadMidnight(-10),
  today: baghdadMidnight(0),
  future: baghdadMidnight(14),
} as const;

const ids: Record<string, string> = {};

async function listed(headers: Record<string, string> = {}) {
  const res = await api
    .get('/api/catalog/products/search')
    .set({ 'Accept-Language': 'ar', ...headers })
    .query({ q: TAG, limit: 50 })
    .expect(200);
  return res.body.data.items as Array<{ id: string; restockAt: string | null; price: number | null }>;
}

beforeAll(async () => {
  catalog = await seedTestCatalog();
  adminToken = await createAdminUser();
  for (const [key, restockAt] of Object.entries(VARIANTS)) {
    const res = await api
      .post('/api/admin/products')
      .set(admin())
      .send({
        nameAr: `${TAG} ${key}`,
        descriptionAr: 'وصف',
        price: 5000,
        categoryId: catalog.categoryId,
        stock: 0,
        restockAt,
      })
      .expect(201);
    ids[key] = res.body.data.id;
  }
  const unpriced = await api
    .post('/api/admin/products')
    .set(admin())
    .send({
      nameAr: `${TAG} unpriced`,
      descriptionAr: 'وصف',
      price: null,
      categoryId: catalog.categoryId,
      stock: 1,
      restockAt: VARIANTS.future,
    })
    .expect(201);
  ids.unpriced = unpriced.body.data.id;
});

afterAll(async () => {
  await db.query(`DELETE FROM products WHERE name LIKE '${TAG}%'`);
});

describe('الموعد لا يُخفي منتجاً — والسعر غير المعلن يظهر لمن يطلبه', () => {
  it('[CRITICAL] بلا موعد، ماضٍ، اليوم، قادم: كلها في الكتالوج بلا ترويسة (التطبيق المثبَّت)', async () => {
    const items = await listed();
    const seen = new Map(items.map((p) => [p.id, p]));
    for (const [key, restockAt] of Object.entries(VARIANTS)) {
      const product = seen.get(ids[key]!);
      expect(product, key).toBeDefined();
      expect(product!.restockAt, key).toBe(restockAt);
    }
  });

  it('[CRITICAL] بلا سعرٍ معلن: غائبٌ بلا ترويسة، حاضرٌ بها بموعده', async () => {
    expect((await listed()).map((p) => p.id)).not.toContain(ids.unpriced);
    const optedIn = await listed({ [CATALOG_UNPRICED_HEADER]: '1' });
    const unpriced = optedIn.find((p) => p.id === ids.unpriced);
    expect(unpriced).toMatchObject({ price: null, restockAt: VARIANTS.future });
    // والمسعَّرة الأربعة حاضرةٌ أيضاً للعميل الذي يطلب — لا شيء يُفقد بالترويسة.
    for (const key of Object.keys(VARIANTS)) {
      expect(optedIn.map((p) => p.id)).toContain(ids[key]);
    }
  });

  it('منتصف ليل بغداد يُحفظ كما أُرسل — لا إزاحة يوم', async () => {
    const { rows } = await db.query<{ restock_at: Date }>('SELECT restock_at FROM products WHERE id = $1', [ids.future]);
    expect(rows[0]!.restock_at.toISOString()).toBe(VARIANTS.future);
    expect(new Date(VARIANTS.future).getUTCHours()).toBe(21);
  });
});
