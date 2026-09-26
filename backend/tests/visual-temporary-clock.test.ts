// الصورة المؤقّتة — الزمن: منطقة المتجر (F5) وساعة القاعدة الواحدة (F6).
//
// [CRITICAL] «إلى يوم» سؤالٌ تقويمي، وتقويم المتجر هو `config.storeTimezone`
// كما في أعياد الميلاد — لا منطقة متصفح المسؤول ولا UTC. الخادم يعلن
// المنطقة في ردّ قائمة الفتحات فتحوّل اللوحة اليومَ المختار إلى نهايته
// بتلك المنطقة (F5). واللحظة المرسَلة تُحكم — ماضٍ أو أبعد من الحدّ — بساعة
// القاعدة نفسها التي تقيس سريان المؤقّتة (`temporary_until > now()`)، لا
// بساعة Node: ساعتان تعنيان لحظةً تُقبل ولا تُعرض أبداً، أو تُرفض وهي سارية (F6).

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { TEMPORARY_MAX_DAYS } from '../src/services/visualsService.js';
import { api, createAdminUser, registerUploadedSlotImage } from './helpers.js';

describe('الصورة المؤقّتة — منطقة المتجر وساعة القاعدة', () => {
  let adminToken: string;
  let slotId: string;
  let imageUrl: string;

  beforeAll(async () => {
    adminToken = await createAdminUser();
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO visual_slots (slot_key, label, location, group_key)
       VALUES ($1, 'فتحة ساعة', 'موضع اختبار', 'other') RETURNING id`,
      [`zz_clock_slot_${Date.now()}`],
    );
    slotId = rows[0]!.id;
    imageUrl = await registerUploadedSlotImage();
  });

  afterAll(async () => {
    await db.query('DELETE FROM visual_slots WHERE id = $1', [slotId]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function admin(method: 'get' | 'put' | 'delete', path: string) {
    return api[method](path).set('Authorization', `Bearer ${adminToken}`);
  }

  /** ساعة القاعدة — المرجع الوحيد الذي تُبنى عليه اللحظات في هذه السويت. */
  async function dbNow(): Promise<Date> {
    const { rows } = await db.query<{ now: Date }>('SELECT now() AS now');
    return rows[0]!.now;
  }

  /** يزيح ساعة Node وحدها (Date) عن ساعة القاعدة — لا المؤقّتات ولا الشبكة. */
  function skewNodeClock(ms: number) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + ms));
  }

  const put = (until: string) =>
    admin('put', `/api/admin/visual-slots/${slotId}/temporary-image`).send({ url: imageUrl, until });

  // ── F5 ──

  it('[F5] قائمة الفتحات تعلن منطقة المتجر الزمنية — كما تعلنها أعياد الميلاد', async () => {
    const res = await admin('get', '/api/admin/visual-slots').expect(200);
    expect(res.body.data.timezone).toBe(config.storeTimezone);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  // ── F6: ساعة واحدة — ساعة القاعدة ──

  const MINUTE = 60_000;
  const MAX_MS = TEMPORARY_MAX_DAYS * 24 * 60 * MINUTE;

  it('[F6][CRITICAL] ساعة Node متأخّرة: لحظةٌ مضت بساعة القاعدة تُرفض — لا «مؤقّتة» تُقبل ولا تُعرض قط', async () => {
    const until = new Date((await dbNow()).getTime() - 5 * MINUTE);
    skewNodeClock(-10 * MINUTE); // Node يظنّها بعد خمس دقائق
    const res = await put(until.toISOString());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TEMPORARY_UNTIL_PAST');
    const { rows } = await db.query<{ temporary_until: Date | null }>(
      'SELECT temporary_until FROM visual_slots WHERE id = $1',
      [slotId],
    );
    expect(rows[0]!.temporary_until).toBeNull();
  });

  it('[F6][CRITICAL] ساعة Node متقدّمة: لحظةٌ سارية بساعة القاعدة تُقبل وتُعرض — لا رفضٌ لما هو صالح', async () => {
    const until = new Date((await dbNow()).getTime() + 5 * MINUTE);
    skewNodeClock(10 * MINUTE); // Node يظنّها مضت قبل خمس دقائق
    const res = await put(until.toISOString());
    expect(res.status).toBe(200);
    expect(res.body.data.activeMode).toBe('temporary');
    expect(res.body.data.temporaryUntil).toBe(until.toISOString());
    vi.useRealTimers();
    await admin('delete', `/api/admin/visual-slots/${slotId}/temporary-image`).expect(200);
  });

  it('[F6] ساعة Node متأخّرة: لحظةٌ داخل الحدّ الأقصى بساعة القاعدة تُقبل', async () => {
    const until = new Date((await dbNow()).getTime() + MAX_MS - 5 * MINUTE);
    skewNodeClock(-10 * MINUTE); // Node يظنّها أبعد من الحدّ بخمس دقائق
    const res = await put(until.toISOString());
    expect(res.status).toBe(200);
    expect(res.body.data.activeMode).toBe('temporary');
    vi.useRealTimers();
    await admin('delete', `/api/admin/visual-slots/${slotId}/temporary-image`).expect(200);
  });

  it('[F7][SECURITY] الخادم يبقى الحَكَم: طلبٌ مباشر بنهاية اليوم الذي يبعد ٣٦٦ يوماً تقويمياً يُرفض ولو تجاوز حدّ اللوحة', async () => {
    // أسوأ ما كان المنتقي يعرضه: اليوم رقم ٣٦٦ بنهايته — أبعد من ٣٦٦ × ٢٤ ساعة بساعات.
    const worst = new Date((await dbNow()).getTime() + MAX_MS + 23 * 60 * MINUTE + 59 * MINUTE);
    const res = await put(worst.toISOString());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TEMPORARY_UNTIL_TOO_FAR');
    const { rows } = await db.query<{ temporary_until: Date | null }>(
      'SELECT temporary_until FROM visual_slots WHERE id = $1',
      [slotId],
    );
    expect(rows[0]!.temporary_until).toBeNull();
  });

  it('[F6] بلا إزاحة — حدود الساعة الواحدة: الآن بالضبط وما قبله يُرفضان، والحدّ الأقصى يُقبل وما بعده يُرفض', async () => {
    const now = await dbNow();
    for (const [label, offset] of [['الآن', 0], ['قبل ثانية', -1000]] as const) {
      const res = await put(new Date(now.getTime() + offset).toISOString());
      expect(res.status, label).toBe(400);
      expect(res.body.error.code, label).toBe('TEMPORARY_UNTIL_PAST');
    }
    const beyond = await put(new Date(now.getTime() + MAX_MS + MINUTE).toISOString());
    expect(beyond.status).toBe(400);
    expect(beyond.body.error.code).toBe('TEMPORARY_UNTIL_TOO_FAR');

    // الحدّ الأقصى نفسه (ناقص ثانيةً لتمرّ العبارة): مقبول.
    const atMax = await put(new Date(now.getTime() + MAX_MS - 1000).toISOString());
    expect(atMax.status).toBe(200);
    expect(atMax.body.data.activeMode).toBe('temporary');
    await admin('delete', `/api/admin/visual-slots/${slotId}/temporary-image`).expect(200);

    // وبعيدةٌ بوضوح: مقبولة.
    const far = await put(new Date(now.getTime() + 60 * MINUTE).toISOString());
    expect(far.status).toBe(200);
    await admin('delete', `/api/admin/visual-slots/${slotId}/temporary-image`).expect(200);
  });
});
