import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, registerAndLogin, purgeTestUsers } from './helpers.js';

/**
 * إدارة العروض والمختارة من مسار الإدارة.
 *
 * [CRITICAL] كانت شاشة العروض في اللوحة تقرأ قسميها من `/api/catalog/products`
 * العام. المسار العام يُخفي المنتجات المعطّلة عمداً (هذا شرطه الأول)، فمنتجٌ
 * معطّل مرفوعٌ كعرض كان يختفي من الشاشة التي يُفترض أن تديره — لا يظهر، ولا
 * يمكن إزالته من العروض. الحل ليس كشف المعطّل للجمهور بل إعطاء مسار الإدارة
 * — المحميّ بـ`requireAdmin` — نفس الترشيح.
 */

let adminToken: string;
let customerToken: string;
let productId: string;

async function seedProduct(overrides: {
  isActive?: boolean;
  isOffer?: boolean;
  isSelected?: boolean;
} = {}) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO products (name, description, price, stock, category_id, is_active, is_offer, is_selected)
     VALUES ($1, 'وصف', 25000, 5,
             (SELECT id FROM categories ORDER BY created_at LIMIT 1),
             $2, $3, $4)
     RETURNING id`,
    [
      `منتج عروض ${Math.random().toString(36).slice(2, 8)}`,
      overrides.isActive ?? true,
      overrides.isOffer ?? false,
      overrides.isSelected ?? false,
    ],
  );
  const id = rows[0]!.id;
  await db.query(
    `INSERT INTO product_images (product_id, url, sort_order) VALUES ($1, '/uploads/a.png', 0)`,
    [id],
  );
  await db.query(
    `INSERT INTO product_options (product_id, name, values) VALUES ($1, 'المقاس', $2)`,
    [id, ['S', 'M']],
  );
  return id;
}

beforeAll(async () => {
  adminToken = await createAdminUser();
  customerToken = (await registerAndLogin()).token;
  productId = await seedProduct({ isOffer: true, isSelected: true });
});

afterAll(async () => {
  await db.query('DELETE FROM products WHERE name LIKE $1', ['منتج عروض %']);
  await purgeTestUsers();
});

describe('قائمة منتجات الإدارة — ترشيح العروض والمختارة', () => {
  it('قسم «العروض» يُحمَّل من مسار الإدارة', async () => {
    const res = await api
      .get('/api/admin/products?offer=true&page=1&limit=12')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.every((p: { isOffer: boolean }) => p.isOffer)).toBe(true);
    expect(res.body.data.items.some((p: { id: string }) => p.id === productId)).toBe(true);
  });

  it('قسم «المختارة» يُحمَّل من مسار الإدارة', async () => {
    const res = await api
      .get('/api/admin/products?selected=true&page=1&limit=12')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.items.every((p: { isSelected: boolean }) => p.isSelected)).toBe(true);
    expect(res.body.data.items.some((p: { id: string }) => p.id === productId)).toBe(true);
  });

  it('قسم «كل المنتجات» يُحمَّل بلا ترشيح', async () => {
    const res = await api
      .get('/api/admin/products?page=1&limit=12')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data).toHaveProperty('hasMore');
  });

  it('[CRITICAL] المنتج المعطّل المرفوع كعرض يظهر للمسؤول ويغيب عن العام', async () => {
    const hidden = await seedProduct({ isActive: false, isOffer: true });

    const adminList = await api
      .get('/api/admin/products?offer=true&limit=50')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(adminList.body.data.items.some((p: { id: string }) => p.id === hidden)).toBe(true);

    // المسار العام يبقى كما هو: لا يكشف المعطّل. الإصلاح لم يوسّع ما يراه الجمهور.
    const publicList = await api.get('/api/catalog/products?offer=true&limit=50').expect(200);
    expect(publicList.body.data.items.some((p: { id: string }) => p.id === hidden)).toBe(false);
  });

  it('الصفحات تبقى صحيحة مع الترشيح', async () => {
    const res = await api
      .get('/api/admin/products?offer=true&page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.items.length).toBeLessThanOrEqual(1);
    expect(res.body.data.limit).toBe(1);
    expect(res.body.data.page).toBe(1);
  });

  it('قيمة ترشيح غير صالحة تُرفض لا تُتجاهل بصمت', async () => {
    // ٤٠٠ هي صيغة المشروع لفشل تحقق المدخلات (`parse` في `utils/zod.ts`)؛
    // ٤٢٢ محجوزة لتحقق طبقة الأعمال. المهم أن الترشيح المعطوب يُرفض بدل أن
    // تُعاد القائمة كاملةً وكأنها مرشَّحة.
    const res = await api
      .get('/api/admin/products?offer=maybe')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('صلاحية قائمة منتجات الإدارة', () => {
  it('بلا مصادقة → 401', async () => {
    await api.get('/api/admin/products?offer=true').expect(401);
  });

  it('[CRITICAL] زبون مصادَق → 403', async () => {
    await api
      .get('/api/admin/products?offer=true')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('توكن معطوب → 401', async () => {
    await api
      .get('/api/admin/products?offer=true')
      .set('Authorization', 'Bearer not-a-token')
      .expect(401);
  });
});

describe('تبديل حالة العرض/المختارة', () => {
  it('[CRITICAL] تبديل العَلَم وحده لا يمسّ الصور ولا الخيارات', async () => {
    // هذه هي القاعدة التي كانت اللوحة تلتفّ حولها: كانت تقرأ المنتج من
    // المسار العام ثم تُعيد إرسال صوره وخياراته مع العَلَم. مسار التعديل لا
    // يمسّ حقلاً غائباً أصلاً، فالالتفاف كان زائداً — ومكلفاً: يفشل على
    // المنتج المعطّل لأن المسار العام يعيد له 404.
    const id = await seedProduct({ isOffer: false });

    await api
      .patch(`/api/admin/products/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isOffer: true })
      .expect(200);

    const images = await db.query('SELECT url FROM product_images WHERE product_id = $1', [id]);
    const options = await db.query('SELECT name FROM product_options WHERE product_id = $1', [id]);
    expect(images.rows).toHaveLength(1);
    expect(options.rows).toHaveLength(1);

    const { rows } = await db.query<{ is_offer: boolean }>(
      'SELECT is_offer FROM products WHERE id = $1',
      [id],
    );
    expect(rows[0]!.is_offer).toBe(true);
  });

  it('[CRITICAL] يمكن إزالة العرض عن منتج معطّل', async () => {
    const id = await seedProduct({ isActive: false, isOffer: true });

    await api
      .patch(`/api/admin/products/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isOffer: false })
      .expect(200);

    const { rows } = await db.query<{ is_offer: boolean }>(
      'SELECT is_offer FROM products WHERE id = $1',
      [id],
    );
    expect(rows[0]!.is_offer).toBe(false);
  });

  it('زبون لا يستطيع تبديل العَلَم', async () => {
    await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ isOffer: false })
      .expect(403);
  });
});
