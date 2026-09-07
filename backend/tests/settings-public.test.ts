import { describe, expect, it } from 'vitest';
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