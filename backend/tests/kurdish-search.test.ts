import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api } from './helpers.js';

/**
 * [CRITICAL REGRESSION] البحث بالكردية (2026-09-27).
 *
 * العطل: البحث يطابق `products.name` العربي وحده؛ `name_ckb` (مملوء منذ 047)
 * لم يكن في أي مسار بحث، فالبحث بالكردية يعود فارغاً دائماً. والكردية تُكتب
 * بصورٍ متعدّدة للحرف نفسه بحسب لوحة المفاتيح — فحتى المطابقة الحرفية كانت
 * ستفشل بين صورتين صحيحتين.
 *
 * هنا نصوصٌ كما تُخزَّن فعلاً (لا قائمة كلمات) وبحثٌ بكل صورة متكافئة.
 * كل صفٍّ يحمل ختماً فريداً فلا تتداخل النتائج مع بيانات أخرى، ويُحذف بعده.
 */

const STAMP = `KS${Date.now()}`;
const bearerless = api;

let categoryId: string;
let subcategoryId: string;
const productIds: Record<string, string> = {};

async function insertProduct(key: string, name: string, nameCkb: string | null) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO products (name, name_ckb, description, price, category_id, subcategory_id, stock, is_active)
     VALUES ($1, $2, 'وصف', 1000, $3, $4, 5, TRUE) RETURNING id`,
    [name, nameCkb, categoryId, subcategoryId],
  );
  productIds[key] = rows[0]!.id;
}

beforeAll(async () => {
  // قسمٌ وقسمٌ فرعيّ خاصّان بهذه السويت — بأسماء كردية يُبحث بها أيضاً.
  categoryId = (
    await db.query<{ id: string }>(
      `INSERT INTO categories (name, name_ckb, image_url) VALUES ($1, $2, '') RETURNING id`,
      [`قسم بحث ${STAMP}`, `بەشی گەڕان ${STAMP}`],
    )
  ).rows[0]!.id;
  subcategoryId = (
    await db.query<{ id: string }>(
      `INSERT INTO subcategories (category_id, name, name_ckb) VALUES ($1, $2, $3) RETURNING id`,
      [categoryId, `قلائد ${STAMP}`, `ملوانکە ${STAMP}`],
    )
  ).rows[0]!.id;

  // الأسماء الكردية بالصور التي يُدخلها المسؤول فعلاً: ی/ک/ە الكردية،
  // وصورةٌ بلوحة عربية (ي/ك/ه + فاصل صفري بدل ە).
  // البحث «يحتوي» (كما كان): الختم داخل الاسم كي تكون كل عبارة بحثٍ أدناه
  // مقطعاً متّصلاً من الاسم المخزَّن.
  await insertProduct('tshirt', `تيشيرت ${STAMP} جوجوتسو`, `تیشێرتی ${STAMP} جوجوتسو کایسن`);
  await insertProduct('poster', `بوستر أنمي ${STAMP} كبير`, `پۆستەری گەورەی ${STAMP} ئەنیمە`);
  await insertProduct(
    'pencils',
    `أقلام تلوين ${STAMP}`,
    // «قەڵەمی ڕەنگکردن» مكتوبةً بلوحة عربية: ه + ZWNJ مكان ە، وك مكان ک.
    `قه\u200Cڵه\u200Cمی ڕه\u200Cنگكردن ${STAMP}`,
  );
  await insertProduct('arabicOnly', `مجسم ناروتو ${STAMP}`, null);
});

afterAll(async () => {
  await db.query('DELETE FROM products WHERE category_id = $1', [categoryId]);
  await db.query('DELETE FROM subcategories WHERE id = $1', [subcategoryId]);
  await db.query('DELETE FROM categories WHERE id = $1', [categoryId]);
});

async function search(q: string, lang: 'ar' | 'ckb' = 'ckb') {
  const res = await bearerless
    .get('/api/catalog/products/search')
    .set('Accept-Language', lang)
    .query({ q, limit: 50 })
    .expect(200);
  return (res.body.data.items as { id: string; name: string }[])
    .filter((p) => Object.values(productIds).includes(p.id))
    .map((p) => p.id)
    .sort();
}

const ids = (...keys: string[]) => keys.map((k) => productIds[k]!).sort();

describe('[CRITICAL] البحث بالنصّ الكردي المخزَّن', () => {
  it('كلمة كردية من `name_ckb` تجد منتجها — وتُعرض باسمه الكردي', async () => {
    expect(await search(`تیشێرتی ${STAMP} جوجوتسو کایسن`)).toEqual(ids('tshirt'));
    expect(await search(`پۆستەری گەورەی ${STAMP}`)).toEqual(ids('poster'));

    const res = await api
      .get('/api/catalog/products/search')
      .set('Accept-Language', 'ckb')
      .query({ q: `پۆستەری گەورەی ${STAMP}` })
      .expect(200);
    expect(res.body.data.items[0].name).toBe(`پۆستەری گەورەی ${STAMP} ئەنیمە`);
  });

  it('العربية ما زالت تعمل كما كانت', async () => {
    expect(await search(`تيشيرت ${STAMP} جوجوتسو`, 'ar')).toEqual(ids('tshirt'));
    expect(await search(`مجسم ناروتو ${STAMP}`, 'ar')).toEqual(ids('arabicOnly'));
    expect(await search(`بوستر أنمي ${STAMP}`, 'ar')).toEqual(ids('poster'));
  });

  it('[CRITICAL] الصور المتكافئة للحرف نفسه لا تفشل بصمت', async () => {
    // ی (U+06CC) ⇄ ي (U+064A) ⇄ ى (U+0649)
    expect(await search(`تيشێرتي ${STAMP}`)).toEqual(ids('tshirt'));
    // ک (U+06A9) ⇄ ك (U+0643)
    expect(await search(`${STAMP} جوجوتسو كايسن`)).toEqual(ids('tshirt'));
    // ە (U+06D5) ⇄ ه (U+0647) ⇄ ه + ZWNJ — في الاتجاهين.
    expect(await search(`پۆسته\u200Cری گه\u200Cوره\u200Cی ${STAMP}`)).toEqual(ids('poster'));
    expect(await search(`قەڵەمی ڕەنگکردن ${STAMP}`)).toEqual(ids('pencils'));
    // ێ/ۆ/ڵ/ڕ بلوحة عربية لا تملكها: ی/و/ل/ر.
    expect(await search(`پوستەری گەورەی ${STAMP}`)).toEqual(ids('poster'));
    expect(await search(`قەلەمی رەنگکردن ${STAMP}`)).toEqual(ids('pencils'));
    // تطويل وتشكيل ومحارف اتجاه غير مرئية.
    expect(await search(`تیـشـێـرتی ${STAMP}`)).toEqual(ids('tshirt'));
    expect(await search(`\u200Fتیشێرتی\u200F ${STAMP}`)).toEqual(ids('tshirt'));
    expect(await search(`مُجَسَّم ناروتو ${STAMP}`, 'ar')).toEqual(ids('arabicOnly'));
    // الهمزات العربية: أ/إ/آ ⇄ ا.
    expect(await search(`بوستر انمي ${STAMP}`, 'ar')).toEqual(ids('poster'));
    // الأرقام الشرقية في الختم تُطوى إلى الغربية.
    const eastern = STAMP.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]!);
    expect(await search(`تیشێرتی ${eastern}`)).toEqual(ids('tshirt'));
  });

  it('اسم القسم أو القسم الفرعي — بالعربية والكردية — يجد منتجاته', async () => {
    const all = ids('tshirt', 'poster', 'pencils', 'arabicOnly');
    expect(await search(`بەشی گەڕان ${STAMP}`)).toEqual(all);
    expect(await search(`ملوانکە ${STAMP}`)).toEqual(all);
    expect(await search(`قسم بحث ${STAMP}`, 'ar')).toEqual(all);
    expect(await search(`قلائد ${STAMP}`, 'ar')).toEqual(all);
  });

  it('قسمٌ موقوف لا يصير باباً خلفياً في البحث', async () => {
    await db.query('UPDATE categories SET is_active = FALSE WHERE id = $1', [categoryId]);
    try {
      expect(await search(`بەشی گەڕان ${STAMP}`)).toEqual([]);
      // المنتج نفسه ما زال يُوجد باسمه.
      expect(await search(`تیشێرتی ${STAMP}`)).toEqual(ids('tshirt'));
    } finally {
      await db.query('UPDATE categories SET is_active = TRUE WHERE id = $1', [categoryId]);
    }
  });

  it('ما لا يطابق لا يعيد شيئاً — الطيّ لا يوسّع المطابقة عشوائياً', async () => {
    expect(await search(`هودی ${STAMP}`)).toEqual([]);
    expect(await search(`${STAMP}x`)).toEqual([]);
  });

  it('`%` و`_` ما زالا حرفيين بعد الطيّ — ولو بصورتهما العريضة', async () => {
    expect(await search(`% ${STAMP}`)).toEqual([]);
    expect(await search(`\uFF05 ${STAMP}`)).toEqual([]);
    expect(await search(`_ ${STAMP}`)).toEqual([]);
  });
});
