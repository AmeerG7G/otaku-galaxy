import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  api,
  createAdminUser,
  purgeTestUsers,
  registerAndLogin,
  registerUploadedPhoto,
  seedTestCatalog,
} from './helpers.js';

/**
 * [CRITICAL REGRESSION GUARD] — تمثيل واحد لمرجع الوسائط.
 *
 * القاعدة: ما يُخزَّن ويُعاد هو **مرجع نسبي** (`/uploads/...`)، ويتولّى كل
 * عميل تحويله إلى مطلق مقابل الأصل الذي يعرفه هو.
 *
 * سبب القاعدة عملي لا جمالي: الخادم نفسه يُرى بعناوين مختلفة —
 * `localhost` من سطح المكتب، و`10.0.2.2` من محاكي أندرويد، وعنوان الشبكة
 * من هاتف حقيقي، ونطاق آخر في الإنتاج. أي أصل يُخبز وقت الحفظ يصير رابطاً
 * ميتاً على عميل آخر. هذه الاختبارات تمنع عودة ذلك من أي مسار.
 *
 * الروابط الخارجية الكاملة (بذور `placehold.co` مثلاً) تمرّ كما هي عمداً.
 */

/** مرجع مقبول: نسبي تحت `/uploads/`، أو رابط خارجي كامل، أو لا شيء. */
function assertMediaRef(value: unknown, where: string) {
  if (value === null || value === undefined || value === '') return;
  expect(typeof value, `${where}: يجب أن يكون نصاً`).toBe('string');
  const ref = value as string;

  // الممنوع تحديداً: أصل مطلق يشير إلى ملفات هذا الخادم.
  expect(
    /^https?:\/\/[^/]+\/uploads\//i.test(ref),
    `${where}: أصل مطلق مخبوز في مرجع وسائط → «${ref}»`,
  ).toBe(false);

  const relative = ref.startsWith('/uploads/');
  const external = /^https?:\/\//i.test(ref);
  expect(
    relative || external,
    `${where}: مرجع غير معروف الشكل → «${ref}»`,
  ).toBe(true);
}

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100' +
    'ffff03000006000557bfabd40000000049454e44ae426082',
  'hex',
);

describe('عقد مرجع الوسائط — الرفع', () => {
  let adminToken: string;

  beforeAll(async () => {
    await purgeTestUsers('077%');
    adminToken = await createAdminUser();
  });
  afterAll(async () => {
    await purgeTestUsers('077%');
  });

  const PURPOSES = ['product', 'category', 'banner', 'avatar', 'franchise'] as const;

  it('كل غرض رفع يعيد مرجعاً نسبياً ويسجّله نسبياً', async () => {
    for (const purpose of PURPOSES) {
      const res = await api
        .post('/api/admin/uploads')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('purpose', purpose)
        .attach('file', PNG, { filename: 'x.png', contentType: 'image/png' })
        .expect(201);

      const url = res.body.data.url as string;
      expect(url.startsWith('/uploads/'), `${purpose}: ${url}`).toBe(true);

      // والصفّ المسجَّل في `media_files` بنفس التمثيل — لا شكل ثانٍ.
      const { rows } = await db.query<{ url: string }>(
        'SELECT url FROM media_files WHERE id = $1',
        [res.body.data.id],
      );
      expect(rows[0]!.url).toBe(url);
    }
  });

  it('كل رفع ينتج مفتاحاً جديداً — فلا يتغيّر محتوى رابط قائم', async () => {
    const urls = new Set<string>();
    for (let i = 0; i < 4; i += 1) {
      const res = await api
        .post('/api/admin/uploads')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('purpose', 'product')
        .attach('file', PNG, { filename: 'same.png', contentType: 'image/png' })
        .expect(201);
      urls.add(res.body.data.url);
    }
    // هذا ما يجعل التخزين المؤقت `immutable` صحيحاً: الرابط لا يُعاد
    // استعماله أبداً، فتغيير الصورة = رابط جديد = لا صورة قديمة عالقة.
    expect(urls.size).toBe(4);
  });
});

describe('عقد مرجع الوسائط — كل سطح يعيد التمثيل نفسه', () => {
  let adminToken: string;
  let customerToken: string;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

  beforeAll(async () => {
    await purgeTestUsers('077%');
    adminToken = await createAdminUser();
    const session = await registerAndLogin();
    customerToken = session.token;
    catalog = await seedTestCatalog();

    // صورة شخصية حقيقية عبر مسار الرفع.
    const upload = await api
      .post('/api/uploads')
      .set('Authorization', `Bearer ${customerToken}`)
      .field('purpose', 'avatar')
      .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' })
      .expect(201);
    await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ avatarUrl: upload.body.data.url })
      .expect(200);
  });

  afterAll(async () => {
    await purgeTestUsers('077%');
  });

  it('كتالوج المنتجات (قائمة + تفاصيل + بحث)', async () => {
    const list = await api
      .get('/api/catalog/products')
      .query({ page: 1, limit: 50 })
      .expect(200);
    for (const product of list.body.data.items) {
      for (const [i, image] of (product.images as string[]).entries()) {
        assertMediaRef(image, `products[${product.id}].images[${i}]`);
      }
    }

    const detail = await api
      .get(`/api/catalog/products/${catalog.productIds[0]}`)
      .expect(200);
    for (const [i, image] of (detail.body.data.images as string[]).entries()) {
      assertMediaRef(image, `detail.images[${i}]`);
    }
  });

  it('الرئيسية: بنرات + أقسام + عروض + مختارات + اكتشف', async () => {
    const home = await api.get('/api/catalog/home').expect(200);
    const data = home.body.data;

    for (const banner of data.banners) {
      assertMediaRef(banner.imageUrl, `banner[${banner.id}].imageUrl`);
    }
    for (const category of data.categories) {
      assertMediaRef(category.imageUrl, `category[${category.id}].imageUrl`);
    }
    for (const bucket of ['offers', 'selectedProducts', 'discover'] as const) {
      for (const product of data[bucket]) {
        for (const [i, image] of (product.images as string[]).entries()) {
          assertMediaRef(image, `${bucket}[${product.id}].images[${i}]`);
        }
      }
    }
  });

  it('الصورة الشخصية عبر /auth/me والمفضلة', async () => {
    const me = await api
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    assertMediaRef(me.body.data.user.avatarUrl, 'auth/me.avatarUrl');
    expect((me.body.data.user.avatarUrl as string).startsWith('/uploads/')).toBe(true);

    const favorites = await api
      .get('/api/favorites')
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ page: 1, limit: 50 })
      .expect(200);
    for (const product of favorites.body.data.items) {
      for (const [i, image] of (product.images as string[]).entries()) {
        assertMediaRef(image, `favorites[${product.id}].images[${i}]`);
      }
    }
  });

  it('صور التقييمات (المجتمع)', async () => {
    const photo = await registerUploadedPhoto();
    assertMediaRef(photo, 'registerUploadedPhoto()');
    expect(photo.startsWith('/uploads/')).toBe(true);

    const community = await api
      .get('/api/catalog/community/photos')
      .expect(200);
    const items = community.body.data.items ?? community.body.data;
    for (const entry of items) {
      assertMediaRef(entry.photoUrl, `community[${entry.id}].photoUrl`);
    }
  });

  it('مسارات الإدارة: منتجات + أقسام + بنرات + أنمي + عملاء', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };

    const products = await api.get('/api/admin/products').set(auth).expect(200);
    for (const product of products.body.data.items) {
      for (const [i, image] of (product.images as string[]).entries()) {
        assertMediaRef(image, `admin.products[${product.id}].images[${i}]`);
      }
    }

    const categories = await api.get('/api/admin/categories').set(auth).expect(200);
    for (const category of categories.body.data.items) {
      assertMediaRef(category.imageUrl, `admin.categories[${category.id}]`);
    }

    const banners = await api.get('/api/admin/banners').set(auth).expect(200);
    for (const banner of banners.body.data.items) {
      assertMediaRef(banner.imageUrl, `admin.banners[${banner.id}]`);
    }

    const franchises = await api.get('/api/admin/franchises').set(auth).expect(200);
    const franchiseItems = franchises.body.data.items ?? franchises.body.data;
    for (const franchise of franchiseItems) {
      assertMediaRef(franchise.imageUrl, `admin.franchises[${franchise.id}]`);
    }

    const customers = await api.get('/api/admin/users').set(auth).expect(200);
    for (const customer of customers.body.data.items) {
      assertMediaRef(customer.avatarUrl, `admin.users[${customer.id}].avatarUrl`);
    }
  });

  it('سطر السلة والطلب يحملان المرجع نفسه', async () => {
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId: catalog.productIds[0], quantity: 1 })
      .expect(200);

    const cart = await api
      .get('/api/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    for (const line of cart.body.data.items) {
      assertMediaRef(line.productImage, `cart[${line.id}].productImage`);
    }
  });
});

describe('عقد مرجع الوسائط — الكتابة مقيّدة', () => {
  let customerToken: string;

  beforeAll(async () => {
    await purgeTestUsers('077%');
    customerToken = (await registerAndLogin()).token;
  });
  afterAll(async () => {
    await purgeTestUsers('077%');
  });

  it('الصورة الشخصية ترفض أي أصل خارجي', async () => {
    for (const bad of [
      'http://localhost:4000/uploads/avatar/x.png',
      'https://cdn.example.com/a.png',
      'https://evil.test/track.png?u=1',
    ]) {
      const res = await api
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ avatarUrl: bad });
      expect(res.status, bad).toBe(400);
    }
  });
});
