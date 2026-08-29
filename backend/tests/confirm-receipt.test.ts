import { beforeAll, describe, expect, it } from 'vitest';
import { api, createAdminUser, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * تأكيد العميل استلام طلبه — يمرّ بنفس مسار الحالة الموحّد الذي تستخدمه
 * الإدارة، فالنقاط والإشعار وسجل الحالة لا تنطلق مرتين.
 */
describe('customer confirms receipt', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  /** ينشئ طلباً ويوصله إلى الحالة المطلوبة عبر مسار الإدارة. */
  async function orderAt(status: 'PENDING_ADMIN_CONFIRMATION' | 'OUT_FOR_DELIVERY') {
    const user = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId: catalog.productIds[0], quantity: 1 })
      .expect(200);
    const created = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        governorateId: catalog.governorateId,
        fullAddress: 'بغداد، الكرادة',
        phone: '07744444444',
      })
      .expect(201);
    const orderId = created.body.data.id as string;

    if (status === 'OUT_FOR_DELIVERY') {
      for (const next of ['CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY']) {
        await api
          .patch(`/api/admin/orders/${orderId}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: next })
          .expect(200);
      }
    }
    return { user, orderId };
  }

  it('completes the order and awards receipt points exactly once', async () => {
    const { user, orderId } = await orderAt('OUT_FOR_DELIVERY');

    const before = await api
      .get('/api/points')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(before.body.data.balance).toBe(0);

    const confirmed = await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(confirmed.body.data.status).toBe('COMPLETED');

    const after = await api
      .get('/api/points')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(after.body.data.balance).toBe(20);
    expect(after.body.data.activity).toHaveLength(1);
  });

  it('rejects a second confirmation', async () => {
    const { user, orderId } = await orderAt('OUT_FOR_DELIVERY');
    await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const repeat = await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(repeat.status).toBe(409);
    expect(repeat.body.error.code).toBe('ALREADY_CONFIRMED');

    // ولا تُمنح نقاط إضافية بعد المحاولة الفاشلة.
    const points = await api
      .get('/api/points')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(points.body.data.balance).toBe(20);
  });

  it('rejects confirmation before the order is out for delivery', async () => {
    const { user, orderId } = await orderAt('PENDING_ADMIN_CONFIRMATION');

    const res = await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_OUT_FOR_DELIVERY');
  });

  it('does not let another customer confirm someone else\'s order', async () => {
    const { orderId } = await orderAt('OUT_FOR_DELIVERY');
    const stranger = await registerAndLogin();

    const res = await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${stranger.token}`);
    // ‎404 لا 403: لا نكشف وجود طلبات الآخرين.
    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const { orderId } = await orderAt('OUT_FOR_DELIVERY');
    const res = await api.post(`/api/orders/${orderId}/confirm-receipt`);
    expect(res.status).toBe(401);
  });

  it('notifies the customer once about the completed order', async () => {
    const { user, orderId } = await orderAt('OUT_FOR_DELIVERY');
    await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const notifications = await api
      .get('/api/notifications')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const receipts = (
      notifications.body.data.items as Array<{ type: string; orderId: string | null }>
    ).filter((n) => n.type === 'receiptReminder' && n.orderId === orderId);
    expect(receipts).toHaveLength(1);
  });

  it('leaves the admin transition path working', async () => {
    const { user, orderId } = await orderAt('OUT_FOR_DELIVERY');

    const byAdmin = await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect(byAdmin.body.data.status).toBe('COMPLETED');

    // وبعد إكمال الإدارة، تأكيد العميل يُرفض كتكرار لا كخطأ حالة.
    const res = await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_CONFIRMED');

    const points = await api
      .get('/api/points')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(points.body.data.balance).toBe(20);
  });
});
