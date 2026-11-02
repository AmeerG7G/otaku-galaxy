import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, seedTestCatalog } from './helpers.js';

/**
 * [CRITICAL] حفظ المنتج من لوحة التحكم لا يمحو ترجمة خياراته الكردية.
 *
 * الحفظ يحذف الخيارات ويُدرجها من جديد، وكان يكتب `name`/`values` وحدهما:
 * كل حفظٍ — ولو لتعديل السعر من صفحةٍ تُرسل الخيارات — يُفرغ `name_ckb`
 * و`values_ckb`، فيعود الزبون الكردي إلى الخيارات بالعربية. وصفحة التعديل
 * كانت تقرأ المسار العام بالعربية، فلا ترى الترجمة لتعيدها.
 *
 * المسار كاملاً عبر HTTP: إنشاء ← تحميل صفحة التعديل ← تعديل ← حفظ ← إعادة
 * تحميل، ثم ما يراه الزبون بكل لغة.
 */

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const PREFIX = 'ترجمة-خيار';

type AdminOption = { name: string; nameCkb: string | null; values: string[]; valuesCkb: string[] };

const COLOR = { name: 'اللون', nameCkb: 'ڕەنگ', values: ['أسود', 'أبيض', 'أحمر'], valuesCkb: ['ڕەش', 'سپی', 'سوور'] };
const SIZE = { name: 'المقاس', nameCkb: 'قەبارە', values: ['S', 'M'], valuesCkb: ['بچووک', 'ناوەند'] };

/** ترتيب الخيارات في الردّ غير مضمون (`json_agg` بلا ORDER BY) — يُقارن بالاسم. */
const byName = (options: AdminOption[]) =>
  [...options].sort((a, b) => a.name.localeCompare(b.name)).map(({ name, nameCkb, values, valuesCkb }) => ({
    name, nameCkb, values, valuesCkb,
  }));

describe('[CRITICAL] Kurdish option translations survive the dashboard edit round-trip', () => {
  let adminToken: string;
  let categoryId: string;

  beforeAll(async () => {
    adminToken = await createAdminUser();
    categoryId = (await seedTestCatalog()).categoryId;
  });

  afterAll(async () => {
    await db.query("DELETE FROM products WHERE name LIKE $1", [`${PREFIX}%`]);
  });

  async function createProduct(label: string, options: unknown[]) {
    const res = await api.post('/api/admin/products').set(bearer(adminToken)).send({
      nameAr: `${PREFIX} ${label} ${Date.now()}`,
      descriptionAr: 'وصف',
      nameCkb: `${PREFIX} ${label} ckb`,
      descriptionCkb: 'وەسف',
      price: 10000,
      categoryId,
      stock: 5,
      options,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.id as string;
  }

  /** ما تقرؤه صفحة التعديل. */
  async function load(id: string) {
    const res = await api.get(`/api/admin/products/${id}`).set(bearer(adminToken));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.data as { price: number; stock: number; options: AdminOption[] };
  }

  const save = (id: string, body: unknown) =>
    api.patch(`/api/admin/products/${id}`).set(bearer(adminToken)).send(body);

  async function stored(id: string) {
    const { rows } = await db.query<AdminOption>(
      `SELECT name, name_ckb AS "nameCkb", values, values_ckb AS "valuesCkb"
       FROM product_options WHERE product_id = $1`,
      [id],
    );
    return byName(rows);
  }

  it('create → load → edit → save → reload: the translations the admin sees are the ones saved, and edits to them stick', async () => {
    const id = await createProduct('round-trip', [COLOR, SIZE]);

    // التحميل: صفحة التعديل ترى الترجمة كما حُفظت.
    const loaded = await load(id);
    expect(byName(loaded.options)).toEqual(byName([COLOR, SIZE]));

    // التعديل: سعرٌ جديد، وترجمةٌ معدَّلة، وقيمةٌ جديدة بترجمتها، وإعادة ترتيب —
    // والخيارات تُرسل كما في النموذج: كل حقلٍ صراحةً.
    const edited = loaded.options.map((o) => o.name === 'اللون'
      ? { name: o.name, nameCkb: 'ڕەنگی بەرهەم', values: ['أحمر', 'أسود', 'أزرق'], valuesCkb: ['سوور', 'ڕەش', 'شین'] }
      : { name: o.name, nameCkb: o.nameCkb, values: o.values, valuesCkb: o.valuesCkb });
    const saved = await save(id, { price: 12000, options: edited });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);

    // إعادة التحميل: ما حُفظ هو ما أُرسل.
    const reloaded = await load(id);
    expect(reloaded.price).toBe(12000);
    expect(byName(reloaded.options)).toEqual(byName([
      { name: 'اللون', nameCkb: 'ڕەنگی بەرهەم', values: ['أحمر', 'أسود', 'أزرق'], valuesCkb: ['سوور', 'ڕەش', 'شین'] },
      SIZE,
    ]));

    // وحفظٌ ثانٍ بما حُمّل كما هو لا يغيّر شيئاً.
    await save(id, { options: reloaded.options.map(({ name, nameCkb, values, valuesCkb }) => ({ name, nameCkb, values, valuesCkb })) })
      .expect(200);
    expect(await stored(id)).toEqual(byName(reloaded.options));
  });

  it('options come back in the order the admin entered them — on load and after a reordering save', async () => {
    const design = { name: 'التصميم', nameCkb: 'دیزاین', values: ['أ'], valuesCkb: ['ئا'] };
    const id = await createProduct('order', [SIZE, COLOR, design]);
    expect((await load(id)).options.map((o) => o.name)).toEqual(['المقاس', 'اللون', 'التصميم']);
    await save(id, { options: [design, COLOR, SIZE] }).expect(200);
    expect((await load(id)).options.map((o) => o.name)).toEqual(['التصميم', 'اللون', 'المقاس']);
    const ckb = await api.get(`/api/catalog/products/${id}`).set('Accept-Language', 'ckb').expect(200);
    expect(ckb.body.data.options.map((o: { name: string }) => o.name)).toEqual(['دیزاین', 'ڕەنگ', 'قەبارە']);
  });

  it('[CRITICAL] options written before this fix (one transaction, one now()) keep the order they were inserted in', async () => {
    // كما كتبها الإصدار السابق والبذر: كل الخيارات بلحظة `now()` واحدة، و`id`
    // عشوائي — ترتيبٌ بـ`id` كان سيخلطها (احتمال بقاء ستة بترتيبها ١/٧٢٠).
    const id = await createProduct('legacy-order', []);
    const names = ['المقاس', 'اللون', 'التصميم', 'الخامة', 'الطول', 'النمط'];
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (const name of names) {
        await client.query('INSERT INTO product_options (product_id, name, values) VALUES ($1, $2, $3)', [id, name, ['أ']]);
      }
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const { rows } = await db.query<{ n: string }>(
      'SELECT count(DISTINCT created_at)::text AS n FROM product_options WHERE product_id = $1', [id]);
    expect(rows[0]!.n).toBe('1');

    expect((await load(id)).options.map((o) => o.name)).toEqual(names);
    const ar = await api.get(`/api/catalog/products/${id}`).expect(200);
    expect(ar.body.data.options.map((o: { name: string }) => o.name)).toEqual(names);
    // وحفظٌ بما حُمّل يُبقيه، ثم يثبّته بلحظاتٍ متتالية.
    await save(id, { options: (await load(id)).options }).expect(200);
    expect((await load(id)).options.map((o) => o.name)).toEqual(names);
  });

  it('the customer sees the saved translation in Kurdish and the Arabic as before — no translation field leaks', async () => {
    const id = await createProduct('customer', [COLOR]);
    await save(id, { price: 11000, options: [COLOR] }).expect(200);

    const ckb = await api.get(`/api/catalog/products/${id}`).set('Accept-Language', 'ckb').expect(200);
    const [kurdish] = ckb.body.data.options;
    expect(kurdish.name).toBe('ڕەنگ');
    expect(kurdish.values).toEqual(['ڕەش', 'سپی', 'سوور']);
    expect(kurdish.nameCkb).toBeUndefined();
    expect(kurdish.valuesCkb).toBeUndefined();

    const ar = await api.get(`/api/catalog/products/${id}`).expect(200);
    expect(ar.body.data.options[0].name).toBe('اللون');
    expect(ar.body.data.options[0].values).toEqual(['أسود', 'أبيض', 'أحمر']);
  });

  describe('a save that omits the Kurdish fields (an older dashboard tab or client) keeps them', () => {
    it('a save without options does not touch them', async () => {
      const id = await createProduct('no-options', [COLOR, SIZE]);
      await save(id, { price: 9000 }).expect(200);
      expect(await stored(id)).toEqual(byName([COLOR, SIZE]));
    });

    it('options sent with Arabic only: each Kurdish value follows its Arabic value through reordering and removal', async () => {
      const id = await createProduct('legacy', [COLOR, SIZE]);
      const res = await save(id, {
        options: [
          { name: 'المقاس', values: ['M', 'S'] },
          { name: 'اللون', values: ['أحمر', 'أسود'] },
        ],
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(await stored(id)).toEqual(byName([
        { name: 'اللون', nameCkb: 'ڕەنگ', values: ['أحمر', 'أسود'], valuesCkb: ['سوور', 'ڕەش'] },
        { name: 'المقاس', nameCkb: 'قەبارە', values: ['M', 'S'], valuesCkb: ['ناوەند', 'بچووک'] },
      ]));
    });

    it('only the omitted field is kept: an explicit name with omitted values keeps the values, and the reverse', async () => {
      const id = await createProduct('half', [COLOR, SIZE]);
      await save(id, {
        options: [
          { name: 'اللون', nameCkb: 'ڕەنگی نوێ', values: COLOR.values },
          { name: 'المقاس', values: SIZE.values, valuesCkb: ['S', 'M'] },
        ],
      }).expect(200);
      expect(await stored(id)).toEqual(byName([
        { ...COLOR, nameCkb: 'ڕەنگی نوێ' },
        { ...SIZE, valuesCkb: ['S', 'M'] },
      ]));
    });

    it('a new value in a translated option is refused in Arabic — never saved half-translated, never silently stripped — and nothing in the request is saved', async () => {
      const id = await createProduct('new-value', [COLOR]);
      const res = await save(id, { price: 99000, options: [{ name: 'اللون', values: ['أسود', 'أخضر'] }] });
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('OPTION_TRANSLATION_MISSING');
      expect(res.body.message).toContain('أخضر');
      expect(await stored(id)).toEqual(byName([COLOR]));
      expect((await load(id)).price).toBe(10000);
    });

    it('a translated option renamed by such a client is refused — not saved with its translation silently dropped', async () => {
      const id = await createProduct('rename', [COLOR, SIZE]);
      const res = await save(id, {
        options: [{ name: 'لون التيشيرت', values: COLOR.values }, { name: 'المقاس', values: SIZE.values }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('OPTION_TRANSLATION_MISSING');
      expect(res.body.message).toContain('لون التيشيرت');
      expect(await stored(id)).toEqual(byName([COLOR, SIZE]));

      // والحذف الصريح لخيارٍ مترجَم مقبول، وإعادة التسمية بترجمةٍ صريحة كذلك.
      await save(id, { options: [{ name: 'المقاس', values: SIZE.values }] }).expect(200);
      expect(await stored(id)).toEqual([SIZE]);
      await save(id, { options: [{ name: 'القياس', nameCkb: 'قەبارە', values: SIZE.values, valuesCkb: SIZE.valuesCkb }] })
        .expect(200);
      expect(await stored(id)).toEqual([{ ...SIZE, name: 'القياس' }]);
    });

    it('an option that never had a translation stays untranslated — a new value there is fine', async () => {
      const id = await createProduct('untranslated', [{ name: 'التصميم', values: ['أ', 'ب'] }]);
      await save(id, { options: [{ name: 'التصميم', values: ['ب', 'ج'] }] }).expect(200);
      expect(await stored(id)).toEqual([{ name: 'التصميم', nameCkb: null, values: ['ب', 'ج'], valuesCkb: [] }]);
    });

    it('two options with the same Arabic name each keep their own translation', async () => {
      const first = { name: 'اللون', nameCkb: 'ڕەنگی یەکەم', values: ['أسود'], valuesCkb: ['ڕەش'] };
      const second = { name: 'اللون', nameCkb: 'ڕەنگی دووەم', values: ['أبيض'], valuesCkb: ['سپی'] };
      const id = await createProduct('same-name', [first, second]);
      const stillThere = await stored(id);
      const res = await save(id, { options: stillThere.map(({ name, values }) => ({ name, values })) });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(await stored(id)).toEqual(stillThere);
    });
  });

  describe('clearing is explicit', () => {
    it('nameCkb null and valuesCkb [] clear the translation; "" and all-blank values mean the same', async () => {
      const id = await createProduct('clear', [COLOR, SIZE]);
      await save(id, {
        options: [
          { name: 'اللون', nameCkb: null, values: COLOR.values, valuesCkb: [] },
          { name: 'المقاس', nameCkb: '   ', values: SIZE.values, valuesCkb: ['', ' '] },
        ],
      }).expect(200);
      expect(await stored(id)).toEqual(byName([
        { name: 'اللون', nameCkb: null, values: COLOR.values, valuesCkb: [] },
        { name: 'المقاس', nameCkb: null, values: SIZE.values, valuesCkb: [] },
      ]));
      // والزبون الكردي يرى العربية كاملةً لا خياراً فارغاً.
      const ckb = await api.get(`/api/catalog/products/${id}`).set('Accept-Language', 'ckb').expect(200);
      const color = (ckb.body.data.options as AdminOption[]).find((o) => o.values.includes('أسود'))!;
      expect(color.values).toEqual(COLOR.values);
    });

    it('options: [] still removes every option', async () => {
      const id = await createProduct('remove-all', [COLOR]);
      await save(id, { options: [] }).expect(200);
      expect(await stored(id)).toEqual([]);
    });
  });

  describe('invalid translations are refused in Arabic before anything is written', () => {
    it.each([
      ['some values translated, some blank', { ...COLOR, valuesCkb: ['ڕەش', '', 'سوور'] }],
      ['fewer Kurdish values than Arabic', { ...COLOR, valuesCkb: ['ڕەش', 'سپی'] }],
      ['more Kurdish values than Arabic', { ...COLOR, valuesCkb: ['ڕەش', 'سپی', 'سوور', 'زەرد'] }],
    ])('%s', async (_label, option) => {
      const id = await createProduct(`invalid-${_label}`, [COLOR]);
      const res = await save(id, { options: [option] });
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('ترجم كل قيم الخيار «اللون» إلى الكردية أو اترك ترجمتها فارغة كلها');
      expect(await stored(id)).toEqual(byName([COLOR]));
    });

    it('a Kurdish value past 80 characters, or a non-string, is refused with an Arabic message', async () => {
      const id = await createProduct('invalid-length', [COLOR]);
      const long = await save(id, { options: [{ ...COLOR, valuesCkb: ['ڕ'.repeat(81), 'سپی', 'سوور'] }] });
      expect(long.status).toBe(400);
      expect(long.body.message).toBe('قيمة الخيار الكردية طويلة جداً (80 حرفاً كحد أقصى)');
      const notText = await save(id, { options: [{ ...COLOR, nameCkb: 7 }] });
      expect(notText.status).toBe(400);
      expect(notText.body.message).toBe('اسم الخيار الكردي يجب أن يكون نصاً');
      expect(await stored(id)).toEqual(byName([COLOR]));
    });
  });

  it('a deactivated product opens in the dashboard with its options and translations (the public route is 404)', async () => {
    const id = await createProduct('inactive', [COLOR]);
    await save(id, { isActive: false }).expect(200);
    await api.get(`/api/catalog/products/${id}`).expect(404);
    expect(byName((await load(id)).options)).toEqual(byName([COLOR]));
  });

  it('the dashboard read needs a token, and a bad id is 400 not 500', async () => {
    await api.get(`/api/admin/products/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}`).expect(401);
    const bad = await api.get('/api/admin/products/not-a-uuid').set(bearer(adminToken));
    expect(bad.status).toBe(400);
    const missing = await api.get(`/api/admin/products/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}`).set(bearer(adminToken));
    expect(missing.status).toBe(404);
  });
});
