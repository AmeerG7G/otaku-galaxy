import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { api, createAdminUser, purgeTestUsers, registerAndLogin } from './helpers.js';
import { db } from '../src/database/pool.js';
import { config } from '../src/config/index.js';

/**
 * أيقونات التواصل التي يضبطها المسؤول.
 *
 * الأيقونة هنا **فتحة بصرية** لا حقل إعداد: نفس المنظومة التي تدير رسوم
 * الشخصيات (`visual_slots`)، تزرع الهجرة ٠٣٢ لها ثلاثة مفاتيح. اختبار
 * الطرف إلى الطرف: يضبط المسؤول الأيقونة → يراها المسار العام الذي يقرؤه
 * التطبيق → يُلغيها → تعود الفتحة غير مضبوطة فيرسم التطبيق بديله.
 *
 * [CRITICAL] الأيقونة والرابط منفصلان تماماً: الرابط في `store_settings`
 * والأيقونة في `visual_slots`. تغييرُ أحدهما لا يمسّ الآخر — وهذا ما يُقاس
 * هنا صراحةً، لأن دمجهما كان سيجعل مسحَ الأيقونة يمسح الرابط معها.
 */

const SOCIAL_SLOTS = ['social_tiktok', 'social_instagram', 'social_whatsapp'] as const;

/**
 * يسجّل ملفاً مرفوعاً ويعيد مرجعه النسبي.
 *
 * [CRITICAL] الخادم يرفض ربط فتحة بصورة غير مرفوعة (`MEDIA_NOT_FOUND`) —
 * وهو حارسٌ مقصود يمنع أيقونةً تشير إلى ملفٍ غير موجود. فالاختبار يمرّ
 * بالمسار الحقيقي: يُرفع الملف أولاً ثم يُربط.
 */
async function uploadedIcon(): Promise<string> {
  const storageKey = `slot/test/${randomUUID()}.png`;
  const url = `${config.uploads.publicPath}/${storageKey}`;
  await db.query(
    `INSERT INTO media_files (storage_key, url, purpose, mime_type, size_bytes)
     VALUES ($1, $2, 'slot', 'image/png', 2048)`,
    [storageKey, url],
  );
  return url;
}

/** يقرأ المسار العام كما يفعل التطبيق. */
async function publishedSlots(): Promise<Record<string, string>> {
  const res = await api.get('/api/catalog/visuals').expect(200);
  const map: Record<string, string> = {};
  for (const slot of res.body.data.slots as { slotKey: string; currentUrl: string }[]) {
    map[slot.slotKey] = slot.currentUrl;
  }
  return map;
}

async function adminSlotId(token: string, slotKey: string): Promise<string> {
  const res = await api
    .get('/api/admin/visual-slots')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const slot = (res.body.data.items as { id: string; slotKey: string }[]).find(
    (item) => item.slotKey === slotKey,
  );
  expect(slot, `الفتحة ${slotKey} غير موجودة`).toBeTruthy();
  return slot!.id;
}

/** يزيل كل صور الفتحات الثلاث — تُترك القاعدة كما وُجدت. */
async function clearSocialIcons() {
  await db.query(
    `DELETE FROM visual_slot_images
      WHERE slot_id IN (SELECT id FROM visual_slots WHERE slot_key = ANY($1))`,
    [SOCIAL_SLOTS],
  );
  // وسجلّات الملفات المسجَّلة للاختبار — تُترك القاعدة كما وُجدت.
  await db.query(`DELETE FROM media_files WHERE storage_key LIKE 'slot/test/%'`);
}

describe('أيقونات التواصل المُدارة من اللوحة', () => {
  afterEach(clearSocialIcons);

  it('[CRITICAL] المنصات الثلاث لها فتحات مزروعة يراها المسؤول', async () => {
    // بلا صفٍّ في القاعدة لا تظهر الفتحة في اللوحة، فلا سبيل لضبط الأيقونة.
    const token = await createAdminUser();
    const res = await api
      .get('/api/admin/visual-slots')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const keys = (res.body.data.items as { slotKey: string }[]).map((i) => i.slotKey);
    for (const slot of SOCIAL_SLOTS) {
      expect(keys, `الفتحة ${slot}`).toContain(slot);
    }
  });

  it('[CRITICAL] ما يضبطه المسؤول يصل إلى المسار الذي يقرؤه التطبيق', async () => {
    const token = await createAdminUser();

    const urls: Record<string, string> = {};
    for (const slotKey of SOCIAL_SLOTS) {
      const id = await adminSlotId(token, slotKey);
      urls[slotKey] = await uploadedIcon();
      await api
        .post(`/api/admin/visual-slots/${id}/images`)
        .set('Authorization', `Bearer ${token}`)
        .send({ url: urls[slotKey], mode: 'replace' })
        .expect(201);
    }

    const published = await publishedSlots();
    for (const slotKey of SOCIAL_SLOTS) {
      expect(published[slotKey], slotKey).toBe(urls[slotKey]);
    }
  });

  it('[CRITICAL] بلا ضبط لا تُنشر الفتحة — فيرسم التطبيق بديله', async () => {
    // الفتحة الغائبة من الحمولة هي إشارة «غير مضبوطة»، وعندها يعرض
    // `ManagedArtwork` أيقونة Material بدل مربّع مكسور.
    const published = await publishedSlots();
    for (const slotKey of SOCIAL_SLOTS) {
      expect(published[slotKey], slotKey).toBeUndefined();
    }
  });

  it('[CRITICAL] الأيقونة والرابط مستقلّان — ضبط أحدهما لا يمسّ الآخر', async () => {
    const token = await createAdminUser();

    await api
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ social_tiktok: 'https://tiktok.com/@otakugalaxy' })
      .expect(200);

    const id = await adminSlotId(token, 'social_tiktok');
    await api
      .post(`/api/admin/visual-slots/${id}/images`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: await uploadedIcon(), mode: 'replace' })
      .expect(201);

    // الرابط باقٍ بعد ضبط الأيقونة.
    const settings = await api.get('/api/catalog/settings').expect(200);
    expect(settings.body.data.social.tiktok).toBe('https://tiktok.com/@otakugalaxy');

    // وحذف الأيقونة لا يمسّ الرابط.
    await clearSocialIcons();
    const after = await api.get('/api/catalog/settings').expect(200);
    expect(after.body.data.social.tiktok).toBe('https://tiktok.com/@otakugalaxy');

    await api
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ social_tiktok: '' })
      .expect(200);
  });

  it('[CRITICAL] غير المسؤول لا يضبط أيقونة', async () => {
    const admin = await createAdminUser();
    const id = await adminSlotId(admin, 'social_tiktok');
    const { token } = await registerAndLogin();

    await api
      .post(`/api/admin/visual-slots/${id}/images`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: await uploadedIcon(), mode: 'replace' })
      .expect(403);
  });

  it('الرابط الفاسد يُرفض قبل الحفظ', async () => {
    const token = await createAdminUser();
    const id = await adminSlotId(token, 'social_instagram');

    await api
      .post(`/api/admin/visual-slots/${id}/images`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'javascript:alert(1)', mode: 'replace' })
      .expect(400);
  });
});

afterAll(async () => {
  await clearSocialIcons();
  await purgeTestUsers();
  await db.end();
});
