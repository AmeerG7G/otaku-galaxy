// [REGRESSION GUARD] إرسالان متزامنان لسلةٍ واحدة ينتجان طلباً واحداً.
//
// لم يكن في `POST /api/orders` قفلٌ على السلة: كل إرسال يقرأ عناصر السلة
// ثم يُفرغها داخل معاملته. الإرسال المتتابع كان يفشل بـ«العربة فارغة»، لكن
// إرسالين متزامنين (نقرتان سريعتان أو إعادة إرسال شبكية) كانا يقرآن السلة
// نفسها معاً ولا يفصل بينهما إلا قفل صفوف المنتجات — فإن كفى المخزون خرج
// طلبان بالمبلغ نفسه.

import { beforeAll, describe, expect, it } from 'vitest';
import { api, registerAndLogin, seedTestCatalog } from './helpers.js';

describe('[CRITICAL] إرسالان متزامنان للطلب', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
  });

  it('سلةٌ واحدة تصير طلباً واحداً مهما تزامن الإرسال', async () => {
    const { token } = await registerAndLogin();
    const auth = `Bearer ${token}`;
    const [productId] = catalog.productIds;

    await api.post('/api/cart').set('Authorization', auth).send({ productId, quantity: 1 }).expect(200);

    const body = {
      governorateId: catalog.governorateId,
      fullAddress: 'بغداد، الكرادة، شارع ٦٢، قرب صيدلية النور',
      phone: '07712345678',
    };
    const submit = () => api.post('/api/orders').set('Authorization', auth).send(body);
    const results = await Promise.all([submit(), submit(), submit()]);

    const created = results.filter((r) => r.status === 201);
    expect(created.length, 'طلبٌ واحد فقط يُنشأ').toBe(1);
    for (const r of results) {
      if (r.status !== 201) {
        expect([400, 409]).toContain(r.status);
      }
    }

    const orders = await api.get('/api/orders').set('Authorization', auth).expect(200);
    expect(orders.body.data.total).toBe(1);
  });
});
