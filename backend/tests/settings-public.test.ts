import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser } from './helpers.js';

/**
 * وصف الروابط الاجتماعية — سطر واحد مشترك تحت المجموعة، يديره المسؤول.
 *
 * كان لكل منصة سطرها الفرعي في الواجهة، فأصبح وصفاً واحداً تقرأه شاشة
 * «الحساب والمجتمع» من الإعدادات العامة دون إجبار المسؤول على نصٍ لكل
 * منصة. الإعداد يعيش في جدول الإعدادات (هجرة ٠٣٣) ويمرّ عبر مسار الإدارة
 * إلى واجهة الكتالوج العامة.
 */
describe('وصف الروابط الاجتماعية', () => {
  it('الإعداد العام يعيد social_description محفوظاً (افتراضياً سطراً فارغاً)', async () => {
    const res = await api.get('/api/catalog/settings').expect(200);
    expect(res.body.data.social).toBeDefined();
    expect(typeof res.body.data.social.description).toBe('string');
  });

  it('المسؤول يحفظ الوصف ويظهر لمن يقرأ الإعدادات العامة', async () => {
    const adminToken = await createAdminUser();

    await api
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ social_description: 'راسلنا على التواصل الاجتماعي — نرد خلال يوم' })
      .expect(200);

    const publicSettings = await api.get('/api/catalog/settings').expect(200);
    expect(publicSettings.body.data.social.description).toBe(
      'راسلنا على التواصل الاجتماعي — نرد خلال يوم',
    );
  });
});
describe('رابط المتجر لمشاركة المنتج (STEP 64)', () => {
  const save = async (token: string, value: string) =>
    api.patch('/api/admin/settings').set('Authorization', `Bearer ${token}`).send({ store_share_url: value });

  afterAll(async () => {
    await db.query(`DELETE FROM store_settings WHERE key = 'store_share_url'`);
  });

  it('الإعداد العام يحمل share.storeUrl — فارغاً حتى يضبطه المسؤول', async () => {
    await db.query(`DELETE FROM store_settings WHERE key = 'store_share_url'`);
    const res = await api.get('/api/catalog/settings').expect(200);
    expect(res.body.data.share).toEqual({ storeUrl: '' });
  });

  it('المسؤول يضبط الرابط فيصل التطبيق بلا إصدار جديد، ويُسجَّل قبل/بعد', async () => {
    const adminToken = await createAdminUser();
    await save(adminToken, 'https://otakugalaxystore.com/app').then((r) => expect(r.status).toBe(200));
    const res = await api.get('/api/catalog/settings').expect(200);
    expect(res.body.data.share).toEqual({ storeUrl: 'https://otakugalaxystore.com/app' });
    const audit = await db.query<{ details: { changes: Record<string, unknown> } }>(
      `SELECT details FROM admin_audit_log WHERE action = 'settings.updated' ORDER BY id DESC LIMIT 1`,
    );
    expect(audit.rows[0]!.details.changes.store_share_url).toEqual({ before: '', after: 'https://otakugalaxystore.com/app' });
  });

  it('الرابط http(s) أو فارغ — لا javascript: ولا نصّ حرّ', async () => {
    const adminToken = await createAdminUser();
    for (const bad of ['javascript:alert(1)', 'otaku galaxy', 'ftp://x.com']) {
      const res = await save(adminToken, bad);
      expect(res.status, bad).toBe(400);
    }
    await save(adminToken, '').then((r) => expect(r.status).toBe(200));
    expect((await api.get('/api/catalog/settings')).body.data.share.storeUrl).toBe('');
  });
});
