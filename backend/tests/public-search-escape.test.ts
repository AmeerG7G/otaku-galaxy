import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, seedTestCatalog } from './helpers.js';

/**
 * هروب أنماط `LIKE` في البحث العامّ — بدلالةٍ **صريحة**.
 *
 * `escapeLike` يهرّب `%` و`_` و`\` بشرطةٍ مائلة، والجملة تعلن `ESCAPE '\'`
 * بدل الاعتماد على أن هذا هو الافتراضي في PostgreSQL. الافتراضي صحيحٌ اليوم،
 * لكنه **إعدادُ خادم** (`standard_conforming_strings` وسلوك `LIKE`) لا عقدٌ
 * في الشيفرة؛ الإعلان يجعل الجملة تعني ما نقصد أينما شُغّلت.
 *
 * [SECURITY] لا حقنَ SQL هنا أصلاً — المعاملات مقيَّدة. الخطر كان «حقنَ
 * نمط»: `%` وحدها تعيد الكتالوج كلّه، و`_` تطابق أي حرف. الاختبارات تثبت
 * أن كلاً من `%` و`_` و`\` حرفٌ حرفيّ، وأن البحث العادي كما هو.
 */
describe('البحث العامّ: `%` و`_` و`\\` أحرفٌ لا أنماط', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  const STAMP = `ESC${Date.now()}`;
  const names = {
    percent: `حقيبة 100% ${STAMP}`,
    underscore: `قلم snake_case ${STAMP}`,
    backslash: `ملصق C:\\anime ${STAMP}`,
    plain: `دفتر ناروتو ${STAMP}`,
  };

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    for (const name of Object.values(names)) {
      await db.query(
        `INSERT INTO products (name, description, price, category_id, stock, is_active)
         VALUES ($1, 'وصف', 1000, $2, 5, TRUE)`,
        [name, catalog.categoryId],
      );
    }
  });

  afterAll(async () => {
    await db.query(`DELETE FROM products WHERE name LIKE $1`, [`%${STAMP}`]);
  });

  async function search(q: string) {
    const res = await api.get('/api/catalog/products/search').query({ q, limit: 50 }).expect(200);
    return (res.body.data.items as { name: string }[]).map((p) => p.name);
  }

  it('`%` تطابق ما يحوي `%` حرفياً فقط — لا الكتالوج كلّه', async () => {
    const hits = await search(`% ${STAMP}`);
    expect(hits).toEqual([names.percent]);
  });

  it('`_` تطابق ما يحوي `_` حرفياً فقط — لا أي حرف', async () => {
    const hits = await search(`snake_case ${STAMP}`);
    expect(hits).toEqual([names.underscore]);
    // «snakeXcase» لا يطابق: لو كانت `_` نمطاً لطابقت X.
    expect(await search(`snakeXcase ${STAMP}`)).toEqual([]);
  });

  it('`\\` حرفٌ حرفيّ — لا هروبَ مزدوج ولا انفلات', async () => {
    const hits = await search(`C:\\anime ${STAMP}`);
    expect(hits).toEqual([names.backslash]);
    // شرطةٌ وحدها لا تطابق إلّا من يحويها.
    for (const name of await search(`\\ ${STAMP}`)) expect(name).toContain('\\');
  });

  it('البحث العادي كما هو: جزءٌ من الاسم يعيد المنتج، والعدّ يطابق', async () => {
    const res = await api.get('/api/catalog/products/search').query({ q: `ناروتو ${STAMP}` }).expect(200);
    expect((res.body.data.items as { name: string }[]).map((p) => p.name)).toEqual([names.plain]);
    expect(res.body.data.total).toBe(1);
    // الوسم وحده يعيد الأربعة.
    expect((await search(STAMP)).sort()).toEqual(Object.values(names).sort());
  });
});
