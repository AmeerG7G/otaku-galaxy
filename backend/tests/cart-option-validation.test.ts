import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * خيار سطر العربة يطابق خيارات المنتج الحقيقية — `POST /api/cart`.
 *
 * [CRITICAL] كان `optionValue` نصّاً حرّاً حتى ٨٠ حرفاً لا يُفحص إلا بـ`trim`:
 * منتجٌ له «المقاس» و«اللون» كان يُضاف إلى العربة ثم يُطلب بلا خيار أصلاً، أو
 * بأي نصّ — محارف تحكّم واتجاه (bidi) معه — يُنسخ إلى الطلب ويراه المسؤول كما هو.
 *
 * العقد:
 *   • منتجٌ بخيارات ⇒ النصّ قيمةٌ واحدة لكل خيار من قيمه، مفصولةً بـ«، »، بأي
 *     ترتيب: التطبيق يجمعها بترتيب نقر الزبون، والمتجر بترتيب الخيارات. القيمة
 *     عربية أو كردية (`values_ckb`) — الواجهة الكردية تعرض الكردية وترسلها.
 *   • منتجٌ بلا خيارات ⇒ `null` وحده.
 *   • غير ذلك ⇒ 400 `INVALID_PRODUCT_OPTION` ولا يُكتب شيء.
 *   • قيمةٌ تحوي «، » نفسها تُطابَق كاملةً ولا تُقسَم.
 *   • سطرٌ قائم لم يعد مطابقاً (غيّر المسؤول الخيارات بعد الإضافة، أو سطرٌ أقدم
 *     من هذا الفحص) لا يُمسّ: يبقى في العربة ويمرّ به الطلب كما خُزِّن.
 */

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const PREFIX = 'CARTOPT';
const INVALID = 'اختر قيمة صالحة لكل خيار من خيارات المنتج';
const UNEXPECTED = 'هذا المنتج بلا خيارات';

type Option = { name: string; values: string[]; valuesCkb?: string[] };

/** «المقاس» و«اللون» — قيمةٌ بمسافة، وكرديةٌ للون وحده (كما تركتها هجرة ٠٤٧). */
const SHIRT: Option[] = [
  { name: 'المقاس', values: ['S', 'M', 'XL'] },
  { name: 'اللون', values: ['أسود', 'أبيض', 'أزرق فاتح'], valuesCkb: ['ڕەش', 'سپی', 'شینی کاڵ'] },
];

describe('POST /api/cart — the option must be one of the product\'s real options', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  afterAll(async () => {
    await purgeTestUsers();
    await db.query(`DELETE FROM cart_items WHERE product_id IN (SELECT id FROM products WHERE name LIKE '${PREFIX} %')`);
    await db.query(`DELETE FROM products WHERE name LIKE '${PREFIX} %'
                      AND id NOT IN (SELECT product_id FROM order_items WHERE product_id IS NOT NULL)`);
  });

  // ── أدوات ────────────────────────────────────────────────────────────

  async function product(label: string, options: Option[] = [], stock = 20) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_active)
       VALUES ($1, 'وصف', 10000, $2, $3, TRUE) RETURNING id`,
      [`${PREFIX} ${label} ${Date.now()}`, catalog.categoryId, stock],
    );
    const id = rows[0]!.id;
    for (const option of options) {
      await db.query(
        'INSERT INTO product_options (product_id, name, values, values_ckb) VALUES ($1, $2, $3, $4)',
        [id, option.name, option.values, option.valuesCkb ?? []],
      );
    }
    return id;
  }

  /** `undefined` لا يُرسل المفتاح أصلاً (JSON يُسقطه) — كعميلٍ قديم لا يعرفه. */
  const add = (token: string, productId: string, optionValue: unknown, locale = 'ar') =>
    api.post('/api/cart').set(bearer(token)).set('Accept-Language', locale)
      .send({ productId, quantity: 1, optionValue });

  /** ما خُزِّن فعلاً في القاعدة لهذا الزبون من هذا المنتج. */
  const storedOptions = async (userId: string, productId: string) =>
    (await db.query<{ option_value: string | null; quantity: number }>(
      `SELECT ci.option_value, ci.quantity FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
        WHERE c.user_id = $1 AND ci.product_id = $2 ORDER BY ci.created_at`,
      [userId, productId],
    )).rows;

  async function expectRefused(
    token: string,
    productId: string,
    optionValue: unknown,
    message: string,
  ) {
    const res = await add(token, productId, optionValue);
    expect({ sent: optionValue, status: res.status, code: res.body.error?.code, message: res.body.message })
      .toEqual({ sent: optionValue, status: 400, code: 'INVALID_PRODUCT_OPTION', message });
  }

  // ═══ ما يرسله العميلان اليوم يمرّ ═════════════════════════════════════

  describe('what the app and the web store send is accepted, as sent', () => {
    it('one value per option, in the product\'s order (web store) or in tap order (app), values with spaces included', async () => {
      const c = await registerAndLogin();
      const p = await product('orders', SHIRT);
      const sent = ['M، أسود', 'أسود، M', 'XL، أزرق فاتح', 'أزرق فاتح، S'];
      for (const optionValue of sent) {
        const res = await add(c.token, p, optionValue);
        expect({ optionValue, status: res.status }).toEqual({ optionValue, status: 200 });
        expect(res.body.data.item.optionValue).toBe(optionValue);
      }
      expect((await storedOptions(c.userId, p)).map((r) => r.option_value)).toEqual(sent);
    });

    it('built from the product API the way each client builds it — Arabic in option order, Kurdish in reverse tap order', async () => {
      const c = await registerAndLogin();
      const p = await product('from-api', SHIRT);

      // المتجر: الخيارات بترتيبها، أوّل قيمة من كلٍّ، مجموعةً بـ«، ».
      const ar = (await api.get(`/api/catalog/products/${p}`).set('Accept-Language', 'ar').expect(200))
        .body.data.options as { name: string; values: string[] }[];
      const web = ar.map((o) => o.values[0]).join('، ');
      expect((await add(c.token, p, web)).status).toBe(200);

      // التطبيق بالكردية: يعرض `values` كما أعادها الخادم (الكردية حيث وُجدت) ويرسل
      // ما نقره الزبون بترتيب النقر — هنا الخيار الأخير أولاً.
      const ckb = (await api.get(`/api/catalog/products/${p}`).set('Accept-Language', 'ckb').expect(200))
        .body.data.options as { name: string; values: string[] }[];
      const app = [...ckb].reverse().map((o) => o.values[o.values.length - 1]).join('، ');
      expect(app).toBe('شینی کاڵ، XL');
      const res = await add(c.token, p, app, 'ckb');
      expect(res.status).toBe(200);

      expect((await storedOptions(c.userId, p)).map((r) => r.option_value)).toEqual([web, app]);
    });

    it('a product without options takes null — sent or omitted — and both merge into one line', async () => {
      const c = await registerAndLogin();
      const p = await product('no-options');
      expect((await add(c.token, p, null)).status).toBe(200);
      expect((await add(c.token, p, undefined)).status).toBe(200);
      expect(await storedOptions(c.userId, p)).toEqual([{ option_value: null, quantity: 2 }]);
    });
  });

  // ═══ ما سوى ذلك يُرفض ولا يُكتب ═══════════════════════════════════════

  describe('anything else is refused with 400 and writes nothing', () => {
    it('a product with options: missing, incomplete, extra, repeated, unknown or wrongly separated values', async () => {
      const c = await registerAndLogin();
      const p = await product('refused', SHIRT);
      for (const optionValue of [
        undefined, // المفتاح غائب
        null, // لا خيار
        '', // فارغ
        'M', // خيارٌ ناقص
        'أسود',
        'M، أسود، XL', // قيمةٌ زائدة
        'M، أسود، أسود',
        'M، XL', // قيمتان من خيارٍ واحد والآخر غائب
        'أسود، أبيض',
        'M، أحمر', // ليست من قيم اللون
        'L، أسود', // ليست من قيم المقاس
        'm، أسود', // الحالة جزءٌ من القيمة
        'M،أسود', // فاصلٌ بلا مسافة
        'M ، أسود',
        'M, أسود', // فاصلة لاتينية
        'M، أسود،', // فاصلٌ في الطرف (`trim` أزال المسافة)
        '، M، أسود',
        'أزرق، M', // نصف قيمةٍ فيها مسافة
        'لون مخصّص يكتبه الزبون بنفسه',
      ]) {
        await expectRefused(c.token, p, optionValue, INVALID);
      }
      expect(await storedOptions(c.userId, p)).toEqual([]);
    });

    it('control, bidi and zero-width characters around or inside a valid value are refused', async () => {
      const c = await registerAndLogin();
      const p = await product('controls', SHIRT);
      for (const optionValue of [
        'M‮، أسود', // RIGHT-TO-LEFT OVERRIDE
        '⁦M، أسود⁩', // LRI … PDI
        'M، أسود‏', // RLM
        'M، أسو​د', // ZERO WIDTH SPACE
        'M\u0007، أسود', // BEL
        'M\u0000، أسود', // NUL — كانت القاعدة وحدها تلتقطه
        'M\n، أسود',
      ]) {
        await expectRefused(c.token, p, optionValue, INVALID);
      }
      expect(await storedOptions(c.userId, p)).toEqual([]);
    });

    it('a product without options refuses any value, the empty string included', async () => {
      const c = await registerAndLogin();
      const p = await product('no-options-refused');
      for (const optionValue of ['أحمر', '', 'M، أسود', 'أحمر‮']) {
        await expectRefused(c.token, p, optionValue, UNEXPECTED);
      }
      expect(await storedOptions(c.userId, p)).toEqual([]);
    });

    it('the refusal reaches the Kurdish interface in Kurdish', async () => {
      const c = await registerAndLogin();
      const shirt = await product('ckb-refusal', SHIRT);
      const plain = await product('ckb-refusal-plain');

      const invalid = await add(c.token, shirt, 'M', 'ckb');
      expect(invalid.status).toBe(400);
      expect(invalid.body.message).toBe('بۆ هەر هەڵبژاردنێکی بەرهەمەکە بەهایەکی دروست دیاری بکە');

      const unexpected = await add(c.token, plain, 'ڕەش', 'ckb');
      expect(unexpected.status).toBe(400);
      expect(unexpected.body.message).toBe('ئەم بەرهەمە هەڵبژاردنی نییە');
    });
  });

  // ═══ الحالات الحدّية للمطابقة ═════════════════════════════════════════

  describe('matching edge cases', () => {
    it('[CRITICAL] a value that itself contains «، » is matched whole, never split', async () => {
      const c = await registerAndLogin();
      const p = await product('comma-value', [
        { name: 'اللون', values: ['أحمر، أسود', 'أبيض'] },
        { name: 'المقاس', values: ['M', 'L'] },
      ]);
      // تقسيمٌ ساذج على «، » يرى ثلاث قيم لخيارين فيرفض هذه — وهي صحيحة.
      for (const optionValue of ['أحمر، أسود، M', 'M، أحمر، أسود', 'أبيض، L']) {
        const res = await add(c.token, p, optionValue);
        expect({ optionValue, status: res.status }).toEqual({ optionValue, status: 200 });
      }
      // نصف القيمة ليس قيمة، والقيمة وحدها لا تكفي عن المقاس.
      for (const optionValue of ['أحمر، M', 'أسود، M', 'M، أحمر', 'أحمر، أسود', 'أحمر، أسود، أبيض']) {
        await expectRefused(c.token, p, optionValue, INVALID);
      }
      expect((await storedOptions(c.userId, p)).map((r) => r.option_value))
        .toEqual(['أحمر، أسود، M', 'M، أحمر، أسود', 'أبيض، L']);

      // خيارٌ واحد قيمته تحوي الفاصل: تُقبل كاملةً، ولا يُقبل جزؤها الثاني وحده.
      const set = await product('comma-single', [{ name: 'الطقم', values: ['قميص، بنطال', 'قميص'] }]);
      expect((await add(c.token, set, 'قميص، بنطال')).status).toBe(200);
      expect((await add(c.token, set, 'قميص')).status).toBe(200);
      for (const optionValue of ['بنطال', 'قميص، قميص', 'بنطال، قميص']) {
        await expectRefused(c.token, set, optionValue, INVALID);
      }
    });

    it('two options with the same values are each matched once', async () => {
      const c = await registerAndLogin();
      const p = await product('shared-values', [
        { name: 'لون الوجه', values: ['أسود', 'أبيض'] },
        { name: 'لون الظهر', values: ['أسود', 'أبيض'] },
      ]);
      expect((await add(c.token, p, 'أسود، أسود')).status).toBe(200);
      expect((await add(c.token, p, 'أبيض، أسود')).status).toBe(200);
      for (const optionValue of ['أسود', 'أسود، أسود، أسود']) {
        await expectRefused(c.token, p, optionValue, INVALID);
      }
    });
  });

  // ═══ الأسطر القائمة ══════════════════════════════════════════════════

  describe('existing lines are left alone', () => {
    it('a line whose option no longer matches stays in the cart, can change quantity, and is ordered as stored', async () => {
      const c = await registerAndLogin();
      const shirt = await product('stale', SHIRT);
      await add(c.token, shirt, 'M، أسود').expect(200);

      // المسؤول يغيّر الخيارات بعد الإضافة: «M، أسود» لم يعد مطابقاً.
      await api.patch(`/api/admin/products/${shirt}`).set(bearer(adminToken))
        .send({ options: [{ name: 'المقاس', values: ['L'] }] }).expect(200);

      // ومنتجٌ بلا خيارات يحمل سطراً أقدم من الفحص (كتبه عميلٌ حين كان النصّ حرّاً).
      const plain = await product('legacy');
      const { rows: [cart] } = await db.query<{ id: string }>(
        `INSERT INTO carts (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
        [c.userId],
      );
      await db.query(
        'INSERT INTO cart_items (cart_id, product_id, option_value, quantity) VALUES ($1, $2, $3, 1)',
        [cart!.id, plain, 'أحمر'],
      );

      // إضافةٌ جديدة بالنصّ القديم تُرفض — والسطر القائم لا يتغيّر.
      await expectRefused(c.token, shirt, 'M، أسود', INVALID);

      const synced = await api.get('/api/cart').set(bearer(c.token)).expect(200);
      expect(synced.body.data.adjustments).toEqual([]);
      const lines = synced.body.data.items as { id: string; productId: string; optionValue: string | null }[];
      const stale = lines.find((l) => l.productId === shirt)!;
      expect(stale.optionValue).toBe('M، أسود');
      expect(lines.find((l) => l.productId === plain)?.optionValue).toBe('أحمر');

      await api.patch(`/api/cart/${stale.id}`).set(bearer(c.token)).send({ quantity: 2 }).expect(200);

      // المعاينة لا ترى فيهما عائقاً، والإرسال المربوط بها (المتجر) يمرّ.
      const quote = (await api.get('/api/orders/checkout-quote').set(bearer(c.token))
        .query({ governorateId: catalog.governorateId }).expect(200)).body.data as {
        fingerprint: string | null;
        issues: unknown[];
        lines: { productId: string; optionValue: string | null }[];
      };
      expect(quote.issues).toEqual([]);
      expect(quote.fingerprint).not.toBeNull();
      expect(quote.lines.find((l) => l.productId === shirt)?.optionValue).toBe('M، أسود');

      const order = await api.post('/api/orders').set(bearer(c.token))
        .send({
          governorateId: catalog.governorateId,
          fullAddress: 'بغداد، الكرادة',
          phone: '07700000000',
          expectedQuote: quote.fingerprint,
        })
        .expect(201);
      const { rows: items } = await db.query<{ product_id: string; option_value: string | null; quantity: number }>(
        'SELECT product_id, option_value, quantity FROM order_items WHERE order_id = $1 ORDER BY product_id',
        [order.body.data.id],
      );
      expect(items).toEqual(expect.arrayContaining([
        { product_id: shirt, option_value: 'M، أسود', quantity: 2 },
        { product_id: plain, option_value: 'أحمر', quantity: 1 },
      ]));
      expect(items).toHaveLength(2);
    });
  });
});
