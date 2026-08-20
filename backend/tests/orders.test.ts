import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, registerAndLogin, seedTestCatalog } from './helpers.js';

describe('cart + order flow', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  it('favorites: add → list → remove', async () => {
    const { token } = await registerAndLogin();
    const [productId] = catalog.productIds;

    const add = await api
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId });
    expect(add.status).toBe(200);

    const list = await api.get('/api/favorites').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.items[0].id).toBe(productId);

    const removed = await api
      .delete(`/api/favorites/${productId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.favorite).toBe(false);
  });

  it('cart: add → update quantity → order created with totals → cart cleared', async () => {
    const { token } = await registerAndLogin();
    const [productId] = catalog.productIds;

    const add = await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 2 });
    expect(add.status).toBe(200);
    expect(add.body.data.item.lineTotal).toBe(30000);

    const withoutLogin = await api.get('/api/cart');
    expect(withoutLogin.status).toBe(401);

    const update = await api
      .patch(`/api/cart/${add.body.data.item.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 3 })
      .expect(200);
    const line = update.body.data.items.find((i: { id: string }) => i.id === add.body.data.item.id);
    expect(line.quantity).toBe(3);

    const order = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ governorateId: catalog.governorateId, fullAddress: 'شارع حيفا، بغداد', phone: '07711111111' });
    expect(order.status).toBe(201);
    expect(order.body.data.status).toBe('PENDING_ADMIN_CONFIRMATION');
    expect(order.body.data.total).toBe(3 * 15000 + 4000);
    expect(order.body.data.items[0].productName).toBe('تيشيرت اختبار A');

    const cart = await api.get('/api/cart').set('Authorization', `Bearer ${token}`).expect(200);
    expect(cart.body.data.items.length).toBe(0);

    const orders = await api.get('/api/orders').set('Authorization', `Bearer ${token}`).expect(200);
    expect(orders.body.data.total).toBe(1);
    expect(orders.body.data.statusCounts.PENDING_ADMIN_CONFIRMATION).toBe(1);
  });

  it('rejects order with governorate that does not exist', async () => {
    const { token } = await registerAndLogin();
    const [productId] = catalog.productIds;
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    const res = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        governorateId: '00000000-0000-0000-0000-000000000000',
        fullAddress: 'العنوان الكامل',
        phone: '07722222222',
      });
    expect(res.status).toBe(400);
  });

  it('admin walks order through statuses and rejects invalid transition', async () => {
    const { token } = await registerAndLogin();
    const [productId] = catalog.productIds;
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    const order = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07733333333' })
      .expect(201);
    const orderId = order.body.data.id;

    const invalid = await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' });
    expect(invalid.status).toBe(409);

    const confirmed = await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);
    expect(confirmed.body.data.status).toBe('CONFIRMED');

    const customerCannotAdmin = await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PREPARING' });
    expect(customerCannotAdmin.status).toBe(403);

    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PREPARING' })
      .expect(200);
    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);
    const completed = await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' });
    expect(completed.status).toBe(200);
  });
});