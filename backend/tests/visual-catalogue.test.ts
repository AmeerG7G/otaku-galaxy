import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser } from './helpers.js';

/**
 * تطابق الفهرس بين القاعدة وكود فلاتر.
 *
 * [CRITICAL] المفتاح عقدٌ بين طرفين لا يعرف أحدهما الآخر: الخادم يرسل
 * `slot_key`، وعنصر `ManagedArtwork` يطلب ثابتاً مكتوباً بيد مطوّر. خطأ
 * حرف واحد لا يُسقط شيئاً ولا يُسجَّل في أي مكان — الفتحة تبدو مضبوطة في
 * اللوحة، والمسؤول يرفع صورة، ولا يتغيّر شيء في التطبيق أبداً. عطلٌ صامت
 * لا يكتشفه إلا من يقارن الملفين بعينه.
 *
 * هذا الاختبار هو تلك المقارنة، مؤتمتة: يقرأ الثوابت من ملف دارت الفعلي
 * ويطابقها بصفوف القاعدة في الاتجاهين.
 */
describe('فهرس الفتحات البصرية — تطابق القاعدة وفلاتر', () => {
  /** يستخرج قيم `static const String x = '...'` من ملف الثوابت. */
  function flutterSlotKeys(): string[] {
    const source = readFileSync(
      new URL('../../lib/features/visuals/domain/visual_slot.dart', import.meta.url),
      'utf8',
    );
    return [...source.matchAll(/static const String \w+ = '([a-z0-9_]+)';/g)].map(
      (match) => match[1]!,
    );
  }

  async function databaseSlotKeys(): Promise<string[]> {
    const { rows } = await db.query<{ slot_key: string }>(
      'SELECT slot_key FROM visual_slots ORDER BY slot_key',
    );
    return rows.map((row) => row.slot_key);
  }

  it('كل مفتاح في فلاتر له صفّ في القاعدة', async () => {
    const inDatabase = new Set(await databaseSlotKeys());
    const missing = flutterSlotKeys().filter((key) => !inDatabase.has(key));
    expect(missing, `مفاتيح في التطبيق بلا صفوف: ${missing.join(', ')}`).toEqual([]);
  });

  it('كل صفّ في القاعدة يقابله مفتاح في فلاتر', async () => {
    const inFlutter = new Set(flutterSlotKeys());
    // فتحة بلا مفتاح في التطبيق هي فتحة يديرها المسؤول ولا تظهر عند أحد.
    const orphaned = (await databaseSlotKeys()).filter((key) => !inFlutter.has(key));
    expect(orphaned, `صفوف بلا مفتاح في التطبيق: ${orphaned.join(', ')}`).toEqual([]);
  });

  it('الفهرس يغطي المواضع الأربعين ونيّفاً المكتشفة في المسح', async () => {
    expect(flutterSlotKeys().length).toBeGreaterThanOrEqual(40);
    expect((await databaseSlotKeys()).length).toBe(flutterSlotKeys().length);
  });

  it('لكل فتحة اسم ووصف موضع ومجموعة — لا صفّ مجهول في اللوحة', async () => {
    const { rows } = await db.query<{
      slot_key: string;
      label: string;
      location: string;
      group_key: string;
    }>('SELECT slot_key, label, location, group_key FROM visual_slots');
    for (const row of rows) {
      expect(row.label.trim(), `${row.slot_key}: بلا اسم`).not.toBe('');
      expect(row.location.trim(), `${row.slot_key}: بلا وصف موضع`).not.toBe('');
      expect(row.group_key, `${row.slot_key}: بلا مجموعة`).not.toBe('other');
    }
  });

  it('[CRITICAL] لا فتحات للشاشات التي تسبق الشبكة', async () => {
    // الشعار وشاشة البداية وشاشة انقطاع الاتصال تُعرض قبل وجود شبكة أو
    // أثناء غيابها. فتحة لأيٍّ منها تعني شاشةً فارغة في أسوأ لحظة ممكنة.
    const forbidden = ['splash', 'offline', 'logo', 'brand'];
    const keys = [...(await databaseSlotKeys()), ...flutterSlotKeys()];
    for (const key of keys) {
      for (const word of forbidden) {
        expect(key.includes(word), `فتحة ممنوعة: ${key}`).toBe(false);
      }
    }
  });

  it('اللوحة تعرض الفهرس مجمَّعاً بمواضعه', async () => {
    const adminToken = await createAdminUser();
    const res = await api
      .get('/api/admin/visual-slots')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const items = res.body.data.items as {
      slotKey: string;
      label: string;
      location: string;
      groupKey: string;
    }[];
    expect(items.length).toBeGreaterThanOrEqual(40);

    const groups = new Set(items.map((item) => item.groupKey));
    // مجموعات حقيقية من مناطق التطبيق، لا قائمة مسطّحة بلا معنى.
    expect(groups.size).toBeGreaterThanOrEqual(8);
    for (const item of items) {
      expect(item.label).not.toBe('');
      expect(item.location).not.toBe('');
    }
  });

  it('الفهرس المزروع لا يغيّر شيئاً في التطبيق ما لم تُرفع صور', async () => {
    // ٤٢ فتحة مزروعة، ومع ذلك ما يصل التطبيق هو الفتحات ذات الصور النشطة
    // وحدها. الزرع للاكتشاف في اللوحة، لا لتغيير أي شاشة.
    const { rows } = await db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM visual_slots s
        WHERE NOT EXISTS (SELECT 1 FROM visual_slot_images i
                           WHERE i.slot_id = s.id AND i.is_active = TRUE)`,
    );
    const withoutImages = Number(rows[0]!.total);

    const published = await api.get('/api/catalog/visuals').expect(200);
    const returned = (published.body.data.slots as unknown[]).length;
    const { rows: totalRows } = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM visual_slots',
    );
    expect(returned).toBe(Number(totalRows[0]!.total) - withoutImages);
  });
});
