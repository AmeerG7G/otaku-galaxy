import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * المحافظات الثماني عشرة ورسومها المعتمدة (الهجرة ٠٩٢).
 *
 * [CRITICAL REGRESSION GUARD] الإنتاج وصل بلا محافظات: كانت في
 * `scripts/seed.ts` وحده، والقاعدة الجديدة تُبنى من الهجرات فقط. هذا الملف
 * يعمل على قاعدةٍ مهاجَرة بلا بذرة (كما في CI) — فما يراه هنا هو ما يصل الإنتاج.
 *
 * الأسعار من المالك (2026-11-03): بغداد 5000، النجف منطقتان 3000/4000،
 * والبقية 6000.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(here, '../src/database/migrations/092_governorates_reference_data.sql');

const FLAT: Record<string, number> = {
  'بغداد': 5000,
  'البصرة': 6000,
  'نينوى': 6000,
  'أربيل': 6000,
  'السليمانية': 6000,
  'دهوك': 6000,
  'كركوك': 6000,
  'الأنبار': 6000,
  'ديالى': 6000,
  'بابل': 6000,
  'كربلاء': 6000,
  'واسط': 6000,
  'صلاح الدين': 6000,
  'القادسية': 6000,
  'المثنى': 6000,
  'ذي قار': 6000,
  'ميسان': 6000,
};
const NAJAF = 'النجف';
const ALL = [...Object.keys(FLAT), NAJAF];
const ZONES = { 'داخل قضاء النجف': 3000, 'خارج قضاء النجف': 4000 } as const;

type GovernorateDto = {
  id: string;
  name: string;
  deliveryFee: number;
  zoneFeeMin: number | null;
  zoneFeeMax: number | null;
};

async function publicGovernorates(): Promise<GovernorateDto[]> {
  const res = await api.get('/api/catalog/governorates').expect(200);
  return res.body.data.items as GovernorateDto[];
}

describe('المحافظات بعد الهجرات وحدها', () => {
  it('الثماني عشرة موجودة مرةً واحدة، نشطةً، وبكرديّتها', async () => {
    const { rows } = await db.query<{ name: string; n: string; active: boolean; ckb: boolean }>(
      `SELECT name, COUNT(*)::text AS n, bool_and(is_active) AS active, bool_and(name_ckb IS NOT NULL) AS ckb
         FROM governorates WHERE name = ANY($1) GROUP BY name`,
      [ALL],
    );
    expect(rows.map((r) => r.name).sort()).toEqual([...ALL].sort());
    for (const row of rows) {
      expect(row.n, row.name).toBe('1');
      expect(row.active, row.name).toBe(true);
      expect(row.ckb, row.name).toBe(true);
    }
    // كردستان إقليمٌ لا محافظة (٠٥٧) — لا تعود.
    const kurdistan = await db.query(`SELECT 1 FROM governorates WHERE name = 'كردستان' AND is_active`);
    expect(kurdistan.rowCount).toBe(0);
  });

  it('القائمة العامة: بغداد 5000، الست عشرة 6000، والنجف مدى 3000–4000', async () => {
    const items = await publicGovernorates();
    for (const name of ALL) {
      expect(items.filter((g) => g.name === name), name).toHaveLength(1);
    }
    for (const [name, fee] of Object.entries(FLAT)) {
      const g = items.find((item) => item.name === name)!;
      expect(g.deliveryFee, name).toBe(fee);
      expect(g.zoneFeeMin, name).toBeNull();
      expect(g.zoneFeeMax, name).toBeNull();
    }
    const najaf = items.find((item) => item.name === NAJAF)!;
    expect([najaf.zoneFeeMin, najaf.zoneFeeMax]).toEqual([3000, 4000]);
  });

  it('منطقتا النجف بترتيبهما ورسمهما', async () => {
    const najaf = (await publicGovernorates()).find((g) => g.name === NAJAF)!;
    const res = await api.get(`/api/catalog/governorates/${najaf.id}/zones`).expect(200);
    const zones = res.body.data.items as Array<{ name: string; deliveryFee: number }>;
    expect(zones.map((z) => [z.name, z.deliveryFee])).toEqual(Object.entries(ZONES));
  });
});

describe('الدفع لكل محافظة: المعروض = المحتسب = المحفوظ', () => {
  let productId: string;
  let governorates: GovernorateDto[];
  let zones: Array<{ id: string; name: string; deliveryFee: number }>;

  beforeAll(async () => {
    const catalog = await seedTestCatalog();
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock)
       VALUES ($1, 'وصف', 10000, $2, 1000) RETURNING id`,
      [`منتج المحافظات ${Date.now()}`, catalog.categoryId],
    );
    productId = rows[0]!.id;
    governorates = await publicGovernorates();
    const najaf = governorates.find((g) => g.name === NAJAF)!;
    zones = (await api.get(`/api/catalog/governorates/${najaf.id}/zones`).expect(200)).body.data.items;
  });

  async function customerWithCart() {
    const user = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    return user.token;
  }

  async function checkout(token: string, body: Record<string, unknown>) {
    const query = new URLSearchParams(body as Record<string, string>).toString();
    const quote = await api.get(`/api/orders/checkout-quote?${query}`).set('Authorization', `Bearer ${token}`);
    const order = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      // رسومٌ مزوّرة من العميل — يتجاهلها الخادم.
      .send({ fullAddress: 'عنوان اختبار المحافظات', phone: '07733333333', deliveryFee: 1, total: 1, ...body });
    return { quote, order };
  }

  it.each(Object.entries(FLAT))('%s ← %i', async (name, fee) => {
    const governorateId = governorates.find((g) => g.name === name)!.id;
    const token = await customerWithCart();
    const { quote, order } = await checkout(token, { governorateId });
    expect(quote.status).toBe(200);
    expect(quote.body.data.deliveryFee).toBe(fee);
    expect(order.status).toBe(201);
    expect(order.body.data.deliveryFee).toBe(fee);
    expect(order.body.data.total).toBe(10000 + fee);
    const saved = await db.query<{ delivery_fee: string; zone_id: string | null }>(
      'SELECT delivery_fee, zone_id FROM orders WHERE id = $1',
      [order.body.data.id],
    );
    expect(Number(saved.rows[0]!.delivery_fee)).toBe(fee);
    expect(saved.rows[0]!.zone_id).toBeNull();
  });

  it.each(Object.entries(ZONES))('النجف + %s ← %i', async (zoneName, fee) => {
    const governorateId = governorates.find((g) => g.name === NAJAF)!.id;
    const zoneId = zones.find((z) => z.name === zoneName)!.id;
    const token = await customerWithCart();
    const { quote, order } = await checkout(token, { governorateId, zoneId });
    expect(quote.body.data.deliveryFee).toBe(fee);
    expect(order.status).toBe(201);
    expect(order.body.data.deliveryFee).toBe(fee);
    expect(order.body.data.zoneName).toBe(zoneName);
    const saved = await db.query<{ delivery_fee: string; zone_id: string; zone_name: string }>(
      'SELECT delivery_fee, zone_id, zone_name FROM orders WHERE id = $1',
      [order.body.data.id],
    );
    expect(Number(saved.rows[0]!.delivery_fee)).toBe(fee);
    expect(saved.rows[0]!.zone_id).toBe(zoneId);
    expect(saved.rows[0]!.zone_name).toBe(zoneName);
  });

  it('النجف بلا منطقة مرفوض', async () => {
    const governorateId = governorates.find((g) => g.name === NAJAF)!.id;
    const { order } = await checkout(await customerWithCart(), { governorateId });
    expect(order.status).toBe(400);
    expect(order.body.error.code).toBe('ZONE_REQUIRED');
  });

  it('منطقة النجف مع محافظةٍ أخرى مرفوضة', async () => {
    const governorateId = governorates.find((g) => g.name === 'بغداد')!.id;
    const { order } = await checkout(await customerWithCart(), { governorateId, zoneId: zones[0]!.id });
    expect(order.status).toBe(400);
    expect(order.body.error.code).toBe('ZONE_NOT_SUPPORTED');
  });

  it('محافظة غير موجودة أو معرّف غير صالح مرفوض', async () => {
    const token = await customerWithCart();
    const unknown = await checkout(token, { governorateId: '00000000-0000-4000-8000-000000000000' });
    expect(unknown.order.status).toBe(400);
    const malformed = await checkout(token, { governorateId: 'baghdad' });
    expect(malformed.order.status).toBe(400);
  });
});

describe('الهجرة ٠٩٢ نفسها — داخل معاملة تُرجَع', () => {
  let client: pg.PoolClient;
  let sql: string;

  beforeAll(async () => {
    sql = await readFile(MIGRATION, 'utf8');
  });
  beforeEach(async () => {
    client = await db.connect();
    await client.query('BEGIN');
  });
  afterEach(async () => {
    await client.query('ROLLBACK');
    client.release();
  });

  async function snapshot() {
    const governorates = await client.query(
      `SELECT id, name, name_ckb, delivery_fee, is_active, sort_order FROM governorates
        WHERE name = ANY($1) ORDER BY name`,
      [ALL],
    );
    const zones = await client.query(
      `SELECT z.id, z.name, z.name_ckb, z.delivery_fee, z.is_active, z.sort_order
         FROM governorate_zones z JOIN governorates g ON g.id = z.governorate_id
        WHERE g.name = $1 ORDER BY z.name`,
      [NAJAF],
    );
    return { governorates: governorates.rows, zones: zones.rows };
  }

  it('تشغيلها مرةً ثانية لا يغيّر شيئاً', async () => {
    const before = await snapshot();
    await client.query(sql);
    expect(await snapshot()).toEqual(before);
  });

  it('تصحّح المخالف فقط — بالمعرّفات نفسها — ولا تمسّ لقطة طلبٍ قديم', async () => {
    const { rows: [baghdad] } = await client.query<{ id: string }>(`SELECT id FROM governorates WHERE name = 'بغداد'`);
    const { rows: [user] } = await client.query<{ id: string }>(
      `INSERT INTO users (username, phone, password_hash, gender)
       VALUES ('زبون ٠٩٢', '+9647711092092', 'x', 'male') RETURNING id`,
    );
    const { rows: [oldOrder] } = await client.query<{ id: string }>(
      `INSERT INTO orders (number, user_id, governorate_id, province, full_address, phone,
                           products_total, delivery_fee, total)
       VALUES ('OG-092-OLD', $1, $2, 'بغداد', 'عنوان', '+9647711092092', 10000, 9999, 19999) RETURNING id`,
      [user!.id, baghdad!.id],
    );

    await client.query(`UPDATE governorates SET delivery_fee = 9999 WHERE name = 'بغداد'`);
    await client.query(`UPDATE governorates SET is_active = FALSE WHERE name = 'البصرة'`);
    await client.query(`UPDATE governorates SET name_ckb = NULL WHERE name = 'كركوك'`);
    await client.query(`UPDATE governorates SET name_ckb = 'كردي المسؤول' WHERE name = 'بابل'`);
    await client.query(`UPDATE governorates SET delivery_fee = 7777 WHERE name = $1`, [NAJAF]);
    await client.query(
      `UPDATE governorate_zones SET delivery_fee = 1, is_active = FALSE
        WHERE name = 'داخل قضاء النجف'`,
    );
    const idsBefore = (await snapshot()).governorates.map((g) => g.id);

    await client.query(sql);

    const after = await snapshot();
    expect(after.governorates.map((g) => g.id)).toEqual(idsBefore);
    const byName = Object.fromEntries(after.governorates.map((g) => [g.name, g]));
    expect(Number(byName['بغداد'].delivery_fee)).toBe(5000);
    expect(byName['البصرة'].is_active).toBe(true);
    expect(byName['كركوك'].name_ckb).toBe('کەرکووک');
    // الكردي المحفوظ لا يُستبدل — يُملأ الفارغ فقط.
    expect(byName['بابل'].name_ckb).toBe('كردي المسؤول');
    // رسم النجف المسطّح لا يُحتسب مع مناطقها، فلا تمسّه الهجرة.
    expect(Number(byName[NAJAF].delivery_fee)).toBe(7777);
    const inside = after.zones.find((z) => z.name === 'داخل قضاء النجف')!;
    expect(Number(inside.delivery_fee)).toBe(3000);
    expect(inside.is_active).toBe(true);

    const { rows: [order] } = await client.query<{ delivery_fee: string; total: string }>(
      'SELECT delivery_fee, total FROM orders WHERE id = $1',
      [oldOrder!.id],
    );
    expect(Number(order!.delivery_fee)).toBe(9999);
    expect(Number(order!.total)).toBe(19999);
  });

  it('اسمٌ يختلف بالإملاء فقط يوقفها بدل نسخةٍ ثانية', async () => {
    await client.query(`UPDATE governorates SET name = 'ذيقار' WHERE name = 'ذي قار'`);
    await expect(client.query(sql)).rejects.toThrow(/differ only in spelling: ذي قار ≈ ذيقار/);
  });

  it('منطقةٌ نشطة ثالثة للنجف توقفها — المدى قرار المالك', async () => {
    await client.query(
      `INSERT INTO governorate_zones (governorate_id, name, delivery_fee)
       SELECT id, 'الكوفة', 3500 FROM governorates WHERE name = $1`,
      [NAJAF],
    );
    await expect(client.query(sql)).rejects.toThrow(/Najaf has other active zones: الكوفة/);
  });
});
