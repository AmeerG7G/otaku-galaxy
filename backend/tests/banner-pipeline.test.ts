import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, registerUploadedPhoto, seedTestCatalog } from './helpers.js';

/**
 * مسار البنر كاملاً: لوحة التحكم ← الخادم ← القاعدة ← واجهة الكتالوج.
 *
 * الشكوى كانت «المسؤول يضيف بنراً ولا يظهر شيء في التطبيق». المسار فيه
 * أربع حلقات، وأي واحدة تقطعه بصمت. هذه السويت تمشي عليها كلها بحمولة
 * حقيقية بدل الاكتفاء بأن الإدراج نجح.
 */
describe('مسار البنر من اللوحة إلى التطبيق', () => {
  let adminToken: string;
  let imageUrl: string;

  beforeAll(async () => {
    await seedTestCatalog();
    adminToken = await createAdminUser();
    imageUrl = await registerUploadedPhoto();
  });

  async function home() {
    const res = await api.get('/api/catalog/home').expect(200);
    return res.body.data.banners as {
      id: string;
      imageUrl: string | null;
      destinationType: string;
      destinationValue: string | null;
    }[];
  }

  it('البنر المُنشأ من اللوحة يظهر في واجهة الكتالوج', async () => {
    const created = await api
      .post('/api/admin/banners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ imageUrl, destinationType: 'none', sortOrder: 0 })
      .expect(201);
    const id = created.body.data.id as string;

    const banners = await home();
    const found = banners.find((banner) => banner.id === id);
    expect(found).toBeDefined();
    expect(found!.imageUrl).toBe(imageUrl);
  });

  it('[CRITICAL] رابط الصورة يخرج مرجعاً نسبياً لا رابطاً مطلقاً', async () => {
    const banners = await home();
    for (const banner of banners) {
      if (!banner.imageUrl) continue;
      // رابط مطلق مخبوز وقت الرفع يعمل على المتصفح ويفشل على الهاتف:
      // `localhost` هناك هو الهاتف نفسه. المرجع النسبي يحوّله كل عميل
      // مقابل الأصل الذي يعرفه — وهو ما تنصّ عليه هجرة ٠٢١.
      if (banner.imageUrl.includes('/uploads/')) {
        expect(banner.imageUrl.startsWith(config.uploads.publicPath)).toBe(true);
        expect(banner.imageUrl).not.toMatch(/^https?:\/\//);
      }
    }
  });

  it('البنر الموقوف يختفي عن التطبيق ويبقى في اللوحة', async () => {
    const created = await api
      .post('/api/admin/banners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ imageUrl, destinationType: 'none' })
      .expect(201);
    const id = created.body.data.id as string;

    await api
      .patch(`/api/admin/banners/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    expect((await home()).some((banner) => banner.id === id)).toBe(false);

    const adminList = await api
      .get('/api/admin/banners')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (adminList.body.data.items as { id: string }[]).some((banner) => banner.id === id),
    ).toBe(true);
  });

  it('الترتيب الذي يضبطه المسؤول هو ترتيب العرض', async () => {
    await db.query('DELETE FROM banners');
    const ids: string[] = [];
    for (const sortOrder of [2, 0, 1]) {
      const created = await api
        .post('/api/admin/banners')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ imageUrl, destinationType: 'none', sortOrder, titleAr: `بنر ${sortOrder}` })
        .expect(201);
      ids.push(created.body.data.id);
    }
    const banners = await home();
    expect(banners.map((banner) => banner.id)).toEqual([ids[1], ids[2], ids[0]]);
  });

  it('وجهة البنر تصل التطبيق كما ضبطها المسؤول', async () => {
    const { rows } = await db.query<{ id: string }>('SELECT id FROM categories LIMIT 1');
    const categoryId = rows[0]!.id;

    const created = await api
      .post('/api/admin/banners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        imageUrl,
        destinationType: 'category',
        destinationValue: categoryId,
        sortOrder: 9,
      })
      .expect(201);

    const banner = (await home()).find((b) => b.id === created.body.data.id);
    expect(banner?.destinationType).toBe('category');
    expect(banner?.destinationValue).toBe(categoryId);
  });

  it('بنر بلا صورة مرفوض — لا شريحة فارغة في الشاشة الرئيسية', async () => {
    const res = await api
      .post('/api/admin/banners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ destinationType: 'none' });
    expect(res.status).toBe(400);
  });

  it('حذف البنر يزيله من التطبيق', async () => {
    const created = await api
      .post('/api/admin/banners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ imageUrl, destinationType: 'none', sortOrder: 8 })
      .expect(201);
    const id = created.body.data.id as string;
    expect((await home()).some((banner) => banner.id === id)).toBe(true);

    await api
      .delete(`/api/admin/banners/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((await home()).some((banner) => banner.id === id)).toBe(false);
  });

  it('غير المسؤول لا ينشئ بنراً', async () => {
    const res = await api
      .post('/api/admin/banners')
      .send({ imageUrl, destinationType: 'none' });
    expect(res.status).toBe(401);
  });
});
