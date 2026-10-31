import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * ما تمثّله خيارات المنتج (090، STEP 77): لون أو تصميم أو مقاس.
 *
 * نظام الخيارات نفسه (087) — صورةٌ ومخزونٌ لكل خيار — يمثّل الآن تصميماً
 * (حقيبة «سوكونا» و«غوكو») أو مقاساً، والنوع يسمّي المحدّد للزبون. شراء خيارٍ
 * يمسّ مخزونه وحده، والطلب يحفظ النوع لحظته فلا يُعاد تسميته لاحقاً.
 */
const TAG = 'VKIND';
const IMG = (name: string) => `/uploads/product/2026/10/${name}.png`;

let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
let adminToken: string;
const admin = () => ({ Authorization: `Bearer ${adminToken}` });
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  catalog = await seedTestCatalog();
  adminToken = await createAdminUser();
});

afterAll(async () => {
  const ours = `(SELECT id FROM products WHERE name LIKE '${TAG} %')`;
  await db.query(`DELETE FROM order_items WHERE product_id IN ${ours}`);
  await db.query(`DELETE FROM cart_items WHERE product_id IN ${ours}`);
  await purgeTestUsers();
  await db.query(`DELETE FROM products WHERE name LIKE '${TAG} %'`);
});

let counter = 0;
async function backpack(body: Record<string, unknown> = {}) {
  counter += 1;
  const res = await api
    .post('/api/admin/products')
    .set(admin())
    .send({
      nameAr: `${TAG} حقيبة ${counter}`,
      descriptionAr: 'وصف',
      price: 20000,
      categoryId: catalog.categoryId,
      images: [IMG('general-1'), IMG('general-2')],
      variants: [
        { colorName: 'سوكونا', imageUrl: IMG('sukuna'), stock: 4 },
        { colorName: 'غوكو', imageUrl: IMG('goku'), stock: 6 },
      ],
      ...body,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const detail = await api.get(`/api/catalog/products/${res.body.data.id}`).expect(200);
  return detail.body.data as {
    id: string;
    variantKind: string;
    stock: number;
    images: string[];
    variants: Array<{ id: string; colorName: string; stock: number; imageUrl: string }>;
  };
}

async function variantStocks(productId: string) {
  const { rows } = await db.query<{ color_name: string; stock: number }>(
    'SELECT color_name, stock FROM product_variants WHERE product_id = $1 ORDER BY sort_order',
    [productId],
  );
  return Object.fromEntries(rows.map((row) => [row.color_name, row.stock]));
}

describe('نوع خيارات المنتج', () => {
  it('الافتراضي لون — المنتجات القائمة لا تتغيّر', async () => {
    const product = await backpack();
    expect(product.variantKind).toBe('color');
  });

  it('تصميم: النوع يصل للزبون، والصور العامة وصورة كل خيار في المنتج نفسه', async () => {
    const product = await backpack({ variantKind: 'design' });
    expect(product.variantKind).toBe('design');
    expect(product.images).toEqual([IMG('general-1'), IMG('general-2')]);
    expect(product.variants.map((v) => v.imageUrl)).toEqual([IMG('sukuna'), IMG('goku')]);
  });

  it('نوعٌ غير معروف مرفوض', async () => {
    const res = await api
      .post('/api/admin/products')
      .set(admin())
      .send({
        nameAr: `${TAG} مرفوض`,
        descriptionAr: 'وصف',
        price: 1000,
        categoryId: catalog.categoryId,
        stock: 1,
        variantKind: 'flavour',
      });
    expect(res.status).toBe(400);
  });

  it('[CRITICAL] شراء خيار تصميم يمسّ مخزونه وحده، والطلب يحفظ النوع لحظته', async () => {
    const product = await backpack({ variantKind: 'design' });
    const sukuna = product.variants.find((v) => v.colorName === 'سوكونا')!;
    const customer = await registerAndLogin();

    await api
      .post('/api/cart')
      .set(bearer(customer.token))
      .send({ productId: product.id, variantId: sukuna.id, quantity: 2 })
      .expect(200);
    const cart = await api.get('/api/cart').set(bearer(customer.token)).expect(200);
    const line = (cart.body.data.items as Array<{ variantId: string; variantKind: string }>).find(
      (item) => item.variantId === sukuna.id,
    )!;
    expect(line.variantKind).toBe('design');

    const order = await api
      .post('/api/orders')
      .set(bearer(customer.token))
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد', phone: '07733333333' });
    expect(order.status, JSON.stringify(order.body)).toBe(201);
    expect(order.body.data.items[0].variantKind).toBe('design');

    // المخزون يُخصم عند قبول الإدارة (BR-20) — من خيار «سوكونا» وحده.
    await api
      .patch(`/api/admin/orders/${order.body.data.id}/status`)
      .set(admin())
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);
    expect(await variantStocks(product.id)).toEqual({ سوكونا: 2, غوكو: 6 });

    // تغيير النوع لاحقاً لا يُعيد تسمية الطلب القائم.
    await api
      .patch(`/api/admin/products/${product.id}`)
      .set(admin())
      .send({ variantKind: 'size' })
      .expect(200);
    const after = await api
      .get(`/api/orders/${order.body.data.id}`)
      .set(bearer(customer.token))
      .expect(200);
    expect(after.body.data.items[0].variantKind).toBe('design');
    const detail = await api.get(`/api/catalog/products/${product.id}`).expect(200);
    expect(detail.body.data.variantKind).toBe('size');
  });

  it('سطر طلبٍ أقدم من العمود (NULL) يُقرأ لوناً، وسطرٌ بلا خيار بلا نوع', async () => {
    const product = await backpack();
    const red = product.variants[0]!;
    const customer = await registerAndLogin();
    await api
      .post('/api/cart')
      .set(bearer(customer.token))
      .send({ productId: product.id, variantId: red.id, quantity: 1 })
      .expect(200);
    const order = await api
      .post('/api/orders')
      .set(bearer(customer.token))
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد', phone: '07733333333' })
      .expect(201);
    await db.query('UPDATE order_items SET variant_kind = NULL WHERE order_id = $1', [
      order.body.data.id,
    ]);
    const legacy = await api
      .get(`/api/orders/${order.body.data.id}`)
      .set(bearer(customer.token))
      .expect(200);
    expect(legacy.body.data.items[0].variantKind).toBe('color');

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock)
       VALUES ($1, 'وصف', 5000, $2, 5) RETURNING id`,
      [`${TAG} بلا خيارات`, catalog.categoryId],
    );
    const plain = await registerAndLogin();
    await api
      .post('/api/cart')
      .set(bearer(plain.token))
      .send({ productId: rows[0]!.id, quantity: 1 })
      .expect(200);
    const cart = await api.get('/api/cart').set(bearer(plain.token)).expect(200);
    expect(cart.body.data.items[0].variantKind).toBeNull();
  });
});
