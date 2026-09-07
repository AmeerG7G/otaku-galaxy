import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, registerUploadedPhoto } from './helpers.js';
import { renumberPlacement } from '../src/utils/bannerOrder.js';

/**
 * «ترتيب البنر» — ترقيم بلا تكرار داخل الموضع، والترتيب الحر يبقى كما طلبه
 * المسؤول.
 *
 * كانت اللوحة تقبل أي رقم، فتنسّق بنران على نفس الترتيب والبنر «الأساسي»
 * يتحدد بالدخول في القاعدة — مسؤول يضغط «1» يتفاجأ بأن بنراً من «0» حلّ
 * فوقه. اليوم تثبيتُ ترتيبٍ محجوزٍ عبر «النقلة» يزحزح صاحبَه بخطوة واحدة
 * (لا اصطدام)، والترتيب الحر يثبت كما هو دون إزعاج أحد، والإنشاء عند ترتيبٍ
 * محجوزٍ يثبت في مؤخرة الموضع بلا مساس بمن قبله. الدالة الخالصة تُحاك هنا
 * أولاً بلا قاعدة، ثم يُختبَر المسار الكامل عبر لوحة التحكم حتى واجهة الكتالوج.
 */
describe('إعادة ترقيم البنرات (بلا تكرار — والحر يبقى)', () => {
  it('دالة خالصة: تثبيت في المقدمة يزيح البقية', () => {
    const assigned = renumberPlacement(
      [
        { id: 'a', sortOrder: 0, createdAt: '2026-01-01T00:00:00Z' },
        { id: 'b', sortOrder: 1, createdAt: '2026-01-02T00:00:00Z' },
        { id: 'c', sortOrder: 2, createdAt: '2026-01-03T00:00:00Z' },
      ],
      'c',
      0,
    );
    expect(assigned).toEqual([
      { id: 'c', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
      { id: 'b', sortOrder: 2 },
    ]);
  });

  it('دالة خالصة: ترتيب أكبر من القائمة يعني النهاية بلا فجوة', () => {
    const assigned = renumberPlacement(
      [
        { id: 'a', sortOrder: 0, createdAt: '2026-01-01T00:00:00Z' },
        { id: 'b', sortOrder: 1, createdAt: '2026-01-02T00:00:00Z' },
        { id: 'c', sortOrder: 2, createdAt: '2026-01-03T00:00:00Z' },
      ],
      'a',
      99,
    );
    expect(assigned).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'c', sortOrder: 1 },
      { id: 'a', sortOrder: 2 },
    ]);
  });

  it('دالة خالصة: ترتيب متساوٍ يحسم بالقدم ثم المعرّف', () => {
    // «ب» أقدم إنشاءً؛ بنقله إلى 1 يبقى محله الطبيعي (القائمة أصلًا ب ← أ).
    const assigned = renumberPlacement(
      [
        { id: 'a', sortOrder: 1, createdAt: '2026-01-02T00:00:00Z' },
        { id: 'b', sortOrder: 0, createdAt: '2026-01-01T00:00:00Z' },
      ],
      'a',
      1,
    );
    expect(assigned.map((r) => r.id)).toEqual(['b', 'a']);
    expect(assigned.map((r) => r.sortOrder)).toEqual([0, 1]);
  });
});

describe('مسار إعادة الترقيم من اللوحة إلى الكتالوج', () => {
  let adminToken: string;
  let imageUrl: string;

  beforeAll(async () => {
    adminToken = await createAdminUser();
    imageUrl = await registerUploadedPhoto();
  });

  async function createBanner(sortOrder: number, title: string) {
    const created = await api
      .post('/api/admin/banners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ imageUrl, destinationType: 'none', placement: 'hero', sortOrder, title })
      .expect(201);
    return created.body.data as { id: string };
  }

  async function heroOrders(ids: string[]) {
    const { rows } = await db.query<{ id: string; sort_order: number }>(
      `SELECT id, sort_order FROM banners
        WHERE placement = 'hero' AND is_active = TRUE
        ORDER BY sort_order, created_at`,
    );
    return rows
      .filter((row) => ids.includes(row.id))
      .map((row) => row.id);
  }

  it('تثبيت ترتيب بنر يزحزح من كان يملكه ويُبقي ترتيباً حراً كما هو', async () => {
    // مساحة اختبار نظيفة: موضع مخصص لهذه السويت لا يمسّه ملف آخر.
    await db.query(`DELETE FROM banners WHERE placement = 'hero'`);

    const a = await createBanner(0, 'أ');
    const b = await createBanner(1, 'ب');
    const c = await createBanner(2, 'ج');
    const [idA, idB, idC] = [a.id, b.id, c.id];

    // انقل «ج» إلى الرأس — «أ» يزيحه عما يملكه.
    await api
      .patch(`/api/admin/banners/${idC}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sortOrder: 0 })
      .expect(200);
    expect(await heroOrders([idA, idB, idC])).toEqual([idC, idA, idB]);

    // ثم انقل «ب» إلى المنتصف (1): ج ← ب ← أ.
    await api
      .patch(`/api/admin/banners/${idB}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sortOrder: 1 })
      .expect(200);
    expect(await heroOrders([idA, idB, idC])).toEqual([idC, idB, idA]);

    // طلب «ترتيب 99» الحر يُثبَّت كما هو — لا خلط لأحد (الفجوة اختيارية).
    const d = await createBanner(99, 'د');
    const { rows: orders } = await db.query<{ sort_order: number }>(
      `SELECT sort_order FROM banners
        WHERE placement = 'hero' AND is_active = TRUE
        ORDER BY sort_order`,
    );
    expect(orders.map((r) => r.sort_order)).toEqual([0, 1, 2, 99]);
    expect(new Set(orders.map((r) => r.sort_order)).size).toBe(orders.length);
    expect(await heroOrders([idA, idB, idC, d.id])).toEqual([idC, idB, idA, d.id]);
  });

  it('واجهة الكتالوج ترتب بنفس ترتيب القاعدة', async () => {
    await db.query(`DELETE FROM banners WHERE placement = 'hero'`);
    const a = await createBanner(0, 'أ');
    const b = await createBanner(1, 'ب');
    await api
      .patch(`/api/admin/banners/${a.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sortOrder: 1 })
      .expect(200);

    const home = await api.get('/api/catalog/home').expect(200);
    const order = (home.body.data.banners as { id: string }[])
      .filter((banner) => banner.id === a.id || banner.id === b.id)
      .map((banner) => banner.id);
    expect(order).toEqual([b.id, a.id]);
  });
});