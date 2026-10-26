import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { GALAXY_LEVELS, rewardLabelFor } from '../src/domain/galaxyPoints.js';
import { localizeNamed, localizeOption } from '../src/utils/localize.js';
import { api, seedTestCatalog } from './helpers.js';

/**
 * المحتوى الذي يراه الزبون يخرج بلغته: الأقسام، الأقسام الفرعية، خيارات
 * المنتج، المحافظات، المناطق، والمستويات.
 *
 * [CRITICAL] ما يُقاس هنا هو **الردّ الفعلي** عبر HTTP مع `Accept-Language`،
 * لا دالّة الترجمة وحدها: كانت `localizeNamed` صحيحةً والمستودعات لا تُخرج
 * `name_ckb` أصلاً (الخيارات، المحافظات، المناطق)، فلم تجد الدالّة ما
 * تختاره وخرج كل شيء عربياً.
 *
 * أهداف الأفخاخ:
 *   ٢. إعادة `localizeCategory` إلى الحقل العربي، أو إسقاط `key` ← تسقط
 *      مجموعة «الأقسام».
 *   ٣. تفريغ `nameCkb` لمستوىً واحد ← تسقط مجموعة «المستويات».
 */

const CATEGORY_AR = 'ملابس اختبار';
const CATEGORY_CKB = 'جلوبەرگی تاقیکردنەوە';
const SUB_AR = 'تيشيرتات';
const SUB_CKB = 'تیشێرت';

describe('[CRITICAL] المحتوى الكردي يصل الزبون', () => {
  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    const catalog = await seedTestCatalog();
    categoryId = catalog.categoryId;
    productId = catalog.productIds[0]!;
    await db.query('UPDATE categories SET name_ckb = $2 WHERE id = $1', [categoryId, CATEGORY_CKB]);
    await db.query(
      'UPDATE subcategories SET name_ckb = $3 WHERE category_id = $1 AND name = $2',
      [categoryId, SUB_AR, SUB_CKB],
    );
    await db.query('DELETE FROM product_options WHERE product_id = $1', [productId]);
    await db.query(
      `INSERT INTO product_options (product_id, name, name_ckb, values, values_ckb)
       VALUES ($1, 'اللون', 'ڕەنگ', ARRAY['أسود','أبيض'], ARRAY['ڕەش','سپی'])`,
      [productId],
    );
    await db.query(
      `INSERT INTO governorates (name, name_ckb, delivery_fee)
       VALUES ('أربيل', 'هەولێر', 5000)
       ON CONFLICT (name) DO UPDATE SET name_ckb = EXCLUDED.name_ckb, is_active = TRUE`,
    );
  });

  describe('الأقسام والأقسام الفرعية', () => {
    it('[TRIPWIRE] Accept-Language: ckb ← الاسم كردي و`key` عربي ولا nameCkb مسرَّب', async () => {
      const res = await api.get('/api/catalog/categories').set('Accept-Language', 'ckb');
      expect(res.status).toBe(200);
      const items = res.body.data.items as Array<{ name: string; key: string; nameCkb?: unknown; subcategories: Array<{ name: string; nameCkb?: unknown }> }>;
      const cat = items.find((c) => c.key === CATEGORY_AR);
      expect(cat, 'القسم لم يصل أو `key` ليس الاسم العربي').toBeDefined();
      expect(cat!.name).toBe(CATEGORY_CKB);
      expect(cat!.nameCkb).toBeUndefined();
      const sub = cat!.subcategories.find((s) => s.name === SUB_CKB);
      expect(sub, 'القسم الفرعي بقي عربياً').toBeDefined();
      expect(sub!.nameCkb).toBeUndefined();
    });

    it('العربية (الافتراضي) كما كانت', async () => {
      const res = await api.get('/api/catalog/categories');
      const items = res.body.data.items as Array<{ name: string; key: string }>;
      const cat = items.find((c) => c.key === CATEGORY_AR);
      expect(cat!.name).toBe(CATEGORY_AR);
    });

    it('الرئيسية تحسم الأقسام باللغة نفسها', async () => {
      const res = await api.get('/api/catalog/home').set('Accept-Language', 'ckb-IQ,ckb;q=0.9,ar;q=0.8');
      const cats = res.body.data.categories as Array<{ name: string; key: string }>;
      expect(cats.find((c) => c.key === CATEGORY_AR)?.name).toBe(CATEGORY_CKB);
    });

    it('قسمٌ بلا كردية يسقط إلى العربية — نصٌّ لا فراغ', () => {
      expect(localizeNamed({ name: 'قسم', nameCkb: null }, 'ckb').name).toBe('قسم');
      expect(localizeNamed({ name: 'قسم', nameCkb: '   ' }, 'ckb').name).toBe('قسم');
    });
  });

  describe('خيارات المنتج', () => {
    it('[CRITICAL] اسم المجموعة وقيمها كردية في تفاصيل المنتج', async () => {
      const res = await api.get(`/api/catalog/products/${productId}`).set('Accept-Language', 'ckb');
      expect(res.status).toBe(200);
      const options = res.body.data.options as Array<{ name: string; values: string[]; nameCkb?: unknown; valuesCkb?: unknown }>;
      expect(options).toHaveLength(1);
      expect(options[0]!.name).toBe('ڕەنگ');
      expect(options[0]!.values).toEqual(['ڕەش', 'سپی']);
      expect(options[0]!.nameCkb).toBeUndefined();
      expect(options[0]!.valuesCkb).toBeUndefined();
    });

    it('قائمة قيمٍ كردية فارغة تسقط إلى العربية كاملةً — لا خلط', () => {
      const out = localizeOption({ name: 'المقاس', values: ['S', 'M'], nameCkb: 'قەبارە', valuesCkb: [] }, 'ckb');
      expect(out.name).toBe('قەبارە');
      expect(out.values).toEqual(['S', 'M']);
    });
  });

  describe('المحافظات والمناطق', () => {
    it('[CRITICAL] المحافظة كردية عبر HTTP', async () => {
      const res = await api.get('/api/catalog/governorates').set('Accept-Language', 'ckb');
      const items = res.body.data.items as Array<{ name: string; nameCkb?: unknown }>;
      expect(items.map((g) => g.name)).toContain('هەولێر');
      expect(items.map((g) => g.name)).not.toContain('أربيل');
      expect(items.every((g) => g.nameCkb === undefined)).toBe(true);
    });
  });

  describe('المستويات', () => {
    it('[TRIPWIRE] السبعة كلها تحمل nameCkb و rewardLabelCkb غير فارغين', () => {
      expect(GALAXY_LEVELS).toHaveLength(7);
      const missing = GALAXY_LEVELS.filter(
        (l) => !l.nameCkb.trim() || !l.rewardLabelCkb.trim(),
      ).map((l) => l.key);
      expect(missing, 'مستوى بلا كردية — سيصل الزبون عربياً').toEqual([]);
    });

    it('الاسم الكردي يختلف عن العربي ولا يكرّر تصريف الجنس', () => {
      for (const l of GALAXY_LEVELS) {
        expect(l.nameCkb).not.toBe(l.nameMale);
        expect(l.nameCkb).not.toBe(l.nameFemale);
      }
    });

    it('الردّ العام للسلّم يحمل الحقلين الكرديين', async () => {
      const res = await api.get('/api/catalog/loyalty-levels');
      const items = (res.body.data.items ?? res.body.data) as Array<{ key: string; nameCkb: string; rewardCkb: string }>;
      expect(items).toHaveLength(7);
      for (const l of items) {
        expect(l.nameCkb, l.key).toBeTruthy();
        expect(l.rewardCkb, l.key).toBeTruthy();
      }
    });

    it('rewardLabelFor يختار بالكردية ويسقط إلى العربية عند الفراغ', () => {
      const level = GALAXY_LEVELS[1]!;
      expect(rewardLabelFor(level, 'ckb')).toBe(level.rewardLabelCkb);
      expect(rewardLabelFor(level, 'ar')).toBe(level.rewardLabel);
      expect(rewardLabelFor({ ...level, rewardLabelCkb: '' }, 'ckb')).toBe(level.rewardLabel);
    });
  });
});
