import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, registerUploadedPhoto } from './helpers.js';

/**
 * تطابق معاينة اللوحة مع ما يخدمه الخادم للتطبيق.
 *
 * قاعدة اختيار الصورة كانت منفَّذة مرّتين: `chooseIndex` على الخادم، ونسخة
 * منها بـTypeScript داخل صفحة اللوحة تقرأ ساعة المتصفح. لا شيء كان يربط
 * النسختين، فأيّ تعديل على القاعدة كان يترك المعاينة تكذب بصمت.
 *
 * هذه السويت هي الرباط: تقارن `currentImageId` (اللوحة) بـ`currentUrl`
 * (التطبيق) للفتحة نفسها. أيّ افتراق يكسر هنا بدل أن يظهر عند الزبون.
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

  function admin(method: 'get' | 'post' | 'patch' | 'delete', path: string) {
    return api[method](path).set('Authorization', `Bearer ${adminToken}`);
  }

  async function makeSlot(rotationMode: 'fixed' | 'daily', imageCount: number) {
    const slotKey = `parity_${rotationMode}_${Date.now()}_${slotIds.length}`;
    const created = await admin('post', '/api/admin/visual-slots')
      .send({ slotKey, label: 'مطابقة', rotationMode })
      .expect(201);
    const slotId = created.body.data.id as string;
    slotIds.push(slotId);

    for (let i = 0; i < imageCount; i += 1) {
      await admin('post', `/api/admin/visual-slots/${slotId}/images`)
        .send({ url: await registerUploadedPhoto() })
        .expect(201);
    }
    return { slotId, slotKey };
  }

  /** الصورة التي تعرضها اللوحة الآن، بحسب الخادم. */
  async function adminCurrentUrl(slotId: string) {
    const res = await admin('get', '/api/admin/visual-slots').expect(200);
    const slot = (res.body.data.items as Array<{
      id: string;
      currentImageId: string | null;
      images: Array<{ id: string; url: string }>;
    }>).find((item) => item.id === slotId)!;
    if (slot.currentImageId === null) return null;
    return slot.images.find((image) => image.id === slot.currentImageId)!.url;
  }

  /** الصورة التي يخدمها الخادم للتطبيق الآن. */
  async function publishedUrl(slotKey: string) {
    const res = await api.get('/api/catalog/visuals').expect(200);
    const slot = (res.body.data.slots as Array<{
      slotKey: string;
      currentUrl: string;
    }>).find((item) => item.slotKey === slotKey);
    return slot?.currentUrl ?? null;
  }

  it('[CRITICAL] التدوير اليومي: اللوحة والتطبيق يشيران إلى الصورة نفسها', async () => {
    // ثلاث صور: الفهرس اليومي يقع على غير الأولى في يومين من كل ثلاثة،
    // فصورةٌ واحدة كانت تخفي الخطأ.
    const { slotId, slotKey } = await makeSlot('daily', 3);
    expect(await adminCurrentUrl(slotId)).toBe(await publishedUrl(slotKey));
  });

  it('التدوير الثابت: كلاهما يشير إلى الأولى في الترتيب', async () => {
    const { slotId, slotKey } = await makeSlot('fixed', 3);
    const url = await adminCurrentUrl(slotId);
    expect(url).toBe(await publishedUrl(slotKey));
    // ونتأكّد أنها الأولى فعلاً لا مجرّد تطابق نسختين خاطئتين.
    const res = await admin('get', '/api/admin/visual-slots').expect(200);
    const slot = (res.body.data.items as Array<{ id: string; images: Array<{ url: string }> }>)
      .find((item) => item.id === slotId)!;
    expect(url).toBe(slot.images[0]!.url);
  });

  it('فتحة معطّلة: اللوحة لا تعد بصورة والتطبيق لا يستلم الفتحة', async () => {
    const { slotId, slotKey } = await makeSlot('fixed', 2);
    await admin('patch', `/api/admin/visual-slots/${slotId}`)
      .send({ isActive: false })
      .expect(200);

    expect(await adminCurrentUrl(slotId)).toBeNull();
    expect(await publishedUrl(slotKey)).toBeNull();
  });

  it('فتحة بلا صور: لا معاينة ولا إرسال', async () => {
    const { slotId, slotKey } = await makeSlot('fixed', 0);
    expect(await adminCurrentUrl(slotId)).toBeNull();
    expect(await publishedUrl(slotKey)).toBeNull();
  });
});
