import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { restockService } from '../src/services/restockService.js';
import {
  api,
  createAdminUser,
  createSubAdmin,
  purgeSubAdmins,
  purgeTestUsers,
  registerAndLogin,
  seedTestCatalog,
  storeToday,
  TEST_PASSWORD,
} from './helpers.js';

/**
 * STEP 76 — what the backend adds for a fully functional web store:
 *
 * - B1: the authenticated product read carries the viewer's own favourite and
 *   restock state (`viewer`), never anyone else's, and is never cacheable.
 * - B2 (migration 088): restock alerts for one colour. Its return alerts only
 *   that colour's subscribers, on every path that makes it available again;
 *   product-level subscriptions (the installed app) behave as before.
 * - D1: an admin with «أعياد الميلاد» corrects a saved birthday, with a reason,
 *   in the audit log; the yearly discount stays once per year.
 * - The approved-reviews list is bounded and paged.
 *
 * Everything goes through the real routes, except where a race or a fixture
 * needs a direct row.
 */
const TAG = 'STEP76';
const IMG = (name: string) => `/uploads/product/2026/10/${name}.png`;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const openClients = new Set<pg.PoolClient>();
async function openTx() {
  const client = await db.connect();
  openClients.add(client);
  await client.query('BEGIN');
  return client;
}
async function closeTx(client: pg.PoolClient, how: 'COMMIT' | 'ROLLBACK') {
  if (!openClients.has(client)) return;
  openClients.delete(client);
  await client.query(how);
  client.release();
}
async function waitForBlocked(n: number) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const { rows } = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (rows[0]!.n >= n) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`${n} session(s) never blocked on the lock`);
}
/** supertest is lazy until `then` — start the request now so it reaches the lock. */
const eager = <T>(request: PromiseLike<T>): Promise<T> => Promise.resolve(request);

describe('STEP 76 — web store parity backend', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;
  const admin = () => bearer(adminToken);

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  afterEach(async () => {
    for (const client of [...openClients]) await closeTx(client, 'ROLLBACK');
  });

  afterAll(async () => {
    const ours = `(SELECT id FROM products WHERE name LIKE '${TAG} %')`;
    await db.query(`DELETE FROM notifications WHERE product_id IN ${ours}`);
    await db.query(`DELETE FROM order_items WHERE product_id IN ${ours}`);
    await db.query(`DELETE FROM cart_items WHERE product_id IN ${ours}`);
    await db.query(`DELETE FROM restock_subscriptions WHERE product_id IN ${ours}`);
    await db.query(`DELETE FROM admin_audit_log WHERE action = 'customer.birthday_corrected'
                      AND target_id IN (SELECT id::text FROM users WHERE phone LIKE '+96477%')`);
    await purgeTestUsers();
    await purgeSubAdmins();
    await db.query(`DELETE FROM products WHERE name LIKE '${TAG} %'`);
  });

  let counter = 0;
  async function colouredProduct(stock: { red: number; blue: number }, price: number | null = 10000) {
    counter += 1;
    const res = await api
      .post('/api/admin/products')
      .set(admin())
      .send({
        nameAr: `${TAG} قميص ${counter}`,
        descriptionAr: 'وصف',
        price,
        categoryId: catalog.categoryId,
        images: [IMG('main')],
        variants: [
          { colorName: 'أحمر', colorNameCkb: 'سوور', colorHex: '#ff0000', imageUrl: IMG('red'), stock: stock.red },
          { colorName: 'أزرق', imageUrl: IMG('blue'), stock: stock.blue },
        ],
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const product = res.body.data;
    const red = product.variants.find((v: { colorNameAr: string }) => v.colorNameAr === 'أحمر');
    const blue = product.variants.find((v: { colorNameAr: string }) => v.colorNameAr === 'أزرق');
    return { product, red, blue } as {
      product: { id: string; variants: unknown[] };
      red: { id: string; stock: number };
      blue: { id: string; stock: number };
    };
  }

  async function plainProduct(stock: number) {
    counter += 1;
    const res = await api
      .post('/api/admin/products')
      .set(admin())
      .send({ nameAr: `${TAG} كوب ${counter}`, descriptionAr: 'وصف', price: 5000, categoryId: catalog.categoryId, stock });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data as { id: string };
  }

  /** The admin's full colour list for a product, with new stocks. */
  function setColourStock(productId: string, colours: Array<{ id: string; colorName: string; imageUrl: string; stock: number }>) {
    return api.patch(`/api/admin/products/${productId}`).set(admin()).send({ variants: colours });
  }

  async function backInStock(userId: string, productId: string) {
    const { rows } = await db.query<{ title: string }>(
      `SELECT title FROM notifications WHERE user_id = $1 AND product_id = $2 AND type = 'backInStock'
        ORDER BY created_at`,
      [userId, productId],
    );
    return rows.map((row) => row.title);
  }

  /** A real order taken to COMPLETED through the admin path (cart → order → delivery → received). */
  async function completedOrder(user: { token: string }, productId: string) {
    await api.post('/api/cart').set(bearer(user.token)).send({ productId, quantity: 1 }).expect(200);
    const order = await api
      .post('/api/orders')
      .set(bearer(user.token))
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07700000000' })
      .expect(201);
    const orderId = order.body.data.id as string;
    for (const status of ['OUT_FOR_DELIVERY', 'COMPLETED']) {
      await api.patch(`/api/admin/orders/${orderId}/status`).set(admin()).send({ status }).expect(200);
    }
    return orderId;
  }

  const subscribe = (token: string, body: Record<string, unknown>) =>
    api.post('/api/restock-subscriptions').set(bearer(token)).send(body);

  // ═══ B1 — viewer state on the product read ═══

  describe('viewer state (B1)', () => {
    it('anonymous reads carry no viewer; an admin token carries none either', async () => {
      const product = await plainProduct(3);
      const anonymous = await api.get(`/api/catalog/products/${product.id}`).expect(200);
      expect(anonymous.body.data).not.toHaveProperty('viewer');
      const asAdmin = await api.get(`/api/catalog/products/${product.id}`).set(admin()).expect(200);
      expect(asAdmin.body.data).not.toHaveProperty('viewer');
    });

    it('a customer sees only their own state, never cacheable, and it syncs across their devices', async () => {
      const product = await plainProduct(3);
      const owner = await registerAndLogin();
      const other = await registerAndLogin();
      // A second login of the same account = a second device (the app, another browser).
      const secondDevice = (await api.post('/api/auth/login').send({ phone: owner.phone, password: TEST_PASSWORD }).expect(200))
        .body.data.token as string;

      const fresh = await api.get(`/api/catalog/products/${product.id}`).set(bearer(owner.token)).expect(200);
      expect(fresh.body.data.viewer).toEqual({ isFavorite: false, restockSubscribed: false, restockVariantIds: [] });
      expect(fresh.headers['cache-control']).toBe('private, no-store');

      await api.post('/api/favorites').set(bearer(owner.token)).send({ productId: product.id }).expect(200);
      const onSecond = await api.get(`/api/catalog/products/${product.id}`).set(bearer(secondDevice)).expect(200);
      expect(onSecond.body.data.viewer.isFavorite).toBe(true);
      const list = await api.get('/api/favorites').set(bearer(secondDevice)).expect(200);
      expect(list.body.data.items.map((p: { id: string }) => p.id)).toContain(product.id);

      const asOther = await api.get(`/api/catalog/products/${product.id}`).set(bearer(other.token)).expect(200);
      expect(asOther.body.data.viewer.isFavorite).toBe(false);

      await api.delete(`/api/favorites/${product.id}`).set(bearer(secondDevice)).expect(200);
      const afterRemove = await api.get(`/api/catalog/products/${product.id}`).set(bearer(owner.token)).expect(200);
      expect(afterRemove.body.data.viewer.isFavorite).toBe(false);
    });

    it('the viewer lists the product-level and the colour subscriptions of that customer only', async () => {
      const { product, red } = await colouredProduct({ red: 0, blue: 0 });
      const a = await registerAndLogin();
      const b = await registerAndLogin();
      await subscribe(a.token, { productId: product.id }).expect(200);
      await subscribe(a.token, { productId: product.id, variantId: red.id }).expect(200);
      const mine = await api.get(`/api/catalog/products/${product.id}`).set(bearer(a.token)).expect(200);
      expect(mine.body.data.viewer).toMatchObject({ restockSubscribed: true, restockVariantIds: [red.id] });
      const theirs = await api.get(`/api/catalog/products/${product.id}`).set(bearer(b.token)).expect(200);
      expect(theirs.body.data.viewer).toMatchObject({ restockSubscribed: false, restockVariantIds: [] });
    });
  });

  // ═══ B2 — colour-level restock (088) ═══

  describe('colour restock subscriptions (088)', () => {
    it('refuses an in-stock colour, accepts a sold-out one once, and keeps the old list shape', async () => {
      const { product, red, blue } = await colouredProduct({ red: 0, blue: 5 });
      const a = await registerAndLogin();

      const inStock = await subscribe(a.token, { productId: product.id, variantId: blue.id });
      expect(inStock.status).toBe(409);
      expect(inStock.body.error.code).toBe('VARIANT_IN_STOCK');

      const first = await subscribe(a.token, { productId: product.id, variantId: red.id }).expect(200);
      expect(first.body.data).toMatchObject({ subscribed: true, alreadySubscribed: false, variantId: red.id });
      const again = await subscribe(a.token, { productId: product.id, variantId: red.id }).expect(200);
      expect(again.body.data.alreadySubscribed).toBe(true);
      const { rows } = await db.query('SELECT 1 FROM restock_variant_subscriptions WHERE user_id = $1', [a.userId]);
      expect(rows).toHaveLength(1);

      const colours = await api.get('/api/restock-subscriptions/mine/variants').set(bearer(a.token)).expect(200);
      expect(colours.body.data.items).toEqual([
        expect.objectContaining({ productId: product.id, variantId: red.id, colorNameAr: 'أحمر', colorNameCkb: 'سوور', inStock: false }),
      ]);
      // The installed app's list stays product-level only.
      const legacy = await api.get('/api/restock-subscriptions/mine').set(bearer(a.token)).expect(200);
      expect(legacy.body.data).toEqual([]);

      // Product-level subscription on a coloured product in stock overall: unchanged rule.
      const productLevel = await subscribe(a.token, { productId: product.id });
      expect(productLevel.body.error.code).toBe('PRODUCT_IN_STOCK');
    });

    it('rejects a colour of another product, an inactive colour, a malformed id and anonymous callers', async () => {
      const one = await colouredProduct({ red: 0, blue: 0 });
      const two = await colouredProduct({ red: 0, blue: 0 });
      const a = await registerAndLogin();

      const foreign = await subscribe(a.token, { productId: one.product.id, variantId: two.red.id });
      expect(foreign.status).toBe(404);

      await db.query('UPDATE product_variants SET is_active = FALSE WHERE id = $1', [one.blue.id]);
      const inactive = await subscribe(a.token, { productId: one.product.id, variantId: one.blue.id });
      expect(inactive.status).toBe(404);

      expect((await subscribe(a.token, { productId: one.product.id, variantId: 'not-a-uuid' })).status).toBe(400);
      expect((await api.post('/api/restock-subscriptions').send({ productId: one.product.id, variantId: one.red.id })).status).toBe(401);
      expect((await api.get('/api/restock-subscriptions/mine/variants')).status).toBe(401);
    });

    it('a colour returning alerts only that colour; product-level subscribers follow the product total', async () => {
      const { product, red, blue } = await colouredProduct({ red: 0, blue: 0 });
      const redFan = await registerAndLogin();
      const blueFan = await registerAndLogin();
      const productFan = await registerAndLogin();
      await subscribe(redFan.token, { productId: product.id, variantId: red.id }).expect(200);
      await subscribe(blueFan.token, { productId: product.id, variantId: blue.id }).expect(200);
      await subscribe(productFan.token, { productId: product.id }).expect(200);

      const colours = (redStock: number, blueStock: number) => [
        { id: red.id, colorName: 'أحمر', imageUrl: IMG('red'), stock: redStock },
        { id: blue.id, colorName: 'أزرق', imageUrl: IMG('blue'), stock: blueStock },
      ];
      expect((await setColourStock(product.id, colours(4, 0))).status).toBe(200);

      expect(await backInStock(redFan.userId, product.id)).toEqual([expect.stringContaining('— أحمر')]);
      expect(await backInStock(blueFan.userId, product.id)).toEqual([]);
      // The product total went 0 → 4: the installed app's product-level alert, unchanged.
      expect(await backInStock(productFan.userId, product.id)).toHaveLength(1);
      const { rows: left } = await db.query<{ user_id: string }>(
        'SELECT user_id FROM restock_variant_subscriptions WHERE product_id = $1',
        [product.id],
      );
      expect(left.map((row) => row.user_id)).toEqual([blueFan.userId]);

      // Blue returns while the product is already in stock: blue's subscriber only, once.
      expect((await setColourStock(product.id, colours(4, 2))).status).toBe(200);
      expect(await backInStock(blueFan.userId, product.id)).toEqual([expect.stringContaining('— أزرق')]);
      expect(await backInStock(productFan.userId, product.id)).toHaveLength(1);
      expect(await backInStock(redFan.userId, product.id)).toHaveLength(1);

      // A later save changes nothing for anyone.
      expect((await setColourStock(product.id, colours(5, 3))).status).toBe(200);
      expect(await backInStock(redFan.userId, product.id)).toHaveLength(1);
      expect(await backInStock(blueFan.userId, product.id)).toHaveLength(1);
    });

    it('a Kurdish subscriber reads the Kurdish colour name', async () => {
      const { product, red, blue } = await colouredProduct({ red: 0, blue: 1 });
      const ckb = await registerAndLogin();
      await api.patch('/api/auth/me').set(bearer(ckb.token)).send({ preferredLanguage: 'ckb' }).expect(200);
      await subscribe(ckb.token, { productId: product.id, variantId: red.id }).expect(200);
      await setColourStock(product.id, [
        { id: red.id, colorName: 'أحمر', imageUrl: IMG('red'), stock: 2 },
        { id: blue.id, colorName: 'أزرق', imageUrl: IMG('blue'), stock: 1 },
      ]).expect(200);
      expect(await backInStock(ckb.userId, product.id)).toEqual([expect.stringContaining('— سوور')]);
    });

    it('an unpriced product defers the colour alert until its price is announced', async () => {
      const { product, red, blue } = await colouredProduct({ red: 0, blue: 0 }, null);
      const fan = await registerAndLogin();
      await subscribe(fan.token, { productId: product.id, variantId: red.id }).expect(200);
      const colours = [
        { id: red.id, colorName: 'أحمر', imageUrl: IMG('red'), stock: 3 },
        { id: blue.id, colorName: 'أزرق', imageUrl: IMG('blue'), stock: 0 },
      ];
      await setColourStock(product.id, colours).expect(200);
      expect(await backInStock(fan.userId, product.id)).toEqual([]);
      await api.patch(`/api/admin/products/${product.id}`).set(admin()).send({ price: 12000 }).expect(200);
      expect(await backInStock(fan.userId, product.id)).toHaveLength(1);
    });

    it('rejecting an approved order that frees a sold-out colour alerts that colour', async () => {
      const { product, red } = await colouredProduct({ red: 1, blue: 5 });
      const buyer = await registerAndLogin();
      const fan = await registerAndLogin();
      await api.post('/api/cart').set(bearer(buyer.token)).send({ productId: product.id, variantId: red.id, quantity: 1 }).expect(200);
      const order = await api
        .post('/api/orders')
        .set(bearer(buyer.token))
        .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07700000000' })
        .expect(201);
      await api.patch(`/api/admin/orders/${order.body.data.id}/status`).set(admin()).send({ status: 'OUT_FOR_DELIVERY' }).expect(200);
      await subscribe(fan.token, { productId: product.id, variantId: red.id }).expect(200);

      await api
        .patch(`/api/admin/orders/${order.body.data.id}/status`)
        .set(admin())
        .send({ status: 'REJECTED', note: 'سبب الرفض' })
        .expect(200);
      expect(await backInStock(fan.userId, product.id)).toEqual([expect.stringContaining('— أحمر')]);
    });

    it('unsubscribing removes only the caller\'s colour row, never someone else\'s or the product-level one', async () => {
      const { product, red } = await colouredProduct({ red: 0, blue: 0 });
      const a = await registerAndLogin();
      const b = await registerAndLogin();
      await subscribe(a.token, { productId: product.id }).expect(200);
      await subscribe(a.token, { productId: product.id, variantId: red.id }).expect(200);

      const byOther = await api
        .delete(`/api/restock-subscriptions/${product.id}?variantId=${red.id}`)
        .set(bearer(b.token))
        .expect(200);
      expect(byOther.body.data.wasSubscribed).toBe(false);

      const own = await api
        .delete(`/api/restock-subscriptions/${product.id}?variantId=${red.id}`)
        .set(bearer(a.token))
        .expect(200);
      expect(own.body.data).toMatchObject({ subscribed: false, wasSubscribed: true, variantId: red.id });
      const view = await api.get(`/api/catalog/products/${product.id}`).set(bearer(a.token)).expect(200);
      expect(view.body.data.viewer).toMatchObject({ restockSubscribed: true, restockVariantIds: [] });
    });

    it('the 088 rollback refuses while a colour subscription exists and changes nothing', async () => {
      const { product, red } = await colouredProduct({ red: 0, blue: 0 });
      const a = await registerAndLogin();
      await subscribe(a.token, { productId: product.id, variantId: red.id }).expect(200);
      const script = await readFile(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/rollback/088_restock_variant_subscriptions.down.sql'),
        'utf8',
      );
      const client = await db.connect();
      try {
        await expect(client.query(script)).rejects.toThrow(/088 rollback refused/);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      const { rows } = await db.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM restock_variant_subscriptions WHERE variant_id = $1`,
        [red.id],
      );
      expect(rows[0]!.n).toBe(1);
      const applied = await db.query(`SELECT 1 FROM schema_migrations WHERE name = '088_restock_variant_subscriptions.sql'`);
      expect(applied.rowCount).toBe(1);
    });

    it('[RACE] a subscription waiting on a colour restock sees the returned stock and is refused', async () => {
      const { product, red } = await colouredProduct({ red: 0, blue: 0 });
      const fan = await registerAndLogin();
      const restock = await openTx();
      await restock.query('UPDATE product_variants SET stock = 5 WHERE id = $1', [red.id]);
      const pending = eager(subscribe(fan.token, { productId: product.id, variantId: red.id }));
      await waitForBlocked(1);
      await closeTx(restock, 'COMMIT');
      const res = await pending;
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('VARIANT_IN_STOCK');
    });

    it('[RACE] two transactions sweeping the same colour notify its subscriber exactly once', async () => {
      const { product, red } = await colouredProduct({ red: 0, blue: 0 });
      const fan = await registerAndLogin();
      await subscribe(fan.token, { productId: product.id, variantId: red.id }).expect(200);
      await db.query('UPDATE product_variants SET stock = 2 WHERE id = $1', [red.id]);

      const names = { ar: 'منتج', ckb: null };
      const first = await openTx();
      const second = await openTx();
      expect(await restockService.variantsReturned(first, product.id, names)).toBe(1);
      const late = restockService.variantsReturned(second, product.id, names);
      await waitForBlocked(1);
      await closeTx(first, 'COMMIT');
      expect(await late).toBe(0);
      await closeTx(second, 'COMMIT');
      expect(await backInStock(fan.userId, product.id)).toHaveLength(1);
    });

    it('the dashboard lists colour demand for «طلبات التوفر» only', async () => {
      const { product, red } = await colouredProduct({ red: 0, blue: 4 });
      const fan = await registerAndLogin();
      await subscribe(fan.token, { productId: product.id, variantId: red.id }).expect(200);
      const res = await api.get('/api/admin/restock/demand/variants').set(admin()).expect(200);
      const row = res.body.data.find((entry: { variantId: string }) => entry.variantId === red.id);
      expect(row).toMatchObject({ productId: product.id, colorName: 'أحمر', subscriberCount: 1, productStock: 4 });
      expect(row.subscribers[0].phone).toBe(fan.phone);

      const noRestock = await createSubAdmin(['orders'], { suffix: 7601 });
      expect((await api.get('/api/admin/restock/demand/variants').set(bearer(noRestock.token))).status).toBe(403);
      expect((await api.get('/api/admin/restock/demand/variants').set(bearer(fan.token))).status).toBe(403);
    });
  });

  // ═══ D1 — admin birthday correction ═══

  describe('admin birthday correction (D1)', () => {
    const correct = (token: string, customerId: string, body: Record<string, unknown>) =>
      api.patch(`/api/admin/customers/${customerId}/birthday`).set(bearer(token)).send(body);

    async function audits(customerId: string) {
      const { rows } = await db.query<{ details: Record<string, unknown>; actor_id: string }>(
        `SELECT details, actor_id FROM admin_audit_log
          WHERE action = 'customer.birthday_corrected' AND target_id = $1 ORDER BY created_at`,
        [customerId],
      );
      return rows;
    }

    it('nothing to correct before the customer set a birthday', async () => {
      const customer = await registerAndLogin();
      const res = await correct(adminToken, customer.userId, { day: 3, month: 4, reason: 'تصحيح' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('BIRTHDAY_NOT_SET');
    });

    it('corrects a saved birthday with an audit entry; the same value writes nothing; customers still cannot change it', async () => {
      const customer = await registerAndLogin();
      await db.query('UPDATE users SET birth_day = 5, birth_month = 6, birthday_set_at = now() WHERE id = $1', [customer.userId]);
      const supervisor = await createSubAdmin(['birthdays'], { suffix: 7602 });

      const res = await correct(supervisor.token, customer.userId, { day: 15, month: 6, reason: 'خطأ في الإدخال' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data).toMatchObject({ day: 15, month: 6, changed: true });
      const entries = await audits(customer.userId);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.actor_id).toBe(supervisor.userId);
      expect(entries[0]!.details).toMatchObject({
        from: { day: 5, month: 6 },
        to: { day: 15, month: 6 },
        reason: 'خطأ في الإدخال',
      });

      const same = await correct(supervisor.token, customer.userId, { day: 15, month: 6, reason: 'مكرر' }).expect(200);
      expect(same.body.data.changed).toBe(false);
      expect(await audits(customer.userId)).toHaveLength(1);

      const status = await api.get('/api/birthday').set(bearer(customer.token)).expect(200);
      expect(status.body.data).toMatchObject({ day: 15, month: 6, hasBirthday: true });
      const self = await api.post('/api/birthday').set(bearer(customer.token)).send({ day: 1, month: 1 });
      expect(self.status).toBeGreaterThanOrEqual(400);
    });

    it('validates the date and the reason, and refuses non-customers and unauthorised callers', async () => {
      const customer = await registerAndLogin();
      await db.query('UPDATE users SET birth_day = 5, birth_month = 6 WHERE id = $1', [customer.userId]);
      // An impossible date is the same 422 the customer's own form gets (`isValidDayForMonth`).
      expect((await correct(adminToken, customer.userId, { day: 31, month: 2, reason: 'تصحيح' })).status).toBe(422);
      expect((await correct(adminToken, customer.userId, { day: 3, month: 4 })).status).toBe(400);
      expect((await correct(adminToken, customer.userId, { day: 3, month: 4, reason: 'ok', extra: 1 })).status).toBe(400);

      const otherAdmin = await createSubAdmin(['orders'], { suffix: 7603 });
      expect((await correct(adminToken, otherAdmin.userId, { day: 3, month: 4, reason: 'تصحيح' })).status).toBe(404);
      expect((await correct(otherAdmin.token, customer.userId, { day: 3, month: 4, reason: 'تصحيح' })).status).toBe(403);
      expect((await correct(customer.token, customer.userId, { day: 3, month: 4, reason: 'تصحيح' })).status).toBe(403);
      expect((await api.patch(`/api/admin/customers/${customer.userId}/birthday`).send({ day: 3, month: 4, reason: 'x y' })).status).toBe(401);
      expect(await audits(customer.userId)).toHaveLength(0);
    });

    it('moving the birthday to today after this year\'s discount was used grants no second discount', async () => {
      const customer = await registerAndLogin();
      const product = await plainProduct(5);
      const orderId = await completedOrder(customer, product.id);
      const today = await storeToday();
      const other = today.month === 1 ? 2 : 1;
      await db.query('UPDATE users SET birth_day = 1, birth_month = $2 WHERE id = $1', [customer.userId, other]);
      // This year's discount already used — the row the order path writes (`birthdayRepo.consume`).
      await db.query(
        `INSERT INTO birthday_discount_usage (user_id, order_id, used_year, amount)
         VALUES ($1, $2, EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Baghdad'))::int, 1000)`,
        [customer.userId, orderId],
      );
      await correct(adminToken, customer.userId, { ...today, reason: 'تصحيح' }).expect(200);
      const status = await api.get('/api/birthday').set(bearer(customer.token)).expect(200);
      expect(status.body.data).toMatchObject({ isBirthdayToday: true, rewardAvailable: false });
    });
  });

  // ═══ Approved reviews: bounded and paged ═══

  describe('approved reviews list', () => {
    it('is an array, newest first, paged by page/limit, and refuses out-of-range paging', async () => {
      const product = await plainProduct(10);
      const ids: string[] = [];
      for (let n = 0; n < 3; n += 1) {
        const reviewer = await registerAndLogin();
        const orderId = await completedOrder(reviewer, product.id);
        const review = await api
          .post('/api/reviews')
          .set(bearer(reviewer.token))
          .send({ orderId, productId: product.id, rating: 5 - n, comment: `تعليق ${n}` })
          .expect(201);
        await api.patch(`/api/admin/reviews/${review.body.data.id}/moderate`).set(admin()).send({ status: 'approved' }).expect(200);
        ids.push(review.body.data.id as string);
      }
      const newestFirst = [...ids].reverse();

      const all = await api.get(`/api/catalog/products/${product.id}/reviews`).expect(200);
      expect(all.body.data.map((r: { id: string }) => r.id)).toEqual(newestFirst);
      const first = await api.get(`/api/catalog/products/${product.id}/reviews?page=1&limit=2`).expect(200);
      expect(first.body.data.map((r: { id: string }) => r.id)).toEqual(newestFirst.slice(0, 2));
      const second = await api.get(`/api/catalog/products/${product.id}/reviews?page=2&limit=2`).expect(200);
      expect(second.body.data.map((r: { id: string }) => r.id)).toEqual(newestFirst.slice(2));

      // The product's own counters drive "more?" and the rating sort.
      const detail = await api.get(`/api/catalog/products/${product.id}`).expect(200);
      expect(detail.body.data).toMatchObject({ reviewCount: 3, rating: 4 });

      expect((await api.get(`/api/catalog/products/${product.id}/reviews?limit=0`)).status).toBe(400);
      expect((await api.get(`/api/catalog/products/${product.id}/reviews?limit=51`)).status).toBe(400);
      expect((await api.get(`/api/catalog/products/${product.id}/reviews?page=0`)).status).toBe(400);
    });
  });
});
