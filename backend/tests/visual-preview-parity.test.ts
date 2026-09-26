import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, registerUploadedSlotImage } from './helpers.js';

/**
 * تطابق معاينة اللوحة مع ما يخدمه الخادم للتطبيق.
 *
 * كانت قاعدة اختيار الصورة منفَّذة مرّتين (تدويرٌ على الخادم ونسخةٌ في
 * المتصفح). صار الخادم يحسب الصورة الفعّالة مرةً واحدة في القاعدة
 * (`activeImageUrl`: المؤقّتة السارية وإلا الدائمة) ويرسلها للطرفين —
 * وهذه السويت تُبقي الرباط: `activeImageUrl` (اللوحة) == `currentUrl`
 * (التطبيق)، والفتحة بلا صورة لا معاينة لها ولا إرسال.
 */
describe('تطابق معاينة اللوحة مع المنشور', () => {
  let adminToken: string;
  const slotIds: string[] = [];

  beforeAll(async () => {
    adminToken = await createAdminUser();
  });

  afterAll(async () => {
    // الفتحات الاختبارية تُزال: بقاؤها يُفسد اختبار مطابقة الفهرس.
    for (const id of slotIds) {
      await db.query('DELETE FROM visual_slots WHERE id = $1', [id]);
    }
  });

  function admin(method: 'get' | 'put' | 'delete', path: string) {
    return api[method](path).set('Authorization', `Bearer ${adminToken}`);
  }

  async function makeSlot(withImage: boolean) {
    const slotKey = `zz_parity_${Date.now()}_${slotIds.length}`;
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO visual_slots (slot_key, label, location, group_key)
       VALUES ($1, 'مطابقة', 'موضع اختبار', 'other') RETURNING id`,
      [slotKey],
    );
    const slotId = rows[0]!.id;
    slotIds.push(slotId);
    if (withImage) {
      await admin('put', `/api/admin/visual-slots/${slotId}/image`)
        .send({ url: await registerUploadedSlotImage() })
        .expect(200);
    }
    return { slotId, slotKey };
  }

  /** الصورة التي تعرضها اللوحة الآن — «ما يراه الزبون» كما يحسبها الخادم. */
  async function adminImageUrl(slotId: string) {
    const res = await admin('get', '/api/admin/visual-slots').expect(200);
    return (res.body.data.items as Array<{ id: string; activeImageUrl: string | null }>).find(
      (item) => item.id === slotId,
    )!.activeImageUrl;
  }

  /** الصورة التي يخدمها الخادم للتطبيق الآن. */
  async function publishedUrl(slotKey: string) {
    const res = await api.get('/api/catalog/visuals').expect(200);
    const slot = (res.body.data.slots as Array<{ slotKey: string; currentUrl: string }>).find(
      (item) => item.slotKey === slotKey,
    );
    return slot?.currentUrl ?? null;
  }

  it('[CRITICAL] فتحة بصورة: اللوحة والتطبيق يشيران إلى الصورة نفسها', async () => {
    const { slotId, slotKey } = await makeSlot(true);
    const url = await adminImageUrl(slotId);
    expect(url).not.toBeNull();
    expect(url).toBe(await publishedUrl(slotKey));
  });

  it('بعد الاستبدال: كلاهما ينتقل إلى الجديدة معاً', async () => {
    const { slotId, slotKey } = await makeSlot(true);
    const fresh = await registerUploadedSlotImage();
    await admin('put', `/api/admin/visual-slots/${slotId}/image`).send({ url: fresh }).expect(200);
    expect(await adminImageUrl(slotId)).toBe(fresh);
    expect(await publishedUrl(slotKey)).toBe(fresh);
  });

  it('فتحة بلا صورة: لا معاينة ولا إرسال', async () => {
    const { slotId, slotKey } = await makeSlot(false);
    expect(await adminImageUrl(slotId)).toBeNull();
    expect(await publishedUrl(slotKey)).toBeNull();
  });

  it('بعد الإزالة: كلاهما يعود إلى «لا صورة» معاً', async () => {
    const { slotId, slotKey } = await makeSlot(true);
    await admin('delete', `/api/admin/visual-slots/${slotId}/image`).expect(200);
    expect(await adminImageUrl(slotId)).toBeNull();
    expect(await publishedUrl(slotKey)).toBeNull();
  });

  it('[CRITICAL] مؤقّتةٌ سارية: اللوحة والتطبيق يعرضان المؤقّتة لا الدائمة، وبعد انتهائها الدائمة معاً', async () => {
    const { slotId, slotKey } = await makeSlot(true);
    const permanent = await adminImageUrl(slotId);
    const temporary = await registerUploadedSlotImage();
    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await admin('put', `/api/admin/visual-slots/${slotId}/temporary-image`)
      .send({ url: temporary, until })
      .expect(200);
    expect(await adminImageUrl(slotId)).toBe(temporary);
    expect(await publishedUrl(slotKey)).toBe(temporary);

    // الانتهاء يُحاكى بتحريك اللحظة إلى الماضي — لا كتابة على الصور.
    await db.query(
      "UPDATE visual_slots SET temporary_until = now() - interval '1 second' WHERE id = $1",
      [slotId],
    );
    expect(await adminImageUrl(slotId)).toBe(permanent);
    expect(await publishedUrl(slotKey)).toBe(permanent);
  });
});
