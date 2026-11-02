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

  it('[CRITICAL] تيك توك وإنستغرام وواتساب تُحفظ معاً، وتعديل أحدها لا يمسّ الآخرَين', async () => {
    const token = await createAdminUser();
    const auth = `Bearer ${token}`;
    const before = (await api.get('/api/admin/settings').set('Authorization', auth).expect(200)).body.data;
    const restore = {
      social_tiktok: before.social_tiktok,
      social_instagram: before.social_instagram,
      social_whatsapp: before.social_whatsapp,
    };
    try {
      await api
        .patch('/api/admin/settings')
        .set('Authorization', auth)
        .send({
          social_tiktok: 'https://www.tiktok.com/@otakugalaxy',
          social_instagram: 'https://www.instagram.com/otakugalaxy',
          social_whatsapp: '+9647701234567',
        })
        .expect(200);
      let social = (await api.get('/api/catalog/settings').expect(200)).body.data.social;
      expect(social).toMatchObject({
        tiktok: 'https://www.tiktok.com/@otakugalaxy',
        instagram: 'https://www.instagram.com/otakugalaxy',
        whatsapp: '+9647701234567',
      });

      // تعديل واحد فقط — الآخران كما هما.
      await api
        .patch('/api/admin/settings')
        .set('Authorization', auth)
        .send({ social_whatsapp: 'https://wa.me/9647809876543' })
        .expect(200);
      social = (await api.get('/api/catalog/settings').expect(200)).body.data.social;
      expect(social).toMatchObject({
        tiktok: 'https://www.tiktok.com/@otakugalaxy',
        instagram: 'https://www.instagram.com/otakugalaxy',
        whatsapp: 'https://wa.me/9647809876543',
      });

      // الإفراغ يمسح حقله وحده.
      await api.patch('/api/admin/settings').set('Authorization', auth).send({ social_tiktok: '' }).expect(200);
      social = (await api.get('/api/catalog/settings').expect(200)).body.data.social;
      expect(social).toMatchObject({
        tiktok: '',
        instagram: 'https://www.instagram.com/otakugalaxy',
        whatsapp: 'https://wa.me/9647809876543',
      });

      // قيمة غير صالحة تُرفض ولا تمسّ المحفوظ.
      await api.patch('/api/admin/settings').set('Authorization', auth).send({ social_whatsapp: 'not a number' }).expect(400);
      social = (await api.get('/api/catalog/settings').expect(200)).body.data.social;
      expect(social.whatsapp).toBe('https://wa.me/9647809876543');
    } finally {
      await api.patch('/api/admin/settings').set('Authorization', auth).send(restore).expect(200);
    }
  });
});

afterAll(async () => {
  await purgeTestUsers();
  await db.end();
});
