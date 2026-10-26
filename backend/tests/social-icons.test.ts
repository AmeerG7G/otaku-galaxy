import { afterAll, describe, expect, it } from 'vitest';
import { api, createAdminUser, purgeTestUsers } from './helpers.js';
import { db } from '../src/database/pool.js';

/**
 * أيقونات التواصل — أصولٌ ثابتة في التطبيق، لا فتحات بصرية.
 *
 * [PRODUCT] قرار 2026-09-15: أيقونات تيك توك وإنستغرام وواتساب ليست شخصياتٍ
 * تُبدَّل من اللوحة. كانت فتحاتٍ (`social_*`، الهجرة ٠٣٢) وأُسقطت بالهجرة ٠٥٣.
 * منذ الهجرة 065 لا فتحات بصرية أصلاً (`visual-slots-retired.test.ts`)؛ ما
 * بقي هنا أن الروابط — وهي في `store_settings` — ما زالت تُدار وتُقرأ.
 */

describe('أيقونات التواصل أصولٌ ثابتة', () => {
  it('[CRITICAL] روابط التواصل تُدار من الإعدادات وتُقرأ كما كانت', async () => {
    const token = await createAdminUser();
    await api
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ social_tiktok: 'https://tiktok.com/@otakugalaxy' })
      .expect(200);
    try {
      const settings = await api.get('/api/catalog/settings').expect(200);
      expect(settings.body.data.social.tiktok).toBe('https://tiktok.com/@otakugalaxy');
    } finally {
      await api
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ social_tiktok: '' })
        .expect(200);
    }
  });
});

afterAll(async () => {
  await purgeTestUsers();
  await db.end();
});
