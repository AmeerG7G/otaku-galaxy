import { afterAll, describe, expect, it } from 'vitest';
import { api, createAdminUser, purgeTestUsers } from './helpers.js';
import { db } from '../src/database/pool.js';

/**
 * أيقونات التواصل — أصولٌ ثابتة في التطبيق، لا فتحات بصرية.
 *
 * [PRODUCT] قرار 2026-09-15: أيقونات تيك توك وإنستغرام وواتساب ليست شخصياتٍ
 * تُبدَّل من اللوحة. كانت فتحاتٍ (`social_*`، الهجرة ٠٣٢) وأُسقطت بالهجرة ٠٥٣
 * كما أُسقطت فتحات الشاشات المحذوفة. هذه السويت هي **عكس** سابقتها: تثبت
 * غياب الفتحات من القاعدة ومن اللوحة ومن المسار العام، وأن الروابط —
 * وهي في `store_settings` — بقيت تُدار وتُقرأ كما كانت.
 */

const SOCIAL_SLOTS = ['social_tiktok', 'social_instagram', 'social_whatsapp'] as const;

describe('أيقونات التواصل أصولٌ ثابتة', () => {
  it('[CRITICAL] لا فتحة لأي منصّة تواصل في القاعدة', async () => {
    const { rows } = await db.query<{ slot_key: string }>(
      'SELECT slot_key FROM visual_slots WHERE slot_key = ANY($1)',
      [[...SOCIAL_SLOTS]],
    );
    expect(rows).toEqual([]);
    const { rows: prefixed } = await db.query<{ slot_key: string }>(
      `SELECT slot_key FROM visual_slots WHERE slot_key LIKE 'social\\_%' ESCAPE '\\'`,
    );
    expect(prefixed).toEqual([]);
  });

  it('[CRITICAL] اللوحة لا تعرض أيقونة تواصل كفتحةٍ قابلة للتغيير', async () => {
    const token = await createAdminUser();
    const res = await api
      .get('/api/admin/visual-slots')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const items = res.body.data.items as { slotKey: string; label: string; location: string }[];
    for (const slot of SOCIAL_SLOTS) {
      expect(items.map((i) => i.slotKey), slot).not.toContain(slot);
    }
    // ولا فتحة أخرى توصف بأنها أيقونة منصّة.
    for (const item of items) {
      expect(`${item.label} ${item.location}`, item.slotKey).not.toMatch(/تيك توك|إنستغرام|واتساب/);
    }
  });

  it('المسار العام الذي يقرؤه التطبيق لا يحمل أيقونات تواصل', async () => {
    const res = await api.get('/api/catalog/visuals').expect(200);
    const keys = (res.body.data.slots as { slotKey: string }[]).map((s) => s.slotKey);
    for (const slot of SOCIAL_SLOTS) expect(keys).not.toContain(slot);
  });

  it('[CRITICAL] روابط التواصل مستقلّةٌ عن الفتحات وما زالت تُدار وتُقرأ', async () => {
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
