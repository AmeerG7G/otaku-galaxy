// [REGRESSION GUARD] الردّ العام للرسوم لقطةٌ واحدة من القاعدة.
//
// `GET /catalog/visuals` يجمع ثلاث قيم: الفتحات وصورها الفعّالة، والبصمة
// (`version`)، والساعة (`now` + `nextChangeAt`). كانت تُقرأ بثلاثة استعلامات
// مستقلة تُنسَّق بـ`Promise.all` — أي ثلاث لقطاتٍ من القاعدة لا لقطةٌ واحدة.
// كتابةٌ تُلتزم بينها (مسؤولٌ ينهي مؤقّتةً، أو مؤقّتةٌ تنتهي بساعة القاعدة)
// تُخرج ردّاً لم يوجد قطّ في القاعدة: فتحاتٌ تحمل المؤقّتة، وبصمةٌ حُسبت على
// الدائمة، و`nextChangeAt = null` — فلا يجدول التطبيق العودة أبداً ويبقى على
// صورةٍ انتهت.
//
// [CRITICAL] السباق يُصنَع هنا حتميّاً لا بالنوم: تُعترض `pg.Client#query`
// (المنفذ الذي تمرّ منه كل عبارة، من المجمّع أو من عميل معاملة): أول قراءةٍ
// لـ`visual_slots` تمرّ وتُنفَّذ؛ لحظةَ اكتمالها تُنفَّذ كتابةٌ حقيقية على
// اتصالٍ آخر وتُلتزم؛ وكل قراءةٍ لاحقة لـ`visual_slots` في الردّ نفسه تُحجز
// **قبل إرسالها** إلى القاعدة حتى تُلتزم تلك الكتابة. تنفيذٌ بثلاث لقطات
// يُنتج خليطاً بالضرورة؛ ولقطةٌ واحدة (عبارةٌ واحدة، أو معاملةٌ بلقطةٍ
// مثبَّتة) تُنتج حالةً كاملة قبل الكتابة أو كاملة بعدها.

import { createHash } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/database/pool.js';
import { visualsRepo } from '../src/repositories/visualsRepo.js';
import { api, createAdminUser, registerUploadedSlotImage } from './helpers.js';

interface PublishedPayload {
  version: string;
  now: string;
  nextChangeAt: string | null;
  slots: { slotKey: string; currentUrl: string }[];
}

/**
 * عقد البصمة كما توثّقه README §13.4: MD5 لأزواج `slot_key=active`
 * مرتّبةً بالمفتاح ومفصولةً بسطرٍ جديد، و`'empty'` بلا فتحات. الترتيب هو
 * ترتيب الردّ نفسه (كلاهما `ORDER BY slot_key` بترتيب القاعدة) — لا يُعاد
 * الفرز في JS لأن ترتيب القاعدة (`ar_IQ.UTF-8`) ليس ترتيب JS.
 */
function contentHash(slots: PublishedPayload['slots']) {
  if (slots.length === 0) return 'empty';
  return createHash('md5')
    .update(slots.map((slot) => `${slot.slotKey}=${slot.currentUrl}`).join('\n'))
    .digest('hex');
}

type QueryFn = (this: pg.Client, config: unknown, values?: unknown, callback?: unknown) => unknown;

/**
 * يحقن كتابةً حقيقية بين قراءات `visual_slots` التي يُصدرها ردٌّ واحد.
 *
 * لا يعرف شكل التنفيذ: عبارةٌ واحدة تمرّ كاملةً ثم تقع الكتابة بعدها؛
 * معاملةٌ بعدة عبارات تمرّ أولاها وتُحجز البقية إلى ما بعد الكتابة —
 * فالاختبار يحكم على اتّساق الردّ لا على عدد الاستعلامات.
 */
function interleaveWrite(write: () => Promise<void>) {
  const proto = pg.Client.prototype as unknown as { query: QueryFn };
  const original = proto.query;
  let first = true;
  let writeStarted = false;
  let resolveWritten!: () => void;
  let rejectWritten!: (error: unknown) => void;
  const written = new Promise<void>((resolve, reject) => {
    resolveWritten = resolve;
    rejectWritten = reject;
  });

  const readsSlots = (config: unknown) => {
    const text =
      typeof config === 'string' ? config : (config as { text?: unknown } | null)?.text;
    return (
      typeof text === 'string' && /^\s*(SELECT|WITH)\b/i.test(text) && text.includes('visual_slots')
    );
  };

  const triggerWrite = () => {
    if (writeStarted) return;
    writeStarted = true;
    write().then(resolveWritten, rejectWritten);
  };

  const spy = vi.spyOn(proto, 'query').mockImplementation(function (
    this: pg.Client,
    config: unknown,
    values?: unknown,
    callback?: unknown,
  ) {
    if (!readsSlots(config)) return original.call(this, config, values, callback);

    // `pool.query` يمرّر نداءً راجعاً، وعميل المعاملة يستعمل الوعد — كلاهما يُصان.
    const cb = typeof values === 'function' ? values : callback;
    const args = typeof values === 'function' ? undefined : values;

    if (first) {
      first = false;
      if (typeof cb === 'function') {
        return original.call(this, config, args, (error: unknown, result: unknown) => {
          (cb as (e: unknown, r: unknown) => void)(error, result);
          triggerWrite();
        });
      }
      return (original.call(this, config, args) as Promise<unknown>).then(
        (result) => {
          triggerWrite();
          return result;
        },
        (error) => {
          triggerWrite();
          throw error;
        },
      );
    }

    // قراءةٌ لاحقة: لا تُرسَل إلى القاعدة قبل التزام الكتابة.
    if (typeof cb === 'function') {
      written.then(
        () => original.call(this, config, args, cb),
        (error) => (cb as (e: unknown) => void)(error),
      );
      return undefined;
    }
    return written.then(() => original.call(this, config, args));
  });

  return {
    written,
    restore: () => spy.mockRestore(),
  };
}

describe('[CRITICAL] الردّ العام للرسوم لقطةٌ واحدة', () => {
  let adminToken: string;
  let slotId: string;
  let slotKey: string;
  let permanentUrl: string;
  let temporaryUrl: string;
  let until: string;

  beforeAll(async () => {
    adminToken = await createAdminUser();
    slotKey = `zz_snapshot_slot_${Date.now()}`;
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO visual_slots (slot_key, label, location, group_key)
       VALUES ($1, 'فتحة لقطة', 'موضع اختبار', 'other') RETURNING id`,
      [slotKey],
    );
    slotId = rows[0]!.id;
    permanentUrl = await registerUploadedSlotImage();
    temporaryUrl = await registerUploadedSlotImage();
    until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await api
      .put(`/api/admin/visual-slots/${slotId}/image`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: permanentUrl })
      .expect(200);
    await api
      .put(`/api/admin/visual-slots/${slotId}/temporary-image`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: temporaryUrl, until })
      .expect(200);
  });

  afterAll(async () => {
    await db.query('DELETE FROM visual_slots WHERE id = $1', [slotId]);
  });

  it('كتابةٌ تُلتزم بين قراءات ردٍّ واحد لا تُخرج خليطاً: الفتحات والبصمة والساعة من لقطةٍ واحدة', async () => {
    // الشرط المسبق: مؤقّتتُنا هي الوحيدة السارية، فـ`nextChangeAt` في أي
    // لقطةٍ متّسقة إمّا لحظتُها (وهي معروضة) وإمّا null (وقد أُنهيت).
    const { rows: foreign } = await db.query<{ n: string }>(
      'SELECT COUNT(*)::text AS n FROM visual_slots WHERE temporary_until > now() AND id <> $1',
      [slotId],
    );
    expect(Number(foreign[0]!.n), 'مؤقّتاتٌ سارية من سويتٍ أخرى — بقايا تشغيلٍ منقطع').toBe(0);

    const seam = interleaveWrite(async () => {
      // الكتابة الحقيقية نفسها التي يُصدرها «إنهاء الصورة المؤقّتة الآن».
      expect(await visualsRepo.clearTemporaryImage(db, slotId)).toBe(true);
    });

    let data: PublishedPayload;
    try {
      const res = await api.get('/api/catalog/visuals').expect(200);
      data = res.body.data as PublishedPayload;
      // حدٌّ أعلى للتعليق لا افتراضٌ زمني: قراءةٌ تقفل الصفوف تُعلّق الكتابة.
      await Promise.race([
        seam.written,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('الكتابة المحقونة لم تُلتزم — هل تقفل القراءة الصفوف؟')), 10_000),
        ),
      ]);
    } finally {
      seam.restore();
    }

    // الكتابة وقعت فعلاً (الاختبار ليس فارغاً).
    const { rows: after } = await db.query<{ temporary_image_url: string | null }>(
      'SELECT temporary_image_url FROM visual_slots WHERE id = $1',
      [slotId],
    );
    expect(after[0]!.temporary_image_url).toBeNull();

    const ours = data.slots.find((slot) => slot.slotKey === slotKey);
    expect(ours, 'الفتحة لها صورة دائمة في الحالتين فلا بدّ أن تُرسَل').toBeDefined();
    expect([temporaryUrl, permanentUrl]).toContain(ours!.currentUrl);

    // (١) الفتحات ↔ البصمة: البصمة بصمةُ **هذه** الفتحات لا فتحاتِ لقطةٍ أخرى.
    expect(data.version, 'البصمة حُسبت على حالةٍ غير التي أُرسلت فتحاتُها').toBe(
      contentHash(data.slots),
    );

    // (٢) الفتحات ↔ الساعة: مؤقّتةٌ معروضة ⇒ لحظتُها هي أقرب تغيير؛ مُنهاة ⇒ لا تغيير مجدول.
    if (ours!.currentUrl === temporaryUrl) {
      expect(data.nextChangeAt, 'المؤقّتة معروضة والتطبيق لن يجدول عودة الدائمة').toBe(until);
    } else {
      expect(data.nextChangeAt, 'المؤقّتة أُنهيت والردّ ما يزال يعد بتغييرٍ عند لحظتها').toBeNull();
    }
    expect(Number.isNaN(Date.parse(data.now))).toBe(false);
  });
});
