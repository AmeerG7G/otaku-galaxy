import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { pickLocalizedEither } from '../src/utils/locale.js';
import { api, createAdminUser, registerAndLogin } from './helpers.js';

/**
 * [CRITICAL] نصّ البنر بلغتين (067): عنوانٌ وسطرٌ ثانٍ بالعربية، ومثلهما بالكردية.
 *
 * ما يُثبَّت هنا، بالمسار الحقيقي (HTTP ← خدمة ← PostgreSQL):
 *   ١. الإنشاء يحفظ كل لغةٍ في عمودها كما كُتبت (يونيكود كامل).
 *   ٢. التعديل لغةً بلغة: العربية لا تلمس الكردية ولا العكس.
 *   ٣. الـAPI يُخرج اللغتين صريحتين، و`title`/`subtitle` اختيارهما بلغة الطلب.
 *   ٤. الاحتياط متناظر: الكردية الناقصة ← العربية، والعربية الناقصة ← الكردية —
 *      عرضاً فقط، والعمود الناقص يبقى ناقصاً.
 *   ٥. البنرات القائمة (عربية وحدها) تبقى صالحة، والهجرة لا تمسّ عربيّها.
 *   ٦. الحدود: الأطوال، النوع، المفتاحان القديمان، وقيد «لا فراغ» في القاعدة.
 *   ٧. الصلاحيات: الزبون لا يكتب نصّ بنر.
 *
 * نصّ البنر اختياريٌّ باللغتين كما كان قبل الفصل — بنرٌ بصورةٍ وحدها مشروع.
 */

const STAMP = `BB${Date.now()}`;
// محرفٌ غير مرئي يكتبه لوح المفاتيح الكردي (ZWNJ) — يجب أن يُحفظ كما هو.
const ZWNJ = String.fromCharCode(0x200c);
const IMAGE = '/uploads/banner/test/bilingual.png';

const CONTENT = {
  titleAr: `عنوان عربي تجريبي ${STAMP}`,
  subtitleAr: `نص عربي تجريبي ${STAMP}`,
  titleCkb: `ناونیشانی تاقیکردنەوە ${STAMP}`,
  subtitleCkb: `دەقی تاقیکردنەوە${ZWNJ}ی ${STAMP}`,
};

type BannerJson = {
  id: string;
  imageUrl: string;
  title: string | null;
  subtitle: string;
  titleAr: string | null;
  subtitleAr: string | null;
  titleCkb: string | null;
  subtitleCkb: string | null;
};

let adminToken: string;
let customerToken: string;
const createdIds: string[] = [];

const A = () => ({ Authorization: `Bearer ${adminToken}` });

async function createBanner(body: Record<string, unknown>) {
  const res = await api
    .post('/api/admin/banners')
    .set(A())
    .send({ imageUrl: IMAGE, destinationType: 'none', placement: 'promo', ...body });
  if (res.status === 201) createdIds.push(res.body.data.id as string);
  return res;
}

async function dbText(id: string) {
  const { rows } = await db.query<{
    image_url: string;
    title: string | null;
    subtitle: string;
    title_ckb: string | null;
    subtitle_ckb: string | null;
  }>('SELECT image_url, title, subtitle, title_ckb, subtitle_ckb FROM banners WHERE id = $1', [id]);
  return rows[0]!;
}

/** البنر كما تعيده الرئيسية بلغة الطلب — من القائمة العامة والشريط الترويجي. */
async function homeBanner(id: string, lang: 'ar' | 'ckb') {
  const res = await api.get('/api/catalog/home').set('Accept-Language', lang).expect(200);
  const inList = (res.body.data.banners as BannerJson[]).find((b) => b.id === id);
  const inPromo = (res.body.data.promoBanners as BannerJson[]).find((b) => b.id === id);
  expect(inList).toBeDefined();
  expect(inPromo).toEqual(inList);
  return inList!;
}

async function adminBanner(id: string) {
  const res = await api.get('/api/admin/banners').set(A()).expect(200);
  return (res.body.data.items as BannerJson[]).find((b) => b.id === id)!;
}

/** بنرٌ «قديم»: عنوانٌ وسطرٌ عربيان وحدهما، كما كانت البنرات قبل 067 — إدراجٌ مباشر. */
async function insertLegacyBanner(title: string | null, subtitle = '') {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO banners (image_url, title, subtitle, destination_type, placement, sort_order)
     VALUES ($1, $2, $3, 'none', 'promo',
             (SELECT COALESCE(max(sort_order), -1) + 1 FROM banners WHERE placement = 'promo'))
     RETURNING id`,
    [IMAGE, title, subtitle],
  );
  createdIds.push(rows[0]!.id);
  return rows[0]!.id;
}

beforeAll(async () => {
  adminToken = await createAdminUser();
  customerToken = (await registerAndLogin()).token;
});

afterAll(async () => {
  if (createdIds.length === 0) return;
  await db.query('DELETE FROM banners WHERE id = ANY($1::uuid[])', [createdIds]);
});

// ═══════════════════════════════════════════════════════════════════════
// ١ · الإنشاء
// ═══════════════════════════════════════════════════════════════════════

describe('إنشاء بنر بلغتين', () => {
  it('يُنشأ بالعربية والكردية ويُحفظ كل حقلٍ في عموده — واليونيكود الكردي كما كُتب', async () => {
    const res = await createBanner({ ...CONTENT });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject(CONTENT);
    expect(res.body.data.subtitleCkb).toContain(ZWNJ);

    expect(await dbText(res.body.data.id)).toMatchObject({
      title: CONTENT.titleAr,
      subtitle: CONTENT.subtitleAr,
      title_ckb: CONTENT.titleCkb,
      subtitle_ckb: CONTENT.subtitleCkb,
    });
    // لوحة التحكم تقرأ الأربعة نفسها بعد إعادة التحميل.
    expect(await adminBanner(res.body.data.id)).toMatchObject(CONTENT);
  });

  it('النصّ اختياريٌّ باللغتين كما كان: بنرٌ بصورةٍ وحدها يُنشأ بلا نصّ مختلَق', async () => {
    const res = await createBanner({});
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: null,
      subtitle: '',
      titleAr: null,
      subtitleAr: null,
      titleCkb: null,
      subtitleCkb: null,
    });
    expect(await dbText(res.body.data.id)).toMatchObject({
      title: null,
      subtitle: '',
      title_ckb: null,
      subtitle_ckb: null,
    });
  });

  it('الفراغ والمسافات وحدها = لا نصّ: تُحفظ NULL لا سطراً فارغاً، والقيم تُقصّ', async () => {
    const res = await createBanner({
      titleAr: `  عنوان مقصوص ${STAMP}  `,
      subtitleAr: '   ',
      titleCkb: '   ',
      subtitleCkb: '',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      titleAr: `عنوان مقصوص ${STAMP}`,
      subtitleAr: null,
      titleCkb: null,
      subtitleCkb: null,
    });
    expect(await dbText(res.body.data.id)).toMatchObject({
      title: `عنوان مقصوص ${STAMP}`,
      subtitle: '',
      title_ckb: null,
      subtitle_ckb: null,
    });
  });

  it('لا ترجمة ولا نسخ: الكردية الغائبة تبقى غائبة ولا تُملأ من العربية', async () => {
    const res = await createBanner({ titleAr: `عربي وحده ${STAMP}`, subtitleAr: 'سطر عربي' });
    expect(res.status).toBe(201);
    const row = await dbText(res.body.data.id);
    expect(row.title_ckb).toBeNull();
    expect(row.subtitle_ckb).toBeNull();
  });

  it('النصّ نصٌّ لا وسوم: يُحفظ ويُعاد حرفياً (العارضان — React وText — لا يفسّران HTML)', async () => {
    const markup = `<b>عرض</b><script>alert(1)</script> ${STAMP}`;
    const res = await createBanner({ titleCkb: markup });
    expect(res.status).toBe(201);
    expect(res.body.data.titleCkb).toBe(markup);
    expect((await dbText(res.body.data.id)).title_ckb).toBe(markup);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ٢ · التعديل لغةً بلغة
// ═══════════════════════════════════════════════════════════════════════

describe('[CRITICAL] تعديل بنر — كل لغةٍ مستقلة', () => {
  let id: string;

  beforeAll(async () => {
    const res = await createBanner({ ...CONTENT });
    expect(res.status).toBe(201);
    id = res.body.data.id;
  });

  it('تعديل العربية وحدها لا يلمس الكردية', async () => {
    const res = await api
      .patch(`/api/admin/banners/${id}`)
      .set(A())
      .send({ titleAr: `عنوان عربي معدَّل ${STAMP}`, subtitleAr: `نص عربي معدَّل ${STAMP}` })
      .expect(200);
    expect(res.body.data).toMatchObject({
      titleAr: `عنوان عربي معدَّل ${STAMP}`,
      subtitleAr: `نص عربي معدَّل ${STAMP}`,
      titleCkb: CONTENT.titleCkb,
      subtitleCkb: CONTENT.subtitleCkb,
    });
    expect(await dbText(id)).toMatchObject({
      title: `عنوان عربي معدَّل ${STAMP}`,
      subtitle: `نص عربي معدَّل ${STAMP}`,
      title_ckb: CONTENT.titleCkb,
      subtitle_ckb: CONTENT.subtitleCkb,
    });
  });

  it('تعديل الكردية وحدها لا يلمس العربية', async () => {
    await api
      .patch(`/api/admin/banners/${id}`)
      .set(A())
      .send({ titleCkb: `ناونیشانی نوێ ${STAMP}`, subtitleCkb: `دەقی نوێ ${STAMP}` })
      .expect(200);
    expect(await dbText(id)).toMatchObject({
      title: `عنوان عربي معدَّل ${STAMP}`,
      subtitle: `نص عربي معدَّل ${STAMP}`,
      title_ckb: `ناونیشانی نوێ ${STAMP}`,
      subtitle_ckb: `دەقی نوێ ${STAMP}`,
    });
  });

  it('حقلٌ واحد من لغةٍ واحدة لا يلمس الحقول الثلاثة الأخرى', async () => {
    await api.patch(`/api/admin/banners/${id}`).set(A()).send({ subtitleCkb: `سطری تر ${STAMP}` }).expect(200);
    expect(await dbText(id)).toMatchObject({
      title: `عنوان عربي معدَّل ${STAMP}`,
      subtitle: `نص عربي معدَّل ${STAMP}`,
      title_ckb: `ناونیشانی نوێ ${STAMP}`,
      subtitle_ckb: `سطری تر ${STAMP}`,
    });
  });

  it('null صريحة تمسح نصّ تلك اللغة وحدها', async () => {
    await api.patch(`/api/admin/banners/${id}`).set(A()).send({ titleCkb: null }).expect(200);
    const row = await dbText(id);
    expect(row.title_ckb).toBeNull();
    expect(row.title).toBe(`عنوان عربي معدَّل ${STAMP}`);
    expect(row.subtitle_ckb).toBe(`سطری تر ${STAMP}`);

    await api.patch(`/api/admin/banners/${id}`).set(A()).send({ subtitleAr: null }).expect(200);
    const after = await dbText(id);
    expect(after.subtitle).toBe('');
    expect(after.subtitle_ckb).toBe(`سطری تر ${STAMP}`);
  });

  it('تعديل الصورة وحدها يُبقي النصوص الأربعة كما هي', async () => {
    const before = await dbText(id);
    await api
      .patch(`/api/admin/banners/${id}`)
      .set(A())
      .send({ imageUrl: '/uploads/banner/test/bilingual-2.png' })
      .expect(200);
    const after = await dbText(id);
    expect(after.image_url).toBe('/uploads/banner/test/bilingual-2.png');
    expect({ ...after, image_url: undefined }).toEqual({ ...before, image_url: undefined });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ٣ · القراءة بلغة الطلب
// ═══════════════════════════════════════════════════════════════════════

describe('الرئيسية تُخرج اللغتين صريحتين وتحسم title/subtitle بلغة الطلب', () => {
  let id: string;

  beforeAll(async () => {
    const res = await createBanner({ ...CONTENT });
    expect(res.status).toBe(201);
    id = res.body.data.id;
  });

  it('العربية ← النصّ العربي، والكردية ← النصّ الكردي، والأربعة الصريحة في الحالتين', async () => {
    const ar = await homeBanner(id, 'ar');
    expect(ar).toMatchObject({ ...CONTENT, title: CONTENT.titleAr, subtitle: CONTENT.subtitleAr });

    const ckb = await homeBanner(id, 'ckb');
    expect(ckb).toMatchObject({ ...CONTENT, title: CONTENT.titleCkb, subtitle: CONTENT.subtitleCkb });
  });

  it('لوحة البطل (heroBanner) تمرّ بالحسم نفسه', async () => {
    // موضع البطل لهذه السويت وحدها — كما في `banner-reorder.test.ts`.
    await db.query(`DELETE FROM banners WHERE placement = 'hero'`);
    const res = await createBanner({ ...CONTENT, placement: 'hero', sortOrder: 0 });
    expect(res.status).toBe(201);

    const ar = await api.get('/api/catalog/home').set('Accept-Language', 'ar').expect(200);
    expect(ar.body.data.heroBanner).toMatchObject({
      id: res.body.data.id,
      title: CONTENT.titleAr,
      subtitle: CONTENT.subtitleAr,
      titleCkb: CONTENT.titleCkb,
    });
    const ckb = await api.get('/api/catalog/home').set('Accept-Language', 'ckb').expect(200);
    expect(ckb.body.data.heroBanner).toMatchObject({
      id: res.body.data.id,
      title: CONTENT.titleCkb,
      subtitle: CONTENT.subtitleCkb,
      titleAr: CONTENT.titleAr,
    });
  });

  it('لوحة التحكم عربيةٌ مثبَّتة: title/subtitle فيها العمودان العربيان مهما كانت ترويسة اللغة', async () => {
    const res = await api.get('/api/admin/banners').set(A()).set('Accept-Language', 'ckb').expect(200);
    const row = (res.body.data.items as BannerJson[]).find((b) => b.id === id)!;
    expect(row).toMatchObject({ ...CONTENT, title: CONTENT.titleAr, subtitle: CONTENT.subtitleAr });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ٤ · الاحتياط
// ═══════════════════════════════════════════════════════════════════════

describe('[CRITICAL] الاحتياط متناظر، وللعرض وحده', () => {
  it('الكردية ناقصة ← العربية تُعرض في الواجهة الكردية، والكردية تبقى null صريحة', async () => {
    const res = await createBanner({ titleAr: `عربي فقط ${STAMP}`, subtitleAr: `سطر عربي فقط ${STAMP}` });
    const ckb = await homeBanner(res.body.data.id, 'ckb');
    expect(ckb).toMatchObject({
      title: `عربي فقط ${STAMP}`,
      subtitle: `سطر عربي فقط ${STAMP}`,
      titleCkb: null,
      subtitleCkb: null,
    });
  });

  it('العربية ناقصة ← الكردية تُعرض في الواجهة العربية، والعربية تبقى null صريحة', async () => {
    const res = await createBanner({ titleCkb: `کوردی تەنها ${STAMP}`, subtitleCkb: `دەقی کوردی ${STAMP}` });
    const ar = await homeBanner(res.body.data.id, 'ar');
    expect(ar).toMatchObject({
      title: `کوردی تەنها ${STAMP}`,
      subtitle: `دەقی کوردی ${STAMP}`,
      titleAr: null,
      subtitleAr: null,
    });
  });

  it('الاحتياط لكل حقلٍ على حدة: عنوانٌ كردي حاضر وسطرٌ كردي ناقص', async () => {
    const res = await createBanner({
      titleAr: `عنوان ${STAMP}`,
      subtitleAr: `سطر ${STAMP}`,
      titleCkb: `ناونیشان ${STAMP}`,
    });
    const ckb = await homeBanner(res.body.data.id, 'ckb');
    expect(ckb.title).toBe(`ناونیشان ${STAMP}`);
    expect(ckb.subtitle).toBe(`سطر ${STAMP}`);
  });

  it('بلا نصٍّ بأي لغة: title null وsubtitle فارغ — التطبيق يعرض نصّه الافتراضي', async () => {
    const res = await createBanner({});
    for (const lang of ['ar', 'ckb'] as const) {
      const banner = await homeBanner(res.body.data.id, lang);
      expect(banner.title).toBeNull();
      expect(banner.subtitle).toBe('');
    }
  });

  it('[CRITICAL] الاحتياط لا يُكتب: العمود الناقص يبقى NULL بعد القراءة بكلتا اللغتين', async () => {
    const res = await createBanner({ titleAr: `لا يُنسخ ${STAMP}` });
    await homeBanner(res.body.data.id, 'ckb');
    await homeBanner(res.body.data.id, 'ar');
    const row = await dbText(res.body.data.id);
    expect(row.title_ckb).toBeNull();
    expect(row.subtitle_ckb).toBeNull();
    expect((await adminBanner(res.body.data.id)).titleCkb).toBeNull();
  });

  it.each([
    // [عربي, كردي, لغة, المتوقع]
    ['ع', 'ک', 'ar', 'ع'],
    ['ع', 'ک', 'ckb', 'ک'],
    ['ع', null, 'ckb', 'ع'],
    [null, 'ک', 'ar', 'ک'],
    ['  ', 'ک', 'ar', 'ک'],
    ['ع', '   ', 'ckb', 'ع'],
    ['', '', 'ar', null],
    [null, null, 'ckb', null],
  ] as const)('pickLocalizedEither(%j, %j, %s) = %j', (ar, ckb, locale, expected) => {
    expect(pickLocalizedEither(ar, ckb, locale)).toBe(expected);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ٥ · البنرات القائمة والهجرة
// ═══════════════════════════════════════════════════════════════════════

describe('البنرات القائمة تبقى صالحة', () => {
  it('بنرٌ قديم عربيٌّ وحده: يُقرأ بلا كردية مختلَقة، ويُعرض عربياً في اللغتين', async () => {
    const id = await insertLegacyBanner(`بنر قديم ${STAMP}`, `سطر قديم ${STAMP}`);
    expect(await adminBanner(id)).toMatchObject({
      title: `بنر قديم ${STAMP}`,
      titleAr: `بنر قديم ${STAMP}`,
      subtitleAr: `سطر قديم ${STAMP}`,
      titleCkb: null,
      subtitleCkb: null,
    });
    for (const lang of ['ar', 'ckb'] as const) {
      expect(await homeBanner(id, lang)).toMatchObject({
        title: `بنر قديم ${STAMP}`,
        subtitle: `سطر قديم ${STAMP}`,
      });
    }
  });

  it('المسؤول يضيف الكردية لاحقاً لبنرٍ قديم — والعربية كما كانت', async () => {
    const id = await insertLegacyBanner(`بنر قديم ٢ ${STAMP}`);
    await api
      .patch(`/api/admin/banners/${id}`)
      .set(A())
      .send({ titleCkb: `بانەری کۆن ${STAMP}` })
      .expect(200);
    expect(await dbText(id)).toMatchObject({
      title: `بنر قديم ٢ ${STAMP}`,
      subtitle: '',
      title_ckb: `بانەری کۆن ${STAMP}`,
      subtitle_ckb: null,
    });
    expect((await homeBanner(id, 'ckb')).title).toBe(`بانەری کۆن ${STAMP}`);
    expect((await homeBanner(id, 'ar')).title).toBe(`بنر قديم ٢ ${STAMP}`);
  });

  it('[CRITICAL] الهجرة 067 على بنراتٍ قائمة: العربية لا تُمسّ، والكردية لا تُختلق، والفراغ يصير NULL', async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const sql = await readFile(
      path.resolve(here, '../src/database/migrations/067_bilingual_banner_content.sql'),
      'utf8',
    );
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      // إعادة الجدول إلى حاله قبل 067 داخل معاملةٍ تُرجَع — نمط اختبار 051/061.
      await client.query(`ALTER TABLE banners DROP CONSTRAINT banners_title_ckb_not_blank`);
      await client.query(`ALTER TABLE banners DROP CONSTRAINT banners_subtitle_ckb_not_blank`);
      await client.query(`ALTER TABLE banners DROP COLUMN subtitle_ckb`);

      const legacy = [
        // [title, subtitle, title_ckb]
        [`موسم جديد ${STAMP}`, `تشكيلة جديدة ${STAMP}`, null],
        [`عنوان بكردية 047 ${STAMP}`, '', `وەرزێکی نوێ ${STAMP}`],
        [`عنوان بكردية فارغة ${STAMP}`, '', '   '],
        [null, '', null],
        ['', '', ''],
      ] as const;
      const ids: string[] = [];
      for (const [title, subtitle, titleCkb] of legacy) {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO banners (image_url, title, subtitle, title_ckb, destination_type, placement, is_active)
           VALUES ($1, $2, $3, $4, 'none', 'promo', FALSE) RETURNING id`,
          [IMAGE, title, subtitle, titleCkb],
        );
        ids.push(rows[0]!.id);
      }
      const { rows: countBefore } = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM banners',
      );

      await client.query(sql);

      const { rows } = await client.query<{
        id: string;
        image_url: string;
        title: string | null;
        subtitle: string;
        title_ckb: string | null;
        subtitle_ckb: string | null;
      }>(
        `SELECT id, image_url, title, subtitle, title_ckb, subtitle_ckb
           FROM banners WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      const byId = new Map(rows.map((r) => [r.id, r]));
      legacy.forEach(([title, subtitle, titleCkb], index) => {
        const row = byId.get(ids[index]!)!;
        expect(row.title).toBe(title);
        expect(row.subtitle).toBe(subtitle);
        expect(row.image_url).toBe(IMAGE);
        expect(row.subtitle_ckb).toBeNull();
        expect(row.title_ckb).toBe(titleCkb !== null && titleCkb.trim() !== '' ? titleCkb : null);
      });
      const { rows: countAfter } = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM banners',
      );
      expect(countAfter[0]!.n).toBe(countBefore[0]!.n);

      // القيدان يصدقان على كل صفٍّ قائم، ويرفضان الفراغ من الآن.
      await client.query('SAVEPOINT blank');
      await expect(
        client.query(`UPDATE banners SET subtitle_ckb = '  ' WHERE id = $1`, [ids[0]]),
      ).rejects.toMatchObject({ code: '23514', constraint: 'banners_subtitle_ckb_not_blank' });
      await client.query('ROLLBACK TO SAVEPOINT blank');
      // تعديلٌ لاحق على بنرٍ قديم (إيقاف/ترتيب) لا يصطدم بالقيدين.
      await client.query(`UPDATE banners SET is_active = FALSE, sort_order = 5 WHERE id = ANY($1::uuid[])`, [ids]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ٦ · الحدود
// ═══════════════════════════════════════════════════════════════════════

describe('حدود نصّ البنر', () => {
  it.each([
    ['titleAr', 121, 'عنوان البنر بالعربية طويل جداً (120 حرفاً كحد أقصى)'],
    ['titleCkb', 121, 'عنوان البنر بالكردية طويل جداً (120 حرفاً كحد أقصى)'],
    ['subtitleAr', 161, 'السطر الثاني بالعربية طويل جداً (160 حرفاً كحد أقصى)'],
    ['subtitleCkb', 161, 'السطر الثاني بالكردية طويل جداً (160 حرفاً كحد أقصى)'],
  ] as const)('%s بطول %i يُرفض برسالةٍ تسمّي الحقل ولغته — ولا يُنشأ شيء', async (field, length, message) => {
    const { rows: before } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM banners');
    const res = await createBanner({ [field]: 'ب'.repeat(length) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toBe(message);
    const { rows: after } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM banners');
    expect(after[0]!.n).toBe(before[0]!.n);
  });

  it('الحدّ نفسه مقبول: 120 للعنوان و160 للسطر بكل لغة', async () => {
    const res = await createBanner({
      titleAr: 'ع'.repeat(120),
      titleCkb: 'ک'.repeat(120),
      subtitleAr: 'س'.repeat(160),
      subtitleCkb: 'ێ'.repeat(160),
    });
    expect(res.status).toBe(201);
  });

  it.each([['titleCkb', 42], ['subtitleAr', true], ['titleAr', { ar: 'x' }], ['subtitleCkb', ['x']]] as const)(
    '%s بنوعٍ غير نصّي (%j) يُرفض',
    async (field, value) => {
      const res = await createBanner({ [field]: value });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/يجب أن يكون نصاً$/);
    },
  );

  it('[CRITICAL] المفتاحان القديمان title/subtitle يُرفضان صراحةً في الإنشاء والتعديل — لا حفظ كاذب', async () => {
    const created = await createBanner({ title: 'قديم' });
    expect(created.status).toBe(400);
    expect(created.body.message).toContain('titleAr');

    const res = await createBanner({ titleAr: `ثابت ${STAMP}` });
    const id = res.body.data.id as string;
    const patched = await api.patch(`/api/admin/banners/${id}`).set(A()).send({ subtitle: 'قديم' });
    expect(patched.status).toBe(400);
    expect(patched.body.message).toContain('subtitleAr');
    expect(await dbText(id)).toMatchObject({ title: `ثابت ${STAMP}`, subtitle: '' });
  });

  it('قيد القاعدة يرفض الكردية الفارغة حتى لو تجاوز كاتبٌ الـAPI', async () => {
    const res = await createBanner({ titleAr: `قيد ${STAMP}` });
    for (const column of ['title_ckb', 'subtitle_ckb']) {
      await expect(
        db.query(`UPDATE banners SET ${column} = '   ' WHERE id = $1`, [res.body.data.id]),
      ).rejects.toMatchObject({ code: '23514' });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ٧ · الصلاحيات
// ═══════════════════════════════════════════════════════════════════════

describe('الصلاحيات — كتابة نصّ البنر للمسؤول وحده', () => {
  it('الزبون وغير المصادَق لا يُنشئان ولا يعدّلان، والنصّ لا يتغيّر', async () => {
    const res = await createBanner({ ...CONTENT });
    const id = res.body.data.id as string;

    const asCustomer = { Authorization: `Bearer ${customerToken}` };
    expect(
      (await api.post('/api/admin/banners').set(asCustomer).send({ imageUrl: IMAGE, ...CONTENT })).status,
    ).toBe(403);
    expect(
      (await api.patch(`/api/admin/banners/${id}`).set(asCustomer).send({ titleCkb: 'دەستکاری' })).status,
    ).toBe(403);
    expect((await api.patch(`/api/admin/banners/${id}`).send({ titleAr: 'تعديل' })).status).toBe(401);

    expect(await dbText(id)).toMatchObject({
      title: CONTENT.titleAr,
      title_ckb: CONTENT.titleCkb,
    });
  });
});
