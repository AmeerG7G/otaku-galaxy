import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';

/**
 * الهجرة ٠٦١ وتطهير بيانات الأداء — لا يُمحى زبونٌ حقيقي ببادئة هاتفه.
 *
 * [CRITICAL REGRESSION GUARD] كانت الهجرة والتطهير يحذفان بـ`phone LIKE
 * '+96479%'` وحده. ‎+96479 أرقام زين العراق الحقيقية: في قاعدة التطوير ثلاثة
 * زبائن حقيقيون طابقوها (اثنان لهم طلبات). الهوية الآن ثلاث علامات معاً —
 * الاسم `perf-user-N`، الهاتف ‎`+96479` بثمانية أرقام، والتجزئة `'x'` التي لا
 * يملكها حسابٌ حقيقي (bcrypt دائماً).
 *
 * الجزء الأول يشغّل ملف الهجرة نفسه داخل معاملة تُرجَع (نمط اختبار ٠٥١) على
 * صفوفٍ صُمّمت لتطابق المسند القديم ولا تطابق الجديد. الثاني يزرع ملف الأداء
 * الحقيقي فوق زبونٍ حقيقي يحمل رقم `perf-user-1` نفسه، ثم يطهّر.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(here, '../src/database/migrations/061_purge_perf_reviews.sql');
const SEED = path.resolve(here, 'fixtures/perf-dataset.sql');
const PURGE = path.resolve(here, 'fixtures/perf-dataset-purge.sql');

/** تجزئة bcrypt شكلاً (60 محرفاً) — كما يخزّنها كل حسابٍ حقيقي. */
const REAL_HASH = `$2a$10$${'a'.repeat(53)}`;

async function insertUser(client: pg.PoolClient, username: string, phone: string, hash: string) {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO users (username, phone, password_hash) VALUES ($1, $2, $3) RETURNING id`,
    [username, phone, hash],
  );
  return rows[0]!.id;
}

async function insertOrder(client: pg.PoolClient, number: string, userId: string, governorateId: string) {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO orders (number, user_id, governorate_id, province, full_address, phone,
                         products_total, delivery_fee, total)
     VALUES ($1, $2, $3, 'perf-gov', 'addr', '+9647900000000', 1000, 0, 1000) RETURNING id`,
    [number, userId, governorateId],
  );
  return rows[0]!.id;
}

async function exists(client: pg.PoolClient, table: string, id: string) {
  const { rows } = await client.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  return rows.length === 1;
}

describe('الهجرة ٠٦١: الهوية المزيفة لا بادئة الهاتف', () => {
  let client: pg.PoolClient;

  beforeEach(async () => {
    client = await db.connect();
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
    client.release();
  });

  it('[CRITICAL] تحذف بيانات الأداء وحدها، وتُبقي كل زبونٍ حقيقي يطابق ‎+96479', async () => {
    const gov = (
      await client.query<{ id: string }>(
        `INSERT INTO governorates (name, delivery_fee) VALUES ('perf-gov', 5000)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      )
    ).rows[0]!.id;
    const perfCat = (
      await client.query<{ id: string }>(
        `INSERT INTO categories (name, image_url) VALUES ('perf-cat', '')
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      )
    ).rows[0]!.id;
    const realCat = (
      await client.query<{ id: string }>(
        `INSERT INTO categories (name, image_url) VALUES ('M061 قسم حقيقي', '') RETURNING id`,
      )
    ).rows[0]!.id;

    // زبونٌ حقيقي على زين، بطلبٍ وإشعار — كان المسند القديم يمحوه (أو يفشل).
    const realZain = await insertUser(client, 'زبون زين', '+9647912345678', REAL_HASH);
    const realOrder = await insertOrder(client, '9061001', realZain, gov);
    await client.query(`INSERT INTO notifications (user_id, type, title) VALUES ($1, 'promotion', 'حقيقي')`, [realZain]);
    // زبونٌ حقيقي على زين بلا طلبات — كان يُمحى بصمتٍ مع كل ما يتتالى عنه.
    const realZainNoOrders = await insertUser(client, 'زبونة زين', '+9647987654321', REAL_HASH);
    await client.query(`INSERT INTO carts (user_id) VALUES ($1)`, [realZainNoOrders]);
    // اسمٌ يحاكي الأداء لكن بتجزئة حقيقية: الاسم يختاره الزبون، فلا يكفي وحده.
    const spoof = await insertUser(client, 'perf-user-424242', '+9647900424242', REAL_HASH);

    // زبونا أداء حقيقيا العلامات الثلاث.
    const perfA = await insertUser(client, 'perf-user-1', '+9647900000001', 'x');
    const perfOrder = await insertOrder(client, 'perf-1', perfA, gov);
    await client.query(`INSERT INTO notifications (user_id, type, title) VALUES ($1, 'promotion', 'perf')`, [perfA]);
    // زبون أداء له طلبٌ غير مزيف: يُترك مع طلبه، ولا تفشل الهجرة على RESTRICT.
    const perfB = await insertUser(client, 'perf-user-2', '+9647900000002', 'x');
    const perfBRealOrder = await insertOrder(client, '9061002', perfB, gov);

    // منتجات: أداءٌ في قسم الأداء يُحذف؛ منتج حقيقي في قسم الأداء يبقى (ويُبقي
    // القسم)؛ منتجٌ باسم أداء في قسمٍ حقيقي يبقى.
    const product = async (name: string, categoryId: string) =>
      (
        await client.query<{ id: string }>(
          `INSERT INTO products (name, price, category_id) VALUES ($1, 1000, $2) RETURNING id`,
          [name, categoryId],
        )
      ).rows[0]!.id;
    const perfProduct = await product('perf-product-1', perfCat);
    const realInPerfCat = await product('تيشيرت حقيقي', perfCat);
    const perfNamedRealCat = await product('perf-product-2', realCat);

    // المسند القديم كان يطابق الحقيقيين — وإلا فالاختبار لا يثبت شيئاً.
    const oldMatches = (
      await client.query<{ id: string }>(`SELECT id FROM users WHERE phone LIKE '+96479%'`)
    ).rows.map((r) => r.id);
    expect(oldMatches).toEqual(expect.arrayContaining([realZain, realZainNoOrders, spoof]));

    await client.query(await readFile(MIGRATION, 'utf8'));

    // الحقيقيون وكل ما لهم باقٍ.
    expect(await exists(client, 'users', realZain)).toBe(true);
    expect(await exists(client, 'users', realZainNoOrders)).toBe(true);
    expect(await exists(client, 'users', spoof)).toBe(true);
    expect(await exists(client, 'orders', realOrder)).toBe(true);
    const realNotifs = await client.query(`SELECT 1 FROM notifications WHERE user_id = $1`, [realZain]);
    expect(realNotifs.rowCount).toBe(1);
    const realCart = await client.query(`SELECT 1 FROM carts WHERE user_id = $1`, [realZainNoOrders]);
    expect(realCart.rowCount).toBe(1);

    // الأداء محذوف.
    expect(await exists(client, 'users', perfA)).toBe(false);
    expect(await exists(client, 'orders', perfOrder)).toBe(false);
    expect(await exists(client, 'products', perfProduct)).toBe(false);

    // ما يربطه صفٌّ حقيقي يُترك.
    expect(await exists(client, 'users', perfB)).toBe(true);
    expect(await exists(client, 'orders', perfBRealOrder)).toBe(true);
    expect(await exists(client, 'products', realInPerfCat)).toBe(true);
    expect(await exists(client, 'categories', perfCat)).toBe(true);
    expect(await exists(client, 'products', perfNamedRealCat)).toBe(true);
    expect(await exists(client, 'governorates', gov)).toBe(true);

    // متساوية القوة: تشغيلٌ ثانٍ لا يفشل ولا يمسّ شيئاً آخر.
    await client.query(await readFile(MIGRATION, 'utf8'));
    expect(await exists(client, 'users', realZain)).toBe(true);
  });

  it('لا تحمل BEGIN/COMMIT — المشغّل يلفّها ويسجّلها في معاملته', async () => {
    const sql = (await readFile(MIGRATION, 'utf8')).replace(/^\s*--.*$/gm, '');
    expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
  });
});

describe('ملفّا الأداء: التطهير بهوية الهجرة نفسها', () => {
  it('[CRITICAL] جسم التطهير هو جسم الهجرة حرفياً، ولا حذف ببادئة الهاتف وحدها', async () => {
    const migration = await readFile(MIGRATION, 'utf8');
    const purge = await readFile(PURGE, 'utf8');
    const body = migration.slice(migration.indexOf('DROP TABLE IF EXISTS perf_purge_users'));
    expect(purge).toContain(body.trim());
    for (const sql of [migration, purge]) {
      expect(sql.replace(/^\s*--.*$/gm, '')).not.toMatch(/phone LIKE '\+96479%'/);
    }
  });

  it('الزرع يربط بيانات الأداء بزبائن الأداء بالاسم والتجزئة لا بالهاتف', async () => {
    const seed = (await readFile(SEED, 'utf8')).replace(/^\s*--.*$/gm, '');
    expect(seed).not.toMatch(/JOIN users u ON u\.phone/);
    expect(seed).toMatch(/INSERT INTO users[\s\S]*'perf-user-' \|\| g, '\+96479' \|\| lpad\(g::text, 8, '0'\), 'x'/);
  });
});

describe('زرع الأداء ثم تطهيره فوق زبونٍ حقيقي يحمل رقم perf-user-1', () => {
  // رقم `perf-user-1` نفسه. `ON CONFLICT (phone) DO NOTHING` يتخطّاه في الزرع،
  // وكان الربط بالهاتف سيعلّق به طلباتٍ وإشعارات وتقييمات أداء.
  const SENTINEL_PHONE = '+9647900000001';
  let sentinel = '';

  afterAll(async () => {
    await db.query(await readFile(PURGE, 'utf8'));
    if (sentinel) {
      await db.query('DELETE FROM notifications WHERE user_id = $1', [sentinel]);
      await db.query('DELETE FROM users WHERE id = $1', [sentinel]);
    }
  }, 120_000);

  it('[CRITICAL] يزرع ويطهّر الأداء وحده — الحقيقي باقٍ بلا بيانات أداء', async () => {
    await db.query(await readFile(PURGE, 'utf8'));
    await db.query('DELETE FROM users WHERE phone = $1', [SENTINEL_PHONE]);
    sentinel = (
      await db.query<{ id: string }>(
        `INSERT INTO users (username, phone, password_hash) VALUES ('زبون حقيقي', $1, $2) RETURNING id`,
        [SENTINEL_PHONE, REAL_HASH],
      )
    ).rows[0]!.id;
    await db.query(`INSERT INTO notifications (user_id, type, title) VALUES ($1, 'promotion', 'حقيقي')`, [sentinel]);

    await db.query(await readFile(SEED, 'utf8'));
    const perfCount = async () =>
      Number(
        (
          await db.query<{ n: string }>(
            `SELECT count(*)::text AS n FROM users
              WHERE username ~ '^perf-user-[0-9]+$' AND password_hash = 'x'`,
          )
        ).rows[0]!.n,
      );
    // ٣٬٠٠٠ ناقص الذي تخطّاه تعارض الرقم.
    expect(await perfCount()).toBe(2999);
    const attached = await db.query(
      `SELECT (SELECT count(*) FROM orders WHERE user_id = $1)::int AS orders,
              (SELECT count(*) FROM reviews WHERE user_id = $1)::int AS reviews,
              (SELECT count(*) FROM notifications WHERE user_id = $1)::int AS notifications`,
      [sentinel],
    );
    expect(attached.rows[0]).toEqual({ orders: 0, reviews: 0, notifications: 1 });

    await db.query(await readFile(PURGE, 'utf8'));
    expect(await perfCount()).toBe(0);
    const left = await db.query(
      `SELECT (SELECT count(*) FROM orders WHERE number ~ '^perf-[0-9]+$')::int AS orders,
              (SELECT count(*) FROM products WHERE name ~ '^perf-product-[0-9]+$')::int AS products,
              (SELECT count(*) FROM categories WHERE name = 'perf-cat')::int AS categories`,
    );
    expect(left.rows[0]).toEqual({ orders: 0, products: 0, categories: 0 });
    const kept = await db.query(
      `SELECT u.username, (SELECT count(*) FROM notifications n WHERE n.user_id = u.id)::int AS notifications
         FROM users u WHERE u.id = $1`,
      [sentinel],
    );
    expect(kept.rows[0]).toEqual({ username: 'زبون حقيقي', notifications: 1 });
  }, 240_000);
});
