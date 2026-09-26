import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import {
  api,
  createAdminUser,
  registerAndLogin,
  registerUploadedPhoto,
  registerUploadedSlotImage,
} from './helpers.js';

/**
 * الرسوم المُدارة: موضعٌ واحد = فتحةٌ واحدة = صورةٌ دائمة واحدة.
 *
 * [PRODUCT] قرار 2026-09-20 (الهجرة ٠٥٤): لا تدوير ولا مجموعة صور ولا إيقاف.
 * الفتحة تحمل صورةً دائمة واحدة أو لا شيء؛ والمسؤول يستبدلها أو يزيلها فقط.
 * (الصورة المؤقّتة فوقها — الهجرة ٠٥٥ — لها سويتها: `visual-temporary-image`.)
 *
 * الضمانة الجوهرية التي تحرسها هذه السويت بقيت كما كانت: **الفتحة بلا
 * صورة لا تُرسَل**. غيابها هو ما يجعل التطبيق يعرض الأصل المضمَّن، فإزالة
 * المسؤول لصورةٍ لا تترك شاشةً فارغة عند الزبون.
 *
 * الفتحة الاختبارية تُزرع بـSQL مباشرة (لا مسار إنشاءٍ من اللوحة بعد الآن)
 * وتُحذف في النهاية: فحص تطابق الفهرس يرفض أي صفّ بلا مفتاح في كود فلاتر.
 */
describe('فتحات الرسوم — صورة دائمة واحدة', () => {
  let adminToken: string;
  let customer: { token: string; userId: string };
  let slotId: string;
  let slotKey: string;
  let urlA: string;
  let urlB: string;

  beforeAll(async () => {
    adminToken = await createAdminUser();
    customer = await registerAndLogin();
    slotKey = `zz_test_slot_${Date.now()}`;
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO visual_slots (slot_key, label, location, group_key)
       VALUES ($1, 'فتحة اختبار', 'موضع اختبار', 'other') RETURNING id`,
      [slotKey],
    );
    slotId = rows[0]!.id;
    urlA = await registerUploadedSlotImage();
    urlB = await registerUploadedSlotImage();
  });

  afterAll(async () => {
    await db.query('DELETE FROM visual_slots WHERE id = $1', [slotId]);
  });

  function admin(method: 'get' | 'put' | 'post' | 'patch' | 'delete', path: string) {
    return api[method](path).set('Authorization', `Bearer ${adminToken}`);
  }

  async function published() {
    const res = await api.get('/api/catalog/visuals').expect(200);
    return res.body.data as {
      version: string;
      slots: { slotKey: string; currentUrl: string }[];
    };
  }

  const slotOf = (data: Awaited<ReturnType<typeof published>>, key: string) =>
    data.slots.find((slot) => slot.slotKey === key);

  async function adminSlot() {
    const res = await admin('get', '/api/admin/visual-slots').expect(200);
    return (res.body.data.items as { id: string; imageUrl: string | null }[]).find(
      (item) => item.id === slotId,
    )!;
  }

  // ── المخطّط ──

  it('[CRITICAL] لا جدول صور ولا أعمدة تدوير أو إيقاف — الصورة في صفّ الفتحة', async () => {
    const { rows: tables } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'visual_slot_images'`,
    );
    expect(tables).toEqual([]);

    const { rows: columns } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'visual_slots'
        ORDER BY column_name`,
    );
    const names = columns.map((c) => c.column_name);
    expect(names).toContain('image_url');
    expect(names).toContain('media_id');
    expect(names).not.toContain('rotation_mode');
    expect(names).not.toContain('is_active');
  });

  it('مرجع الوسائط في صفّ الفتحة لا يحذف الملف ولا يُحذف بحذفه (ON DELETE SET NULL)', async () => {
    const { rows } = await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'visual_slots'::regclass AND contype = 'f'`,
    );
    expect(rows.map((r) => r.def).join(' ')).toMatch(/media_files\(id\) ON DELETE SET NULL/);
  });

  // ── الحالة الابتدائية ──

  it('[CRITICAL] الفتحة بلا صورة لا تظهر للتطبيق إطلاقاً، وتظهر في اللوحة بلا صورة', async () => {
    expect(slotOf(await published(), slotKey)).toBeUndefined();
    expect((await adminSlot()).imageUrl).toBeNull();
  });

  // ── الاستبدال ──

  it('وضع الصورة يُظهر الفتحة للتطبيق بالصورة نفسها التي تراها اللوحة', async () => {
    const res = await admin('put', `/api/admin/visual-slots/${slotId}/image`)
      .send({ url: urlA })
      .expect(200);
    expect(res.body.data.imageUrl).toBe(urlA);
    expect(res.body.message).toContain('استُبدلت');

    expect(slotOf(await published(), slotKey)!.currentUrl).toBe(urlA);
    expect((await adminSlot()).imageUrl).toBe(urlA);
  });

  it('[CRITICAL] الاستبدال يحلّ محلّ السابقة — صورةٌ واحدة لا قائمة، ولا أثر للقديمة', async () => {
    await admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url: urlB }).expect(200);
    const data = await published();
    expect(slotOf(data, slotKey)!.currentUrl).toBe(urlB);
    expect(JSON.stringify(data)).not.toContain(urlA);
    expect((await adminSlot()).imageUrl).toBe(urlB);
  });

  it('الردّ العام لا يحمل حقول التدوير القديمة', async () => {
    const data = await published();
    const slot = slotOf(data, slotKey) as Record<string, unknown>;
    expect(Object.keys(slot).sort()).toEqual(['currentUrl', 'slotKey']);
    expect(data).not.toHaveProperty('timezone');
  });

  it('وضع الصورة نفسها مرة أخرى يعمل بلا خطأ ولا يغيّر شيئاً', async () => {
    const before = (await published()).version;
    await admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url: urlB }).expect(200);
    expect((await published()).version).toBe(before);
  });

  // ── البصمة ──

  it('[CRITICAL] البصمة بصمةُ محتوى: تتغيّر مع ما يراه الزبون وتعود مع عودته', async () => {
    const withB = (await published()).version;
    await admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url: urlA }).expect(200);
    const withA = (await published()).version;
    expect(withA).not.toBe(withB);
    await admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url: urlB }).expect(200);
    expect((await published()).version).toBe(withB);
  });

  // ── ما يُرفض ──

  it('[SECURITY] صورةٌ غير مرفوعة على الخادم تُرفض', async () => {
    const res = await admin('put', `/api/admin/visual-slots/${slotId}/image`).send({
      url: `${config.uploads.publicPath}/slot/2026/01/not-a-real-file.png`,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MEDIA_NOT_FOUND');
    expect(slotOf(await published(), slotKey)!.currentUrl).toBe(urlB);
  });

  it('[SECURITY] رابطٌ خارجي يُرفض — لا صورة لزبائن المتجر من خادمٍ لا نملكه', async () => {
    for (const url of ['https://cdn.example.com/x.png', 'http://evil.example/x.png', '//cdn/x.png']) {
      const res = await admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url });
      expect(res.status, url).toBe(400);
    }
    expect(slotOf(await published(), slotKey)!.currentUrl).toBe(urlB);
  });

  it('[SECURITY] صورةُ زبون (تقييم) لا تُنقل إلى واجهة المتجر بمعرّفها', async () => {
    const reviewPhoto = await registerUploadedPhoto(customer.userId);
    const res = await admin('put', `/api/admin/visual-slots/${slotId}/image`).send({
      url: reviewPhoto,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MEDIA_NOT_SLOT_UPLOAD');
    expect(slotOf(await published(), slotKey)!.currentUrl).toBe(urlB);
  });

  it('مسارُ تجاوزٍ في المرجع يُرفض عند الحدود', async () => {
    for (const url of ['/uploads/../.env', '/uploads/slot/../../package.json', '']) {
      const res = await admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url });
      expect(res.status, url).toBe(400);
    }
  });

  it('معرّف فتحة مجهول → 404، ومعرّف مشوَّه → 400', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await admin('put', `/api/admin/visual-slots/${missing}/image`).send({ url: urlA })).status).toBe(404);
    expect((await admin('delete', `/api/admin/visual-slots/${missing}/image`)).status).toBe(404);
    expect((await admin('put', '/api/admin/visual-slots/not-a-uuid/image').send({ url: urlA })).status).toBe(400);
  });

  it('حقول التدوير القديمة تُهمَل ولا تُعيد سلوكاً', async () => {
    const res = await admin('put', `/api/admin/visual-slots/${slotId}/image`)
      .send({ url: urlB, mode: 'append', rotationMode: 'daily', sortOrder: 5, isActive: false })
      .expect(200);
    expect(res.body.data).not.toHaveProperty('rotationMode');
    expect(res.body.data).not.toHaveProperty('images');
    expect(res.body.data).not.toHaveProperty('isActive');
    expect(slotOf(await published(), slotKey)!.currentUrl).toBe(urlB);
  });

  // ── مسارات التدوير والإنشاء أُزيلت ──

  it('[CRITICAL] لا إنشاء ولا حذف فتحات من اللوحة، ولا قوائم صور — المسارات القديمة غائبة', async () => {
    const gone: Array<['post' | 'patch' | 'delete', string, object?]> = [
      ['post', '/api/admin/visual-slots', { slotKey: 'x_y_z' }],
      ['patch', `/api/admin/visual-slots/${slotId}`, { isActive: false }],
      ['delete', `/api/admin/visual-slots/${slotId}`],
      ['post', `/api/admin/visual-slots/${slotId}/images`, { url: urlA }],
      ['patch', `/api/admin/visual-slots/${slotId}/images/reorder`, { imageIds: [] }],
      ['patch', `/api/admin/visual-slots/${slotId}/images/${slotId}`, { isActive: false }],
      ['delete', `/api/admin/visual-slots/${slotId}/images/${slotId}`],
    ];
    for (const [method, path, body] of gone) {
      const res = await admin(method, path).send(body ?? {});
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    // والفتحة ما تزال كما كانت.
    expect(slotOf(await published(), slotKey)!.currentUrl).toBe(urlB);
    expect(await db.query('SELECT 1 FROM visual_slots WHERE id = $1', [slotId]).then((r) => r.rowCount)).toBe(1);
  });

  // ── السباق ──

  it('استبدالان متزامنان: كلاهما ينجح، والفتحة تنتهي بصورةٍ واحدة منهما', async () => {
    const [a, b] = await Promise.all([
      admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url: urlA }),
      admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url: urlB }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const current = slotOf(await published(), slotKey)!.currentUrl;
    expect([urlA, urlB]).toContain(current);
    const { rows } = await db.query<{ image_url: string }>(
      'SELECT image_url FROM visual_slots WHERE id = $1',
      [slotId],
    );
    expect(rows[0]!.image_url).toBe(current);
  });

  // ── الصلاحيات ──

  it('[SECURITY] العميل يقرأ الإعداد ولا يعدّله', async () => {
    await api.get('/api/catalog/visuals').expect(200);
    const asCustomer = (method: 'put' | 'delete', path: string) =>
      api[method](path).set('Authorization', `Bearer ${customer.token}`);
    expect((await asCustomer('put', `/api/admin/visual-slots/${slotId}/image`).send({ url: urlA })).status).toBe(403);
    expect((await asCustomer('delete', `/api/admin/visual-slots/${slotId}/image`)).status).toBe(403);
    expect(
      (await asCustomer('put', `/api/admin/visual-slots/${slotId}/temporary-image`).send({
        url: urlA,
        until: new Date(Date.now() + 3_600_000).toISOString(),
      })).status,
    ).toBe(403);
    expect((await asCustomer('delete', `/api/admin/visual-slots/${slotId}/temporary-image`)).status).toBe(403);
  });

  it('[SECURITY] بلا توكن → 401 على كل مسارات الإدارة', async () => {
    expect((await api.get('/api/admin/visual-slots')).status).toBe(401);
    expect((await api.put(`/api/admin/visual-slots/${slotId}/image`).send({ url: urlA })).status).toBe(401);
    expect((await api.delete(`/api/admin/visual-slots/${slotId}/image`)).status).toBe(401);
    expect((await api.put(`/api/admin/visual-slots/${slotId}/temporary-image`).send({ url: urlA })).status).toBe(401);
    expect((await api.delete(`/api/admin/visual-slots/${slotId}/temporary-image`)).status).toBe(401);
  });

  it('[SECURITY] العميل لا يرفع صورة بغرض «slot»', async () => {
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

  // ── الإزالة ──

  it('[CRITICAL] إزالة الصورة تُخفي الفتحة عن التطبيق، وتبقي الفتحة وملفَّها وسجلَّ وسائطها', async () => {
    const before = (await published()).version;
    const res = await admin('delete', `/api/admin/visual-slots/${slotId}/image`).expect(200);
    expect(res.body.data.imageUrl).toBeNull();

    expect(slotOf(await published(), slotKey)).toBeUndefined();
    expect((await published()).version).not.toBe(before);
    expect((await adminSlot()).imageUrl).toBeNull();
    // سجلّا الوسائط باقيان — الإزالة تفكّ الربط ولا تحذف.
    const { rows } = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM media_files WHERE url = ANY($1)',
      [[urlA, urlB]],
    );
    expect(Number(rows[0]!.total)).toBe(2);
  });

  it('إزالةٌ ثانية لا تُخطئ — الفتحة ما تزال بلا صورة', async () => {
    await admin('delete', `/api/admin/visual-slots/${slotId}/image`).expect(200);
    expect(slotOf(await published(), slotKey)).toBeUndefined();
  });

  it('حذف سجلّ الوسائط لا يُسقط الفتحة — يفكّ المعرّف ويبقي المرجع', async () => {
    await admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url: urlA }).expect(200);
    await db.query('DELETE FROM media_files WHERE url = $1', [urlA]);
    const { rows } = await db.query<{ image_url: string | null; media_id: string | null }>(
      'SELECT image_url, media_id FROM visual_slots WHERE id = $1',
      [slotId],
    );
    expect(rows[0]!.media_id).toBeNull();
    expect(rows[0]!.image_url).toBe(urlA);
    await admin('delete', `/api/admin/visual-slots/${slotId}/image`).expect(200);
  });
});
