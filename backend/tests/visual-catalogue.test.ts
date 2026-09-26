import { readFileSync, readdirSync } from 'node:fs';
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

  it('[CRITICAL] ثوابت فلاتر == صفوف القاعدة == ما تعرضه اللوحة — المجموعة نفسها حرفياً', async () => {
    // ثلاثة أضلاع لا ضلعان: اللوحة تعرض ما يرسله الخادم، والخادم يرسل صفوف
    // القاعدة، والقاعدة تطابق الثوابت. أي ترشيحٍ في الطريق يظهر هنا.
    const adminToken = await createAdminUser();
    const res = await api
      .get('/api/admin/visual-slots')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    // ترتيبٌ واحد للثلاثة في JS: ترتيب PostgreSQL يتبع ترتيب اللغة لا الرموز.
    const dashboard = (res.body.data.items as { slotKey: string }[]).map((i) => i.slotKey).sort();
    const database = [...(await databaseSlotKeys())].sort();
    const flutter = [...flutterSlotKeys()].sort();
    expect(dashboard).toEqual(database);
    expect(database).toEqual(flutter);
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
    // الشعار وشاشة البداية وشاشة التحديث الإلزامي تُعرض قبل أن يُسمح
    // للتطبيق بالاتصال أصلاً. فتحة لأيٍّ منها تعني شاشةً فارغة في أسوأ
    // لحظة ممكنة. (شاشة انقطاع الاتصال فتحةٌ منذ ٠٥٥: صورتها تُقرأ من ذاكرة
    // القرص والمضمَّن هو بديلها — انظر الاختبار التالي.)
    const forbidden = ['splash', 'logo', 'brand', 'force_update'];
    const keys = [...(await databaseSlotKeys()), ...flutterSlotKeys()];
    for (const key of keys) {
      for (const word of forbidden) {
        expect(key.includes(word), `فتحة ممنوعة: ${key}`).toBe(false);
      }
    }
  });

  it('شاشة انقطاع الاتصال فتحةٌ مستقلّة بمجموعتها — قابلة للتغيير من اللوحة (٠٥٥)', async () => {
    const { rows } = await db.query<{ group_key: string; label: string }>(
      "SELECT group_key, label FROM visual_slots WHERE slot_key = 'offline_gate_character'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.group_key).toBe('connectivity');
    expect(rows[0]!.label).toContain('عدم الاتصال');
    expect(flutterSlotKeys()).toContain('offline_gate_character');
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
    // عشرات الفتحات مزروعة، ومع ذلك ما يصل التطبيق هو الفتحات ذات الصورة
    // وحدها. الزرع للاكتشاف في اللوحة، لا لتغيير أي شاشة.
    const { rows } = await db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM visual_slots WHERE image_url IS NULL`,
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

/**
 * مزامنة الفهرس مع الشاشات **الحالية** — لا مع ما كان.
 *
 * التطابق أعلاه يقارن الثوابت المعلَنة بالصفوف؛ لكنّ ثابتاً يُعلَن ولا يستعمله
 * أي `ManagedArtwork` يمرّ منه بسلام من الجهتين: صفٌّ في اللوحة يرفع إليه
 * المسؤول صورةً لا تظهر في أي شاشة. هكذا بقيت `otp_character` بعد حذف شاشة
 * رمز التحقق. الضلع الثالث هنا: كل ثابت **مستهلَك** فعلاً في `lib/`.
 */
describe('فهرس الفتحات البصرية — مزامنة مع الشاشات الحالية', () => {
  const LIB_DIR = new URL('../../lib/', import.meta.url);
  const SLOTS_FILE = 'features/visuals/domain/visual_slot.dart';

  /** فتحات لشاشات أُزيلت — لا تعود إلى القاعدة ولا إلى الثوابت. */
  // أيقونات التواصل الثلاث أصولٌ ثابتة بقرار منتج (الهجرة ٠٥٣) — لا فتحات.
  // والمفاتيح الأربعة المشتركة جُزّئت بالهجرة ٠٥٤ إلى فتحةٍ لكل موضع؛ عودةُ
  // أيٍّ منها تعني موضعين تحت مفتاحٍ واحد من جديد.
  // بطاقة دعوة الزائر في شاشة الحساب لم تعد تعرض شخصية (الهجرة ٠٦٠ Flutter).
  const RETIRED_SLOT_KEYS = [
    'home_categories_backdrop',
    'otp_character',
    'social_tiktok',
    'social_instagram',
    'social_whatsapp',
    'register_character',
    'forgot_password_character',
    'auth_cta_character',
    'guest_prompt_character',
    'account_character',
  ];

  /** الفتحات التي وُلدت من التجزئة — موضعٌ واحد لكل مفتاح. */
  const SPLIT_SLOT_KEYS = [
    'register_header_character',
    'register_pending_character',
    'forgot_password_header_character',
    'forgot_password_pending_character',
    'login_cta_character',
    'register_cta_character',
    'forgot_password_cta_character',
    'cart_guest_prompt_character',
    'favorites_guest_prompt_character',
  ];

  /** ملفات دارت بنصّها الكامل وبنصّها **بلا تعليقات** — التعليق يذكر مفتاحاً للشرح لا للاستهلاك. */
  function dartFiles(): { path: string; source: string; code: string }[] {
    return readdirSync(LIB_DIR, { recursive: true, encoding: 'utf8' })
      .filter((rel) => rel.endsWith('.dart'))
      .map((rel) => {
        const source = readFileSync(new URL(rel, LIB_DIR), 'utf8');
        const code = source
          .split('\n')
          .filter((line) => !line.trimStart().startsWith('//'))
          .join('\n');
        return { path: rel, source, code };
      });
  }

  /** `اسم الثابت → قيمته` من ملف الثوابت. */
  function flutterSlotConstants(): Map<string, string> {
    const source = readFileSync(new URL(SLOTS_FILE, LIB_DIR), 'utf8');
    return new Map(
      [...source.matchAll(/static const String (\w+) = '([a-z0-9_]+)';/g)].map((m) => [
        m[1]!,
        m[2]!,
      ]),
    );
  }

  it('[CRITICAL] كل ثابت في VisualSlots يستهلكه موضع حقيقي في lib/ — لا فتحة لشاشة محذوفة', () => {
    const consumers = dartFiles().filter((file) => !file.path.endsWith(SLOTS_FILE));
    const unused = [...flutterSlotConstants().keys()].filter(
      (name) => !consumers.some((file) => new RegExp(`\\bVisualSlots\\.${name}\\b`).test(file.code)),
    );
    // `legacy/` خارج `lib/` عمداً: ملفٌ محفوظ للتاريخ لا يُبقي فتحةً حيّة.
    expect(unused, `ثوابت بلا مستهلِك: ${unused.join(', ')}`).toEqual([]);
  });

  it('الفتحات المتقاعدة غائبة عن القاعدة وعن الثوابت معاً', async () => {
    const { rows } = await db.query<{ slot_key: string }>(
      'SELECT slot_key FROM visual_slots WHERE slot_key = ANY($1)',
      [RETIRED_SLOT_KEYS],
    );
    expect(rows.map((r) => r.slot_key)).toEqual([]);
    const declared = new Set(flutterSlotConstants().values());
    expect(RETIRED_SLOT_KEYS.filter((key) => declared.has(key))).toEqual([]);
  });

  it('كل مجموعة في القاعدة تعرفها اللوحة بالاسم والترتيب — لا صفّ تحت مفتاح خام', async () => {
    const admin = readFileSync(new URL('../../admin/src/types/visuals.ts', import.meta.url), 'utf8');
    const order = [...admin.match(/export const GROUP_ORDER = \[([\s\S]*?)\]/)![1]!.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]!);
    const labels = [...admin.match(/export const GROUP_LABELS[^{]*\{([\s\S]*?)\n\}/)![1]!.matchAll(/^\s*([a-z0-9_]+):/gm)].map((m) => m[1]!);

    const { rows } = await db.query<{ group_key: string }>(
      'SELECT DISTINCT group_key FROM visual_slots ORDER BY group_key',
    );
    for (const { group_key } of rows) {
      expect(order, `مجموعة بلا ترتيب في اللوحة: ${group_key}`).toContain(group_key);
      expect(labels, `مجموعة بلا اسم في اللوحة: ${group_key}`).toContain(group_key);
    }
  });

  it('[CRITICAL] كل فتحةٍ يستهلكها ملفٌ واحد في lib/ — موضعٌ واحد = فتحةٌ واحدة', () => {
    // الفتحة موضعٌ لا شخصية: مفتاحٌ يذكره ملفان هو موضعان تحت مفتاحٍ واحد،
    // فيبدّل المسؤول شاشةً فتتغيّر أخرى. (تفصيل «موضعٌ واحد بسطرين» —
    // كالبنر الرئيسي وبطاقات الترويج — يحرسه اختبار فلاتر
    // `visual_slot_contract_test.dart`؛ هنا الضلع الخادمي: ملفٌ واحد.)
    const consumers = new Map<string, string[]>();
    for (const [name] of flutterSlotConstants()) {
      consumers.set(
        name,
        dartFiles()
          .filter((file) => !file.path.endsWith(SLOTS_FILE))
          .filter((file) => new RegExp(`\\bVisualSlots\\.${name}\\b`).test(file.code))
          .map((file) => file.path)
          .sort(),
      );
    }
    const shared = [...consumers].filter(([, files]) => files.length !== 1);
    expect(shared, `فتحات بأكثر من ملفٍ مستهلك: ${JSON.stringify(shared)}`).toEqual([]);
  });

  it('[CRITICAL] فتحات التجزئة موجودة في القاعدة وفي الثوابت، ولا وصف يعدّد شاشات', async () => {
    const declared = new Set(flutterSlotConstants().values());
    const { rows } = await db.query<{ slot_key: string; location: string; label: string }>(
      'SELECT slot_key, location, label FROM visual_slots',
    );
    const inDatabase = new Map(rows.map((r) => [r.slot_key, r]));
    for (const key of SPLIT_SLOT_KEYS) {
      expect(declared.has(key), `${key} غير معلَن في فلاتر`).toBe(true);
      expect(inDatabase.has(key), `${key} بلا صفّ`).toBe(true);
    }
    // «تُستخدم في:» كان علامة الفتحة المشتركة — لم يعد لها موضع.
    for (const row of rows) {
      expect(row.location, row.slot_key).not.toContain('تُستخدم في');
    }
    // وصفُ كل فتحة تجزئة يسمّي شاشتها هي وحدها.
    const expectScreen: Record<string, RegExp> = {
      register_header_character: /إنشاء الحساب/,
      register_pending_character: /بانتظار الموافقة.*إنشاء الحساب/,
      forgot_password_header_character: /استعادة كلمة المرور/,
      forgot_password_pending_character: /بانتظار الموافقة.*استعادة كلمة المرور/,
      login_cta_character: /تسجيل الدخول/,
      register_cta_character: /إنشاء الحساب/,
      forgot_password_cta_character: /استعادة كلمة المرور/,
      cart_guest_prompt_character: /السلة/,
      favorites_guest_prompt_character: /المفضلة/,
    };
    for (const [key, pattern] of Object.entries(expectScreen)) {
      expect(inDatabase.get(key)!.location, key).toMatch(pattern);
    }
    expect(inDatabase.get('cart_guest_prompt_character')!.location).not.toMatch(/المفضلة/);
    expect(inDatabase.get('favorites_guest_prompt_character')!.location).not.toMatch(/السلة/);
    expect(inDatabase.get('login_cta_character')!.location).not.toMatch(/إنشاء الحساب|استعادة/);
  });

  it('الوصف الذي كان يخالف الكود صُحّح: فتحة «القسم بلا منتجات» ليست ترويسة', async () => {
    // ترويسة شاشة منتجات القسم متدرّجة بلا رسم؛ المستهلك الوحيد للفتحة هو
    // حالة «لا منتجات في القسم كلّه» (`category_products_screen.dart`).
    const screen = dartFiles().find((f) => f.path.endsWith('category_products_screen.dart'))!;
    expect(screen.source).toMatch(/OtakuScreenHeader\.gradient\(/);
    expect(screen.source).not.toMatch(/OtakuScreenHeader\.gradient\([^;]*artworkSlot/);
    const { rows } = await db.query<{ location: string }>(
      `SELECT location FROM visual_slots WHERE slot_key = 'category_products_header_character'`,
    );
    expect(rows[0]!.location).toContain('لا منتجات');
    expect(rows[0]!.location).not.toContain('الترويسة');
  });

  it('الشخصيات التي تحجبها صورة البنر تقول ذلك في وصفها', async () => {
    // اللوحة الرئيسية وبطاقات الترويج تعرض صورة البنر إن وُجدت؛ الشخصية
    // تظهر حين لا صورة. مسؤولٌ يبدّل الشخصية ولا يراها يجب أن يعرف السبب.
    const home = readFileSync(
      new URL('features/home/presentation/widgets/home_compositions.dart', LIB_DIR),
      'utf8',
    );
    expect(home).toMatch(/imageUrl != null\s*\?\s*Image\.network/);
    const { rows } = await db.query<{ slot_key: string; location: string }>(
      `SELECT slot_key, location FROM visual_slots WHERE slot_key LIKE 'home\_%' ESCAPE '\\'
          AND slot_key <> 'home_delivery_character'`,
    );
    expect(rows.length).toBe(3);
    for (const row of rows) expect(row.location, row.slot_key).toContain('حين لا صورة');
  });
});
