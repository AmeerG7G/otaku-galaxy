import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * [CRITICAL REGRESSION GUARD] — عقد المنتج واحد على كل الواجهات.
 *
 * كانت خمس دوال مختلفة تبني «منتجاً»: `catalogRepo.mapProduct`، ومصفوفتان
 * مكتوبتان يدوياً داخل `catalogService` (الاكتشاف والتفاصيل)، و
 * `favoritesRepo.shapeProductImages`. كل واحدة أغفلت حقولاً مختلفة:
 *   - المفضلة: بلا أي بيانات عرض إطلاقاً (لا سعر سابق، لا نسبة، لا ترويج توصيل)
 *   - التفاصيل والاكتشاف: بلا `deliveryPromoAmount`
 * ولأن نموذج فلاتر يقرأ الحقول الغائبة كـ`null`/`0`، كان الخطأ صامتاً: تختفي
 * شارة الخصم في شاشة ولا تختفي في أخرى، لنفس المنتج، بلا أي رسالة خطأ.
 *
 * هذا الملف يثبّت القاعدة: أي سطح يعيد منتجاً يعيده بالعقد نفسه وبالقيم نفسها.
 */

/** الحقول التي يجب أن يحملها كل تمثيل لمنتج، أياً كان المسار. */
const REQUIRED_PRODUCT_FIELDS = [
  'id', 'name', 'description', 'price', 'stock', 'images',
  'categoryId', 'subcategoryId', 'isActive', 'isOffer', 'isSelected',
  'rating', 'reviewCount',
  'previousPrice', 'discountPercent', 'hasDeliveryPromo', 'deliveryPromoAmount',
  'franchiseIds',
] as const;

const PRICE = 15000;
const PREVIOUS_PRICE = 20000;
const PROMO_AMOUNT = 2500;
/** النسبة التي يجب أن يشتقها الخادم — تُكتب هنا مرة واحدة كتوقّع، لا كصيغة. */
const EXPECTED_DISCOUNT_PERCENT = 25;

describe('عقد المنتج موحّد عبر كل الواجهات', () => {
  let productId: string;
  let token: string;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

  beforeAll(async () => {
    await purgeTestUsers('077%');
    catalog = await seedTestCatalog();

    // منتج بعرضٍ كامل: سعر سابق + ترويج توصيل + شارتا عرض/مختار.
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products
         (name, description, price, previous_price, category_id, subcategory_id,
          stock, is_offer, is_selected, has_delivery_promo, delivery_promo_amount)
       VALUES ($1, $2, $3, $4, $5, $6, 7, TRUE, TRUE, TRUE, $7)
       RETURNING id`,
      [
        'منتج عقد العروض',
        'منتج يفحص اتساق بيانات العرض',
        PRICE,
        PREVIOUS_PRICE,
        catalog.categoryId,
        catalog.subcategoryId,
        PROMO_AMOUNT,
      ],
    );
    productId = rows[0]!.id;

    const session = await registerAndLogin();
    token = session.token;
    await api
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId })
      .expect(200);
  });

  afterAll(async () => {
    await db.query('DELETE FROM favorites WHERE product_id = $1', [productId]);
    await db.query('DELETE FROM products WHERE id = $1', [productId]);
    await purgeTestUsers('077%');
  });

  /** كل سطح يعيد منتجات، مع كيفية انتزاع منتجنا منه. */
  async function surfaces(): Promise<Record<string, Record<string, unknown>>> {
    const pick = (items: Record<string, unknown>[]) =>
      items.find((i) => i.id === productId);

    const [list, detail, home, search, favorites] = await Promise.all([
      api.get('/api/catalog/products').query({ page: 1, limit: 50 }),
      api.get(`/api/catalog/products/${productId}`),
      api.get('/api/catalog/home'),
      api.get('/api/catalog/products/search').query({ q: 'عقد', page: 1, limit: 50 }),
      api.get('/api/favorites').set('Authorization', `Bearer ${token}`).query({ page: 1, limit: 50 }),
    ]);

    const found: Record<string, Record<string, unknown>> = {};
    const add = (name: string, value: unknown) => {
      if (value) found[name] = value as Record<string, unknown>;
    };

    add('catalog list', pick(list.body.data.items));
    add('product detail', detail.body.data);
    add('home offers', pick(home.body.data.offers));
    add('home selected', pick(home.body.data.selectedProducts));
    add('home discover', pick(home.body.data.discover));
    add('search', pick(search.body.data.items));
    add('favorites', pick(favorites.body.data.items));
    return found;
  }

  it('كل سطح يعيد المنتج بالحقول المطلوبة كاملة', async () => {
    const found = await surfaces();

    // الأسطح التي لا يظهر فيها المنتج (الاكتشاف عشوائي) لا تُفحص، لكن
    // الأسطح الحتمية يجب أن تكون كلها حاضرة.
    for (const required of ['catalog list', 'product detail', 'home offers', 'home selected', 'search', 'favorites']) {
      expect(Object.keys(found)).toContain(required);
    }

    // تُجمَع كل النواقص ثم تُفحص مرة واحدة: الفحص المتتابع كان يتوقف عند
    // أول سطح ناقص فيخفي البقية، وهو ما جعل العطل يُكتشف على دفعات.
    const gaps: string[] = [];
    for (const [surface, product] of Object.entries(found)) {
      const missing = REQUIRED_PRODUCT_FIELDS.filter((f) => !(f in product));
      if (missing.length > 0) gaps.push(`«${surface}» ينقصه: ${missing.join(', ')}`);
    }
    expect(gaps, gaps.join(' | ')).toEqual([]);
  });

  it('قيم العرض متطابقة حرفياً على كل الأسطح', async () => {
    const found = await surfaces();

    for (const [surface, product] of Object.entries(found)) {
      expect(Number(product.price), surface).toBe(PRICE);
      expect(Number(product.previousPrice), surface).toBe(PREVIOUS_PRICE);
      expect(Number(product.discountPercent), surface).toBe(EXPECTED_DISCOUNT_PERCENT);
      expect(product.hasDeliveryPromo, surface).toBe(true);
      expect(Number(product.deliveryPromoAmount), surface).toBe(PROMO_AMOUNT);
      expect(product.isOffer, surface).toBe(true);
      expect(product.isSelected, surface).toBe(true);
      expect(product.isActive, surface).toBe(true);
      expect(Number(product.stock), surface).toBe(7);
      expect(product.categoryId, surface).toBe(catalog.categoryId);
      expect(product.subcategoryId, surface).toBe(catalog.subcategoryId);
      expect(Array.isArray(product.images), surface).toBe(true);
      expect(Array.isArray(product.franchiseIds), surface).toBe(true);
    }
  });

  it('«اكتشف» يعيد العقد نفسه لكل منتجاته', async () => {
    // قائمة الاكتشاف عشوائية، فقد لا تضمّ منتج الاختبار. الضمانة التي
    // تهمّ هنا لا تتعلق بمنتج بعينه: **كل** ما يعيده الاكتشاف يجب أن يحمل
    // العقد كاملاً — وهو ما كان يفشل حين كان له مُحوِّله اليدوي الخاص.
    const home = await api.get('/api/catalog/home').expect(200);
    const discover = home.body.data.discover as Record<string, unknown>[];
    expect(discover.length).toBeGreaterThan(0);

    const gaps: string[] = [];
    for (const product of discover) {
      const missing = REQUIRED_PRODUCT_FIELDS.filter((f) => !(f in product));
      if (missing.length > 0) gaps.push(`${String(product.name)}: ${missing.join(', ')}`);
    }
    expect(gaps, gaps.join(' | ')).toEqual([]);
  });

  it('نسبة الخصم يشتقّها الخادم من السعرين — لا تُدخل يدوياً', async () => {
    // منتج بلا سعر سابق: لا نسبة ولا شارة خصم على أي سطح.
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_offer)
       VALUES ($1, $2, 9000, $3, 5, TRUE) RETURNING id`,
      ['منتج بلا خصم', 'بلا سعر سابق', catalog.categoryId],
    );
    const plainId = rows[0]!.id;
    try {
      const detail = await api.get(`/api/catalog/products/${plainId}`).expect(200);
      expect(detail.body.data.previousPrice).toBeNull();
      expect(detail.body.data.discountPercent).toBeNull();

      // سعر سابق أقل من الحالي مستحيل أصلاً: القاعدة ترفضه بقيد
      // `products_previous_price_higher`. الضمانة هناك أقوى من أي فحص في
      // الطبقة العليا، فنثبّتها بدل محاكاة بيانات لا يمكن أن توجد.
      await expect(
        db.query('UPDATE products SET previous_price = 5000 WHERE id = $1', [plainId]),
      ).rejects.toThrow(/products_previous_price_higher/);
    } finally {
      await db.query('DELETE FROM products WHERE id = $1', [plainId]);
    }
  });

  it('ترويج التوصيل في السلة يطابق قيمة الكتالوج', async () => {
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 2 })
      .expect(200);

    const [cart, detail] = await Promise.all([
      api.get('/api/cart').set('Authorization', `Bearer ${token}`).expect(200),
      api.get(`/api/catalog/products/${productId}`).expect(200),
    ]);

    const line = cart.body.data.items.find(
      (i: { productId: string }) => i.productId === productId,
    );
    expect(line).toBeDefined();
    // سطر السلة شكلٌ آخر عمداً (سطر لا منتج)، لكن قيمة الترويج يجب أن
    // تكون هي نفسها التي يراها المستخدم في الكتالوج.
    expect(Number(line.deliveryPromoAmount)).toBe(
      Number(detail.body.data.deliveryPromoAmount),
    );
    expect(line.hasDeliveryPromo).toBe(detail.body.data.hasDeliveryPromo);
  });
});
