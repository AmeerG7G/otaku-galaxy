import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { mediaRepo } from '../src/repositories/mediaRepo.js';
import { MEDIA_PURPOSES } from '../src/types/index.js';
import { api, createAdminUser, purgeTestUsers } from './helpers.js';

/**
 * [PRODUCT] ميزة «رسوم الشخصيات» أُزيلت من لوحة التحكم (2026-09-27، الهجرة 065).
 *
 * الشخصيات صارت أصولاً ثابتة في التطبيق يحدّدها الكود
 * (`lib/features/visuals/domain/visual_slot.dart` → `CharacterArt`)، والصور
 * المختارة نُسخت إليه بايتاً ببايت. هذه السويت تحرس ألّا يعود أيّ جزءٍ من
 * الميزة: الجدول، ومسارات اللوحة، والمسار العام، وغرض الرفع، ومرجع الوسائط.
 */

let adminToken: string;

beforeAll(async () => {
  adminToken = await createAdminUser();
});

afterAll(async () => {
  await purgeTestUsers();
});

// PNG 1×1 صالح — ما يقبله وسيط الرفع لو كان الغرض مقبولاً.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5d70000000049454e44ae426082',
  'hex',
);

describe('[CRITICAL] لا «رسوم شخصيات» في الخادم بعد الهجرة 065', () => {
  it('جدول `visual_slots` غير موجود', async () => {
    const { rows } = await db.query<{ regclass: string | null }>(
      "SELECT to_regclass('visual_slots')::text AS regclass",
    );
    expect(rows[0]!.regclass).toBeNull();
  });

  it('مسارات اللوحة محذوفة — 404 لا 401/403', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const id = '00000000-0000-0000-0000-000000000000';
    expect((await api.get('/api/admin/visual-slots').set(auth)).status).toBe(404);
    expect((await api.put(`/api/admin/visual-slots/${id}/image`).set(auth).send({ url: '/uploads/slot/x.png' })).status).toBe(404);
    expect((await api.delete(`/api/admin/visual-slots/${id}/image`).set(auth)).status).toBe(404);
    expect(
      (await api.put(`/api/admin/visual-slots/${id}/temporary-image`).set(auth).send({ url: '/uploads/slot/x.png', until: '2030-01-01T00:00:00Z' })).status,
    ).toBe(404);
    expect((await api.delete(`/api/admin/visual-slots/${id}/temporary-image`).set(auth)).status).toBe(404);
  });

  it('المسار العام الذي كان التطبيق يقرأ منه الرسوم محذوف', async () => {
    // بلا جلسة يسقط المسار المجهول إلى الموجِّه المصادَق (401) كأي مسارٍ غير
    // معرَّف؛ بجلسة يظهر أنه غير موجود أصلاً — لا ردٌّ ناجح في الحالتين.
    const anonymous = await api.get('/api/catalog/visuals');
    expect(anonymous.status).not.toBe(200);
    const authed = await api
      .get('/api/catalog/visuals')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(authed.status).toBe(404);
  });

  it('لا رفع بغرض `slot` — ولا مرجع وسائط يقرأ الجدول', async () => {
    expect(MEDIA_PURPOSES).not.toContain('slot' as never);
    const res = await api
      .post('/api/admin/uploads')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('purpose', 'slot')
      .attach('file', PNG, 'x.png');
    expect(res.status).toBe(400);
    expect(mediaRepo.MEDIA_REFERENCE_COLUMNS.map(([table]) => table)).not.toContain('visual_slots');
  });
});
