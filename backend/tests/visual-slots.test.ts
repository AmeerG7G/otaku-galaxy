import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import {
  api,
  createAdminUser,
  registerAndLogin,
  registerUploadedPhoto,
  seedTestCatalog,
} from './helpers.js';

/**
 * الرسوم المُدارة: فتحة بصرية ← صور ← تدوير ← ما يقرؤه التطبيق.
 *
 * الضمانة الجوهرية التي تحرسها هذه السويت: **الفتحة غير المضبوطة لا
 * تُرسَل**. غيابها هو ما يجعل التطبيق يعرض الأصل المضمَّن، فحذف المسؤول
 * لصورة لا يترك شاشةً فارغة عند الزبون.
 */
describe('فتحات الرسوم المُدارة', () => {
  let adminToken: string;
  let customer: { token: string; userId: string };
  let slotId: string;
  let slotKey: string;
  let urlA: string;
  let urlB: string;

  beforeAll(async () => {
    await seedTestCatalog();
    adminToken = await createAdminUser();
    customer = await registerAndLogin();
    slotKey = `test_slot_${Date.now()}`;
    urlA = await registerUploadedPhoto();
    urlB = await registerUploadedPhoto();
  });

  function admin(method: 'get' | 'post' | 'patch' | 'delete', path: string) {
    return api[method](path).set('Authorization', `Bearer ${adminToken}`);
  }

  async function published() {
    const res = await api.get('/api/catalog/visuals').expect(200);
    return res.body.data as {
      timezone: string;
      version: string;
      slots: {
        slotKey: string;
        rotationMode: string;
        currentUrl: string;
        urls: string[];
        validUntil: string | null;
      }[];
    };
  }

  const slotOf = (data: Awaited<ReturnType<typeof published>>, key: string) =>
    data.slots.find((slot) => slot.slotKey === key);

  async function publishedRaw() {
    const res = await api.get('/api/catalog/visuals').expect(200);
    return res.body.data as { version: string };
  }

  // ── إنشاء الفتحة ──

  it('ينشئ فتحة بصرية', async () => {
    const res = await admin('post', '/api/admin/visual-slots')
      .send({ slotKey, label: 'فتحة اختبار', rotationMode: 'fixed' })
      .expect(201);
    slotId = res.body.data.id;
    expect(res.body.data.slotKey).toBe(slotKey);
    expect(res.body.data.rotationMode).toBe('fixed');
    expect(res.body.data.images).toEqual([]);
  });

  it('[CRITICAL] الفتحة الفارغة لا تظهر للتطبيق إطلاقاً', async () => {
    // غيابها هو الإشارة: «استعمل الأصل المضمَّن». إرسالها بقائمة فارغة
    // يجعل التطبيق يميّز بين حالتين تعنيان عنده الشيء نفسه.
    expect(slotOf(await published(), slotKey)).toBeUndefined();
  });

  it('مفتاح مكرّر يُرفض', async () => {
    const res = await admin('post', '/api/admin/visual-slots').send({ slotKey });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_KEY_TAKEN');
  });

  it('مفتاح بصيغة لا يفهمها التطبيق يُرفض عند الحدود', async () => {
    // مفتاح فيه مسافة أو حرف عربي يُكتب بلا مشكلة ثم لا يطابقه أي عنصر
    // في التطبيق — فتحة تبدو مضبوطة ولا تظهر أبداً.
    for (const bad of ['فتحة', 'Cart Slot', 'ab', 'Cart', 'cart-slot']) {
      const res = await admin('post', '/api/admin/visual-slots').send({ slotKey: bad });
      expect(res.status).toBe(400);
    }
  });

  // ── الصور ──

  it('يضيف صورة فتظهر الفتحة للتطبيق', async () => {
    await admin('post', `/api/admin/visual-slots/${slotId}/images`)
      .send({ url: urlA })
      .expect(201);

    const slot = slotOf(await published(), slotKey);
    expect(slot).toBeDefined();
    expect(slot!.currentUrl).toBe(urlA);
    expect(slot!.urls).toEqual([urlA]);
  });

  it('صورة غير مرفوعة على الخادم تُرفض', async () => {
    const res = await admin('post', `/api/admin/visual-slots/${slotId}/images`).send({
      url: `${config.uploads.publicPath}/slot/2026/01/not-a-real-file.png`,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MEDIA_NOT_FOUND');
  });

  it('الصورة نفسها مرتين في الفتحة تُرفض', async () => {
    const res = await admin('post', `/api/admin/visual-slots/${slotId}/images`).send({
      url: urlA,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IMAGE_ALREADY_IN_SLOT');
  });

  it('تعطيل الصورة يُخرجها من إعداد التطبيق', async () => {
    const detail = await admin('get', '/api/admin/visual-slots').expect(200);
    const slot = (detail.body.data.items as { id: string; images: { id: string }[] }[]).find(
      (entry) => entry.id === slotId,
    )!;
    const imageId = slot.images[0]!.id;

    await admin('patch', `/api/admin/visual-slots/${slotId}/images/${imageId}`)
      .send({ isActive: false })
      .expect(200);

    // آخر صورة نشطة عُطّلت ← الفتحة تختفي ← التطبيق يعود للأصل المضمَّن.
    expect(slotOf(await published(), slotKey)).toBeUndefined();

    await admin('patch', `/api/admin/visual-slots/${slotId}/images/${imageId}`)
      .send({ isActive: true })
      .expect(200);
    expect(slotOf(await published(), slotKey)).toBeDefined();
  });

  it('لا يعدّل صورة تخصّ فتحة أخرى', async () => {
    const other = await admin('post', '/api/admin/visual-slots')
      .send({ slotKey: `other_slot_${Date.now()}` })
      .expect(201);

    const detail = await admin('get', '/api/admin/visual-slots').expect(200);
    const mine = (detail.body.data.items as { id: string; images: { id: string }[] }[]).find(
      (entry) => entry.id === slotId,
    )!;

    const res = await admin(
      'patch',
      `/api/admin/visual-slots/${other.body.data.id}/images/${mine.images[0]!.id}`,
    ).send({ isActive: false });
    expect(res.status).toBe(404);

    await admin('delete', `/api/admin/visual-slots/${other.body.data.id}`).expect(204);
  });

  // ── التدوير ──

  it('fixed يعيد الصورة الأولى دائماً وبلا انتهاء صلاحية', async () => {
    await admin('post', `/api/admin/visual-slots/${slotId}/images`)
      .send({ url: urlB })
      .expect(201);

    const slot = slotOf(await published(), slotKey)!;
    expect(slot.rotationMode).toBe('fixed');
    expect(slot.currentUrl).toBe(urlA);
    expect(slot.urls).toEqual([urlA, urlB]);
    expect(slot.validUntil).toBeNull();
  });

  it('daily يختار حتمياً حسب يوم المتجر ويعلن متى يتبدّل', async () => {
    await admin('patch', `/api/admin/visual-slots/${slotId}`)
      .send({ rotationMode: 'daily' })
      .expect(200);

    const { rows } = await db.query<{ day: string }>(
      `SELECT ((now() AT TIME ZONE $1)::date - DATE '1970-01-01')::text AS day`,
      [config.storeTimezone],
    );
    const expected = [urlA, urlB][Number(rows[0]!.day) % 2];

    const slot = slotOf(await published(), slotKey)!;
    expect(slot.currentUrl).toBe(expected);
    expect(slot.validUntil).not.toBeNull();
    expect(Number.isNaN(Date.parse(slot.validUntil!))).toBe(false);
    // ينتهي في المستقبل — منتصف ليل المتجر القادم لا لحظة عشوائية.
    expect(Date.parse(slot.validUntil!)).toBeGreaterThan(Date.now());
  });

  it('daily ثابت خلال اليوم نفسه — لا تبدّل بين نداءين', async () => {
    const first = slotOf(await published(), slotKey)!.currentUrl;
    for (let i = 0; i < 5; i += 1) {
      expect(slotOf(await published(), slotKey)!.currentUrl).toBe(first);
    }
  });

  it('daily بصورة واحدة يتصرّف كـfixed', async () => {
    const single = await admin('post', '/api/admin/visual-slots')
      .send({ slotKey: `single_${Date.now()}`, rotationMode: 'daily' })
      .expect(201);
    const key = single.body.data.slotKey as string;
    await admin('post', `/api/admin/visual-slots/${single.body.data.id}/images`)
      .send({ url: urlA })
      .expect(201);

    const slot = slotOf(await published(), key)!;
    expect(slot.currentUrl).toBe(urlA);

    await admin('delete', `/api/admin/visual-slots/${single.body.data.id}`).expect(204);
  });

  // ── الترتيب ──

  it('إعادة الترتيب تغيّر الصورة المختارة في fixed', async () => {
    await admin('patch', `/api/admin/visual-slots/${slotId}`)
      .send({ rotationMode: 'fixed' })
      .expect(200);

    const detail = await admin('get', '/api/admin/visual-slots').expect(200);
    const slot = (detail.body.data.items as { id: string; images: { id: string }[] }[]).find(
      (entry) => entry.id === slotId,
    )!;
    const reversed = [...slot.images].reverse().map((image) => image.id);

    await admin('patch', `/api/admin/visual-slots/${slotId}/images/reorder`)
      .send({ imageIds: reversed })
      .expect(200);

    expect(slotOf(await published(), slotKey)!.currentUrl).toBe(urlB);
  });

  it('ترتيب ناقص يُرفض بدل حفظ ترتيب نصفه مجهول', async () => {
    const res = await admin('patch', `/api/admin/visual-slots/${slotId}/images/reorder`).send({
      imageIds: ['00000000-0000-0000-0000-000000000000'],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REORDER_MISMATCH');
  });

  // ── تعطيل الفتحة وحذفها ──

  it('تعطيل الفتحة يُخفيها عن التطبيق ويُبقيها في اللوحة', async () => {
    await admin('patch', `/api/admin/visual-slots/${slotId}`)
      .send({ isActive: false })
      .expect(200);
    expect(slotOf(await published(), slotKey)).toBeUndefined();

    const list = await admin('get', '/api/admin/visual-slots').expect(200);
    expect(
      (list.body.data.items as { id: string }[]).some((entry) => entry.id === slotId),
    ).toBe(true);

    await admin('patch', `/api/admin/visual-slots/${slotId}`)
      .send({ isActive: true })
      .expect(200);
  });

  it('حذف الصورة يزيلها من الإعداد', async () => {
    const detail = await admin('get', '/api/admin/visual-slots').expect(200);
    const slot = (detail.body.data.items as { id: string; images: { id: string; url: string }[] }[])
      .find((entry) => entry.id === slotId)!;
    const target = slot.images.find((image) => image.url === urlB)!;

    await admin('delete', `/api/admin/visual-slots/${slotId}/images/${target.id}`).expect(200);
    const after = slotOf(await published(), slotKey)!;
    expect(after.urls).not.toContain(urlB);
    expect(after.urls).toContain(urlA);
  });

  // ── الصلاحيات ──

  it('العميل يقرأ الإعداد ولا يعدّله', async () => {
    await api.get('/api/catalog/visuals').expect(200);

    const asCustomer = (method: 'post' | 'patch' | 'delete', path: string) =>
      api[method](path).set('Authorization', `Bearer ${customer.token}`);

    expect((await asCustomer('post', '/api/admin/visual-slots').send({ slotKey: 'x_y_z' })).status)
      .toBe(403);
    expect((await asCustomer('patch', `/api/admin/visual-slots/${slotId}`).send({ isActive: false })).status)
      .toBe(403);
    expect((await asCustomer('delete', `/api/admin/visual-slots/${slotId}`)).status).toBe(403);
    expect(
      (await asCustomer('post', `/api/admin/visual-slots/${slotId}/images`).send({ url: urlA }))
        .status,
    ).toBe(403);
  });

  it('بلا توكن → 401 على كل مسارات الإدارة', async () => {
    expect((await api.get('/api/admin/visual-slots')).status).toBe(401);
    expect((await api.post('/api/admin/visual-slots').send({ slotKey: 'a_b_c' })).status).toBe(401);
    expect((await api.delete(`/api/admin/visual-slots/${slotId}`)).status).toBe(401);
  });

  it('العميل لا يرفع صورة بغرض «slot»', async () => {
    const res = await api
      .post('/api/uploads')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('purpose', 'slot')
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
        filename: 'x.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(403);
  });

  it('حذف الفتحة يزيلها وصورها من الإعداد', async () => {
    await admin('delete', `/api/admin/visual-slots/${slotId}`).expect(204);
    expect(slotOf(await published(), slotKey)).toBeUndefined();

    const { rows } = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM visual_slot_images WHERE slot_id = $1',
      [slotId],
    );
    expect(Number(rows[0]!.total)).toBe(0);
  });

  it('الاستجابة العامة تحمل منطقة المتجر الزمنية', async () => {
    expect((await published()).timezone).toBe(config.storeTimezone);
  });
});

/**
 * دلالات الاستبدال — سويت مستقلة بفتحتها الخاصة.
 *
 * [CRITICAL] تحرس العطل الذي أبلغ عنه صاحب المتجر: كانت الإضافة تضع الصورة
 * في **آخر** القائمة، والنمط الثابت يعرض **أولها**. فيرفع بديلاً، ويراه في
 * اللوحة، ويبقى التطبيق يعرض القديمة — واللوحة تقول إن الصورة تغيّرت بينما
 * لم يتغيّر شيء. لا خطأ، ولا سجل، ولا شيء يُلاحَظ إلا التناقض.
 */
describe('استبدال صورة الفتحة', () => {
  let adminToken: string;
  let slotId: string;
  let slotKey: string;
  let first: string;

  beforeAll(async () => {
    await seedTestCatalog();
    adminToken = await createAdminUser();
    slotKey = `replace_slot_${Date.now()}`;
    first = await registerUploadedPhoto();

    const created = await api
      .post('/api/admin/visual-slots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slotKey, label: 'فتحة استبدال', rotationMode: 'fixed' })
      .expect(201);
    slotId = created.body.data.id;

    await api
      .post(`/api/admin/visual-slots/${slotId}/images`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: first })
      .expect(201);
  });

  // الفتحة التجريبية تُحذف: فحص تطابق الفهرس يرفض أي صفّ بلا مفتاح في
  // كود فلاتر — وهو محقّ، فسويت لا تنظّف بعدها تترك فتحةً وهمية في اللوحة.
  afterAll(async () => {
    await api
      .delete(`/api/admin/visual-slots/${slotId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  });

  async function payload() {
    const res = await api.get('/api/catalog/visuals').expect(200);
    return res.body.data as {
      version: string;
      slots: { slotKey: string; currentUrl: string }[];
    };
  }

  const currentOf = (data: Awaited<ReturnType<typeof payload>>) =>
    data.slots.find((slot) => slot.slotKey === slotKey)?.currentUrl;

  async function slotDetail() {
    const res = await api
      .get('/api/admin/visual-slots')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    return (res.body.data.items as {
      id: string;
      images: { url: string; isActive: boolean }[];
    }[]).find((entry) => entry.id === slotId)!;
  }

  it('الإضافة وحدها لا تُبدّل المعروض — وهو أصل العطل', async () => {
    const appended = await registerUploadedPhoto();
    await api
      .post(`/api/admin/visual-slots/${slotId}/images`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: appended, mode: 'append' })
      .expect(201);

    // سلوك مقصود: الإضافة تبني مجموعة تدوير ولا تدّعي استبدالاً.
    expect(currentOf(await payload())).toBe(first);
  });

  it('الاستبدال يجعل الجديدة هي المعروضة فوراً', async () => {
    const fresh = await registerUploadedPhoto();
    const res = await api
      .post(`/api/admin/visual-slots/${slotId}/images`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: fresh, mode: 'replace' })
      .expect(201);
    expect(res.body.message).toContain('استُبدلت');
    expect(currentOf(await payload())).toBe(fresh);
  });

  it('الاستبدال يوقف الصور القائمة ولا يحذفها', async () => {
    const slot = await slotDetail();
    // الجديدة وحدها نشطة، والقديمة موجودة موقوفة: التراجع ممكن بضغطة،
    // والملف على القرص لم يُمَس.
    expect(slot.images.filter((image) => image.isActive)).toHaveLength(1);
    expect(slot.images.length).toBeGreaterThan(1);
    expect(slot.images.some((image) => image.url === first && !image.isActive)).toBe(true);
  });

  it('البصمة تتغيّر مع كل تعديل يمسّ ما يراه التطبيق', async () => {
    const before = (await payload()).version;
    const another = await registerUploadedPhoto();
    await api
      .post(`/api/admin/visual-slots/${slotId}/images`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: another, mode: 'replace' })
      .expect(201);
    const after = (await payload()).version;
    expect(after).not.toBe(before);
    expect(after).toBeTruthy();
  });

  it('الاستبدال المتكرّر لا يترك أكثر من صورة نشطة واحدة', async () => {
    for (let i = 0; i < 3; i += 1) {
      const url = await registerUploadedPhoto();
      await api
        .post(`/api/admin/visual-slots/${slotId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ url, mode: 'replace' })
        .expect(201);
      const slot = await slotDetail();
      expect(slot.images.filter((image) => image.isActive)).toHaveLength(1);
    }
  });
});
