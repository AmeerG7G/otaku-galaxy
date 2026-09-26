import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { TEMPORARY_MAX_DAYS } from '../src/services/visualsService.js';
import {
  api,
  createAdminUser,
  registerAndLogin,
  registerUploadedPhoto,
  registerUploadedSlotImage,
} from './helpers.js';

/**
 * الصورة المؤقّتة فوق الدائمة (الهجرة ٠٥٥).
 *
 * ما تحرسه هذه السويت: للموضع صورةٌ فعّالة **واحدة** في كل لحظة؛ المؤقّتة
 * تحجب الدائمة ما دامت سارية ولا تكتب فوقها أبداً؛ انتهاؤها يعيد الدائمة
 * **من تلقاء نفسه** بلا كتابة؛ الحكم بساعة الخادم؛ والقواعد الأمنية للصورة
 * (مرفوعةٌ للغرض `slot`، لا خارجية، لا صور زبائن) هي نفسها للدائمة والمؤقّتة.
 */
describe('فتحات الرسوم — الصورة المؤقّتة', () => {
  let adminToken: string;
  let customer: { token: string; userId: string };
  let slotId: string;
  let slotKey: string;
  let permanentUrl: string;
  let temporaryUrl: string;

  const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

  beforeAll(async () => {
    adminToken = await createAdminUser();
    customer = await registerAndLogin();
    slotKey = `zz_temp_slot_${Date.now()}`;
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO visual_slots (slot_key, label, location, group_key)
       VALUES ($1, 'فتحة مؤقّتة', 'موضع اختبار', 'other') RETURNING id`,
      [slotKey],
    );
    slotId = rows[0]!.id;
    permanentUrl = await registerUploadedSlotImage();
    temporaryUrl = await registerUploadedSlotImage();
  });

  afterAll(async () => {
    await db.query('DELETE FROM visual_slots WHERE id = $1', [slotId]);
  });

  function admin(method: 'get' | 'put' | 'delete', path: string) {
    return api[method](path).set('Authorization', `Bearer ${adminToken}`);
  }

  async function published() {
    const res = await api.get('/api/catalog/visuals').expect(200);
    return res.body.data as {
      version: string;
      now: string;
      nextChangeAt: string | null;
      slots: { slotKey: string; currentUrl: string }[];
    };
  }

  const currentUrl = async () =>
    (await published()).slots.find((slot) => slot.slotKey === slotKey)?.currentUrl ?? null;

  interface AdminSlot {
    id: string;
    imageUrl: string | null;
    temporaryImageUrl: string | null;
    temporaryUntil: string | null;
    activeImageUrl: string | null;
    activeMode: 'temporary' | 'permanent' | 'bundled';
  }

  async function adminSlot(): Promise<AdminSlot> {
    const res = await admin('get', '/api/admin/visual-slots').expect(200);
    return (res.body.data.items as AdminSlot[]).find((item) => item.id === slotId)!;
  }

  /** يحاكي مرور الوقت بتحريك لحظة الانتهاء إلى الماضي — الصور لا تُمسّ. */
  const expireNow = () =>
    db.query(
      "UPDATE visual_slots SET temporary_until = now() - interval '1 second' WHERE id = $1",
      [slotId],
    );

  // ── المخطّط ──

  it('[CRITICAL] المؤقّتة أعمدةٌ في صفّ الفتحة نفسه، والصورة ولحظة انتهائها معاً أو لا شيء', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'visual_slots' AND column_name LIKE 'temporary_%'
        ORDER BY column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      'temporary_image_url',
      'temporary_media_id',
      'temporary_until',
    ]);
    await expect(
      db.query('UPDATE visual_slots SET temporary_image_url = $2 WHERE id = $1', [slotId, temporaryUrl]),
    ).rejects.toThrow(/visual_slots_temporary_pair/);
    await expect(
      db.query('UPDATE visual_slots SET temporary_until = now() + interval \'1 day\' WHERE id = $1', [slotId]),
    ).rejects.toThrow(/visual_slots_temporary_pair/);
  });

  // ── الدورة ──

  it('بلا دائمة ولا مؤقّتة: مضمَّن — الفتحة لا تُرسَل، واللوحة تقول «مضمَّن»', async () => {
    expect(await currentUrl()).toBeNull();
    expect((await adminSlot()).activeMode).toBe('bundled');
  });

  it('[CRITICAL] المؤقّتة تحجب الدائمة ولا تكتب فوقها', async () => {
    await admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url: permanentUrl }).expect(200);
    expect(await currentUrl()).toBe(permanentUrl);

    const until = inOneHour();
    const res = await admin('put', `/api/admin/visual-slots/${slotId}/temporary-image`)
      .send({ url: temporaryUrl, until })
      .expect(200);
    expect(res.body.data.activeMode).toBe('temporary');
    expect(res.body.data.activeImageUrl).toBe(temporaryUrl);
    expect(res.body.data.imageUrl).toBe(permanentUrl);
    expect(new Date(res.body.data.temporaryUntil).toISOString()).toBe(until);

    expect(await currentUrl()).toBe(temporaryUrl);
    const { rows } = await db.query<{ image_url: string; temporary_image_url: string }>(
      'SELECT image_url, temporary_image_url FROM visual_slots WHERE id = $1',
      [slotId],
    );
    expect(rows[0]).toEqual({ image_url: permanentUrl, temporary_image_url: temporaryUrl });
  });

  it('[CRITICAL] الفتحة تحمل صورةً فعّالة واحدة على السلك — لا قائمة ولا حقلَ مؤقّت للتطبيق', async () => {
    const data = await published();
    const slot = data.slots.find((s) => s.slotKey === slotKey) as Record<string, unknown>;
    expect(Object.keys(slot).sort()).toEqual(['currentUrl', 'slotKey']);
    expect(data.slots.filter((s) => s.slotKey === slotKey)).toHaveLength(1);
  });

  it('الردّ العام يحمل ساعة الخادم وأقرب انتهاء — بساعةٍ واحدة', async () => {
    const data = await published();
    expect(Number.isNaN(Date.parse(data.now))).toBe(false);
    expect(Math.abs(Date.parse(data.now) - Date.now())).toBeLessThan(60_000);
    const mine = (await adminSlot()).temporaryUntil!;
    expect(data.nextChangeAt).not.toBeNull();
    expect(Date.parse(data.nextChangeAt!)).toBeLessThanOrEqual(Date.parse(mine));
    expect(Date.parse(data.nextChangeAt!)).toBeGreaterThan(Date.parse(data.now));
  });

  it('[CRITICAL] البصمة تتبع الفعّالة: تتغيّر مع المؤقّتة وتعود مع الدائمة', async () => {
    const withTemporary = (await published()).version;
    await expireNow();
    const afterExpiry = (await published()).version;
    expect(afterExpiry).not.toBe(withTemporary);
    // إعادة المؤقّتة نفسها تعيد البصمة نفسها — بصمةُ محتوى.
    await admin('put', `/api/admin/visual-slots/${slotId}/temporary-image`)
      .send({ url: temporaryUrl, until: inOneHour() })
      .expect(200);
    expect((await published()).version).toBe(withTemporary);
  });

  it('[CRITICAL] الانتهاء يعيد الدائمة من تلقاء نفسه — بلا كتابة، واللوحة لا تعرض مؤقّتةً منتهية', async () => {
    await expireNow();
    expect(await currentUrl()).toBe(permanentUrl);
    const slot = await adminSlot();
    expect(slot.activeMode).toBe('permanent');
    expect(slot.activeImageUrl).toBe(permanentUrl);
    expect(slot.temporaryImageUrl).toBeNull();
    expect(slot.temporaryUntil).toBeNull();
    expect((await published()).nextChangeAt).toBeNull();
  });

  it('استبدال الدائمة أثناء مؤقّتةٍ سارية لا يغيّر ما يراه الزبون حتى تنتهي', async () => {
    await admin('put', `/api/admin/visual-slots/${slotId}/temporary-image`)
      .send({ url: temporaryUrl, until: inOneHour() })
      .expect(200);
    const newPermanent = await registerUploadedSlotImage();
    await admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url: newPermanent }).expect(200);
    expect(await currentUrl()).toBe(temporaryUrl);
    expect((await adminSlot()).imageUrl).toBe(newPermanent);
    await expireNow();
    expect(await currentUrl()).toBe(newPermanent);
    // نعيد الدائمة الأصلية للاختبارات التالية.
    await admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url: permanentUrl }).expect(200);
  });

  it('إنهاء المؤقّتة الآن يُظهر الدائمة فوراً ويترك الملف وسجلّ الوسائط', async () => {
    await admin('put', `/api/admin/visual-slots/${slotId}/temporary-image`)
      .send({ url: temporaryUrl, until: inOneHour() })
      .expect(200);
    const res = await admin('delete', `/api/admin/visual-slots/${slotId}/temporary-image`).expect(200);
    expect(res.body.data.activeMode).toBe('permanent');
    expect(await currentUrl()).toBe(permanentUrl);
    const media = await db.query('SELECT 1 FROM media_files WHERE url = $1', [temporaryUrl]);
    expect(media.rowCount).toBe(1);
    // إنهاءٌ ثانٍ لا يُخطئ.
    await admin('delete', `/api/admin/visual-slots/${slotId}/temporary-image`).expect(200);
  });

  it('إزالة الدائمة أثناء مؤقّتةٍ سارية: المؤقّتة تبقى، وبعد انتهائها المضمَّن', async () => {
    await admin('put', `/api/admin/visual-slots/${slotId}/temporary-image`)
      .send({ url: temporaryUrl, until: inOneHour() })
      .expect(200);
    await admin('delete', `/api/admin/visual-slots/${slotId}/image`).expect(200);
    expect(await currentUrl()).toBe(temporaryUrl);
    await expireNow();
    expect(await currentUrl()).toBeNull();
    expect((await adminSlot()).activeMode).toBe('bundled');
    await admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url: permanentUrl }).expect(200);
  });

  it('مؤقّتةٌ ثانية تحلّ محلّ الأولى — واحدة في كل وقت', async () => {
    const second = await registerUploadedSlotImage();
    await admin('put', `/api/admin/visual-slots/${slotId}/temporary-image`)
      .send({ url: temporaryUrl, until: inOneHour() })
      .expect(200);
    await admin('put', `/api/admin/visual-slots/${slotId}/temporary-image`)
      .send({ url: second, until: inOneHour() })
      .expect(200);
    expect(await currentUrl()).toBe(second);
    const { rows } = await db.query<{ n: string }>(
      'SELECT COUNT(*) AS n FROM visual_slots WHERE id = $1 AND temporary_image_url IS NOT NULL',
      [slotId],
    );
    expect(Number(rows[0]!.n)).toBe(1);
    await admin('delete', `/api/admin/visual-slots/${slotId}/temporary-image`).expect(200);
  });

  // ── حدود لحظة الانتهاء (بساعة الخادم) ──

  it('[SECURITY] انتهاءٌ في الماضي يُرفض — لا مؤقّتة «سارية» لا يراها أحد', async () => {
    const res = await admin('put', `/api/admin/visual-slots/${slotId}/temporary-image`).send({
      url: temporaryUrl,
      until: new Date(Date.now() - 1000).toISOString(),
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code ?? res.body.code).toBe('TEMPORARY_UNTIL_PAST');
    expect((await adminSlot()).temporaryImageUrl).toBeNull();
  });

  it('[SECURITY] انتهاءٌ أبعد من عامٍ يُرفض — الدائمة لها مسارها', async () => {
    const res = await admin('put', `/api/admin/visual-slots/${slotId}/temporary-image`).send({
      url: temporaryUrl,
      until: new Date(Date.now() + (TEMPORARY_MAX_DAYS + 2) * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code ?? res.body.code).toBe('TEMPORARY_UNTIL_TOO_FAR');
  });

  it('لحظةٌ مشوَّهة أو غائبة أو بلا إزاحة → 400', async () => {
    for (const until of ['غداً', '2026-13-45', '2026-09-21T23:59:59', undefined]) {
      const res = await admin('put', `/api/admin/visual-slots/${slotId}/temporary-image`).send({
        url: temporaryUrl,
        until,
      });
      expect(res.status, String(until)).toBe(400);
    }
  });

  // ── القواعد الأمنية نفسها للمؤقّتة ──

  it('[SECURITY] رابطٌ خارجي، وصورةٌ غير مرفوعة، وصورةُ زبون: تُرفض كلّها للمؤقّتة أيضاً', async () => {
    const cases = [
      'https://cdn.example.com/x.png',
      `${config.uploads.publicPath}/slot/2026/01/not-a-real-file.png`,
      await registerUploadedPhoto(customer.userId),
    ];
    for (const url of cases) {
      const res = await admin('put', `/api/admin/visual-slots/${slotId}/temporary-image`).send({
        url,
        until: inOneHour(),
      });
      expect(res.status, url).toBe(400);
    }
    expect((await adminSlot()).temporaryImageUrl).toBeNull();
  });

  it('[SECURITY] العميل لا يضع مؤقّتة ولا ينهيها (403)، وبلا توكن 401', async () => {
    const asCustomer = (method: 'put' | 'delete') =>
      api[method](`/api/admin/visual-slots/${slotId}/temporary-image`).set(
        'Authorization',
        `Bearer ${customer.token}`,
      );
    expect((await asCustomer('put').send({ url: temporaryUrl, until: inOneHour() })).status).toBe(403);
    expect((await asCustomer('delete')).status).toBe(403);
    expect(
      (await api.put(`/api/admin/visual-slots/${slotId}/temporary-image`).send({ url: temporaryUrl, until: inOneHour() })).status,
    ).toBe(401);
    expect((await api.delete(`/api/admin/visual-slots/${slotId}/temporary-image`)).status).toBe(401);
  });

  it('معرّف فتحة مجهول → 404، ومشوَّه → 400 — لا كتابة على فتحةٍ أخرى', async () => {
    expect(
      (
        await admin('put', '/api/admin/visual-slots/00000000-0000-4000-8000-000000000000/temporary-image').send({
          url: temporaryUrl,
          until: inOneHour(),
        })
      ).status,
    ).toBe(404);
    expect((await admin('delete', '/api/admin/visual-slots/not-a-uuid/temporary-image')).status).toBe(400);
  });

  // ── السباق ──

  it('[CRITICAL] دائمةٌ ومؤقّتة تُكتبان معاً: كلتاهما تبقى — لا تطمس إحداهما الأخرى', async () => {
    const freshPermanent = await registerUploadedSlotImage();
    const freshTemporary = await registerUploadedSlotImage();
    const [a, b] = await Promise.all([
      admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url: freshPermanent }),
      admin('put', `/api/admin/visual-slots/${slotId}/temporary-image`).send({
        url: freshTemporary,
        until: inOneHour(),
      }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const slot = await adminSlot();
    expect(slot.imageUrl).toBe(freshPermanent);
    expect(slot.temporaryImageUrl).toBe(freshTemporary);
    expect(await currentUrl()).toBe(freshTemporary);
    await admin('delete', `/api/admin/visual-slots/${slotId}/temporary-image`).expect(200);
    await admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url: permanentUrl }).expect(200);
  });

  it('حذف سجلّ وسائط المؤقّتة لا يُسقط الفتحة — يفكّ المعرّف ويبقي المرجع', async () => {
    const doomed = await registerUploadedSlotImage();
    await admin('put', `/api/admin/visual-slots/${slotId}/temporary-image`)
      .send({ url: doomed, until: inOneHour() })
      .expect(200);
    await db.query('DELETE FROM media_files WHERE url = $1', [doomed]);
    const { rows } = await db.query<{ temporary_image_url: string; temporary_media_id: string | null }>(
      'SELECT temporary_image_url, temporary_media_id FROM visual_slots WHERE id = $1',
      [slotId],
    );
    expect(rows[0]).toEqual({ temporary_image_url: doomed, temporary_media_id: null });
    await admin('delete', `/api/admin/visual-slots/${slotId}/temporary-image`).expect(200);
  });
});
