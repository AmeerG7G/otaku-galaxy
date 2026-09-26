import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { mediaRepo } from '../src/repositories/mediaRepo.js';
import { api, createAdminUser, registerAndLogin, registerUploadedSlotImage } from './helpers.js';

/**
 * رفع الوسائط: الصلاحية حسب الغرض، والتحقق من محتوى الملف الفعلي.
 * `Content-Type` يتحكّم به العميل، فلا يكفي وحده للتحقق.
 */

// ترويسة PNG صالحة (توقيع ثنائي حقيقي).
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const NOT_AN_IMAGE = Buffer.from('<html><script>alert(1)</script></html>');

let adminToken: string;
let customerToken: string;

beforeAll(async () => {
  adminToken = await createAdminUser();
  customerToken = (await registerAndLogin()).token;
});

describe('media upload', () => {
  it('accepts a real image from a customer for review and avatar purposes', async () => {
    for (const purpose of ['review', 'avatar']) {
      const response = await api
        .post('/api/uploads')
        .set('Authorization', `Bearer ${customerToken}`)
        .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
        .field('purpose', purpose);
      expect(response.status).toBe(201);
      expect(response.body.data.url).toContain(`/uploads/${purpose}/`);
    }
  });

  it('refuses customer uploads for admin-only purposes', async () => {
    for (const purpose of ['product', 'banner', 'franchise']) {
      const response = await api
        .post('/api/uploads')
        .set('Authorization', `Bearer ${customerToken}`)
        .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
        .field('purpose', purpose);
      expect(response.status).toBe(403);
    }
  });

  it('refuses anonymous uploads', async () => {
    const response = await api
      .post('/api/uploads')
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
      .field('purpose', 'review');
    expect(response.status).toBe(401);
  });

  it('rejects non-image bytes even when declared as an image', async () => {
    const response = await api
      .post('/api/uploads')
      .set('Authorization', `Bearer ${customerToken}`)
      .attach('file', NOT_AN_IMAGE, { filename: 'evil.png', contentType: 'image/png' })
      .field('purpose', 'review');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA');
  });

  /**
   * سقف حجم الملف الواحد — يفرضه `multer` قبل أن يصل شيء إلى الخدمة.
   * كان يردّ 500 لأن خطأ `multer` يسقط في فرع «غير متوقَّع» — الحدّ يعمل
   * والرسالة كاذبة. الآن 400 برمز صريح يفهمه العميل.
   */
  it('يرفض ملفاً أكبر من السقف', async () => {
    const oversized = Buffer.concat([
      PNG,
      Buffer.alloc(config.uploads.maxBytes + 1024, 0),
    ]);
    const response = await api
      .post('/api/uploads')
      .set('Authorization', `Bearer ${customerToken}`)
      .field('purpose', 'review')
      .attach('file', oversized, 'big.png');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('FILE_TOO_LARGE');
  });

  /**
   * الحصّة اليومية بالبايتات — الحاجز الفعلي أمام ملء القرص.
   *
   * السقف لكل ملف كان ٥ ميغابايت بلا حدٍّ للعدد، أي أن حساباً واحداً يستطيع
   * الاستمرار إلى ما لا نهاية. تُقاس هنا بحقن استهلاكٍ سابق في الدفتر بدل
   * رفع عشرات الملفات فعلياً — النتيجة نفسها والاختبار أسرع وأدقّ.
   */
  it('[CRITICAL] الحصّة اليومية توقف الزبون بعد استهلاكها', async () => {
    const fresh = await registerAndLogin();

    // استهلاكٌ سابق يملأ الحصّة تماماً.
    await db.query(
      `INSERT INTO media_files (storage_key, url, purpose, mime_type, size_bytes, uploaded_by)
       VALUES ($1, $2, 'review', 'image/png', $3, $4)`,
      [
        `review/quota/${randomUUID()}.png`,
        `/uploads/review/quota/${randomUUID()}.png`,
        config.uploads.dailyBytesPerCustomer,
        fresh.userId,
      ],
    );

    const refused = await api
      .post('/api/uploads')
      .set('Authorization', `Bearer ${fresh.token}`)
      .field('purpose', 'review')
      .attach('file', PNG, 'x.png');
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('UPLOAD_QUOTA_EXCEEDED');
  });

  it('الإدارة معفاة من الحصّة — الرفع بالجملة سير عمل مشروع', async () => {
    const { rows } = await db.query<{ id: string }>(
      "SELECT id FROM users WHERE role = 'admin' ORDER BY created_at DESC LIMIT 1",
    );
    await db.query(
      `INSERT INTO media_files (storage_key, url, purpose, mime_type, size_bytes, uploaded_by)
       VALUES ($1, $2, 'product', 'image/png', $3, $4)`,
      [
        `product/quota/${randomUUID()}.png`,
        `/uploads/product/quota/${randomUUID()}.png`,
        config.uploads.dailyBytesPerCustomer * 3,
        rows[0]!.id,
      ],
    );

    const accepted = await api
      .post('/api/admin/uploads')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('purpose', 'product')
      .attach('file', PNG, 'ok.png');
    expect(accepted.status).toBe(201);
  });

  /**
   * سقف الرفع لكل حساب — يُفحص إعداداً لا سلوكاً.
   *
   * [CRITICAL] المحدِّدات كلها معطَّلة في الاختبارات (`skip: () => isTest` في
   * `error-handler.ts`)، فلا سبيل لتشغيل السلوك الحقيقي من هنا. ما يُحرَس
   * أن القيمتين موجودتان ومعقولتان وأن سقف الإدارة أوسع — وهو ما يمنع
   * ضبطاً يخنق رفع الكتالوج بالجملة.
   */
  it('سقفا الرفع مضبوطان وسقف الإدارة أوسع', () => {
    expect(config.rateLimit.uploadMaxPerCustomer).toBeGreaterThanOrEqual(5);
    expect(config.rateLimit.uploadMaxPerAdmin).toBeGreaterThan(
      config.rateLimit.uploadMaxPerCustomer,
    );
  });

  it('rejects an honestly declared non-image type', async () => {
    const response = await api
      .post('/api/uploads')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', NOT_AN_IMAGE, { filename: 'evil.html', contentType: 'text/html' })
      .field('purpose', 'product');
    expect(response.status).toBe(400);
  });
});

/**
 * الملفات اليتيمة — تشخيصٌ لا حذف.
 *
 * [PRODUCT] لم يُبنَ حذفٌ آلي. المراجع نصوصٌ في سبعة أعمدة بلا مفاتيح
 * أجنبية، فأيّ عمودٍ يُضاف لاحقاً ويُنسى في `MEDIA_REFERENCE_COLUMNS` يحوّل
 * ملفاتٍ حيّةً إلى «يتيمة» — أي فقدانَ بياناتٍ صامتاً. الاختبار الثاني هنا
 * هو ما يجعل الحذف قابلاً للأمان لاحقاً: يسقط متى ظهر عمودٌ غير مغطّى.
 */
describe('media orphan detection (read-only)', () => {
  it('يميّز الملف المربوط من غير المربوط', async () => {
    const { userId } = await registerAndLogin();

    // ملفٌ لا يشير إليه شيء.
    const orphanKey = `review/orphan/${randomUUID()}.png`;
    const orphanUrl = `/uploads/${orphanKey}`;
    await db.query(
      `INSERT INTO media_files (storage_key, url, purpose, mime_type, size_bytes, uploaded_by, created_at)
       VALUES ($1, $2, 'review', 'image/png', 512, $3, now() - interval '2 days')`,
      [orphanKey, orphanUrl, userId],
    );

    // وملفٌ مربوط بصورة منتج.
    const { rows: prod } = await db.query<{ id: string }>(
      'SELECT id FROM products LIMIT 1',
    );
    const linkedKey = `product/linked/${randomUUID()}.png`;
    const linkedUrl = `/uploads/${linkedKey}`;
    await db.query(
      `INSERT INTO media_files (storage_key, url, purpose, mime_type, size_bytes, uploaded_by, created_at)
       VALUES ($1, $2, 'product', 'image/png', 512, $3, now() - interval '2 days')`,
      [linkedKey, linkedUrl, userId],
    );
    await db.query(
      'INSERT INTO product_images (product_id, url, sort_order) VALUES ($1, $2, 99)',
      [prod[0]!.id, linkedUrl],
    );

    const found = await mediaRepo.findUnreferenced(db, new Date(Date.now() - 60_000));
    const urls = found.map((f) => f.url);
    expect(urls).toContain(orphanUrl);
    expect(urls).not.toContain(linkedUrl);
  });

  it('[CRITICAL] صورة الفتحة — الدائمة والمؤقّتة — ليست يتيمة، والاستعلام نفسه هو المفحوص', async () => {
    // الفتحة تُزرع مباشرةً (الفتحات تُعرَّف بالهجرات لا من اللوحة)، والصور
    // تُوضع عبر المسارين الحقيقيين. المرجع المخزَّن هو ما يُعدّ ربطاً — كما
    // `image_url` سواءً بسواء، بلا قاعدة زمنية: مؤقّتةٌ انتهت وما زال صفّ
    // الفتحة يشير إليها تبقى مربوطة حتى تُستبدل أو تُنهى.
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO visual_slots (slot_key, label, location, group_key)
       VALUES ($1, 'فتحة يتيم', 'موضع اختبار', 'other') RETURNING id`,
      [`zz_orphan_slot_${Date.now()}`],
    );
    const slotId = rows[0]!.id;
    try {
      const permanentUrl = await registerUploadedSlotImage();
      const temporaryUrl = await registerUploadedSlotImage();
      await db.query(
        "UPDATE media_files SET created_at = now() - interval '2 days' WHERE url = ANY($1)",
        [[permanentUrl, temporaryUrl]],
      );
      await api
        .put(`/api/admin/visual-slots/${slotId}/image`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ url: permanentUrl })
        .expect(200);
      await api
        .put(`/api/admin/visual-slots/${slotId}/temporary-image`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ url: temporaryUrl, until: new Date(Date.now() + 3_600_000).toISOString() })
        .expect(200);

      const threshold = new Date(Date.now() - 60_000);
      let urls = (await mediaRepo.findUnreferenced(db, threshold)).map((f) => f.url);
      expect(urls).not.toContain(permanentUrl);
      expect(urls).not.toContain(temporaryUrl);

      // انتهت المؤقّتة: المرجع ما يزال في الصفّ فما تزال مربوطة.
      await db.query(
        "UPDATE visual_slots SET temporary_until = now() - interval '1 second' WHERE id = $1",
        [slotId],
      );
      urls = (await mediaRepo.findUnreferenced(db, threshold)).map((f) => f.url);
      expect(urls).not.toContain(temporaryUrl);

      // أُنهيت صراحةً: الصفّ لا يشير إليها فتصير يتيمة — الملف يبقى (لا حذف).
      await api
        .delete(`/api/admin/visual-slots/${slotId}/temporary-image`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      urls = (await mediaRepo.findUnreferenced(db, threshold)).map((f) => f.url);
      expect(urls).toContain(temporaryUrl);
      expect(urls).not.toContain(permanentUrl);
    } finally {
      await db.query('DELETE FROM visual_slots WHERE id = $1', [slotId]);
    }
  });

  it('الملف المرفوع للتوّ لا يُعدّ يتيماً — حارس السباق', async () => {
    const { userId } = await registerAndLogin();
    const key = `review/fresh/${randomUUID()}.png`;
    const url = `/uploads/${key}`;
    await db.query(
      `INSERT INTO media_files (storage_key, url, purpose, mime_type, size_bytes, uploaded_by)
       VALUES ($1, $2, 'review', 'image/png', 512, $3)`,
      [key, url, userId],
    );

    const found = await mediaRepo.findUnreferenced(db, new Date(Date.now() - 60_000));
    expect(found.map((f) => f.url)).not.toContain(url);
  });

  it('[CRITICAL] كل عمود قد يحمل مرجع وسائط مغطّى في قائمة المراجع', async () => {
    const { rows } = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (column_name LIKE '%url%' OR column_name LIKE '%image%'
               OR column_name LIKE '%photo%' OR column_name LIKE '%avatar%')`,
    );

    // أعمدةٌ ليست مراجعَ ملفات مرفوعة: جدول الوسائط نفسه، وروابط خارجية
    // يكتبها المسؤول (تواصل اجتماعي، متجر التطبيقات).
    const notMediaReferences = new Set(['media_files', 'store_settings']);

    const covered = new Set(
      mediaRepo.MEDIA_REFERENCE_COLUMNS.map(([t, c]) => `${t}.${c}`),
    );
    const uncovered = rows
      .filter((r) => !notMediaReferences.has(r.table_name))
      .map((r) => `${r.table_name}.${r.column_name}`)
      .filter((k) => !covered.has(k));

    expect(uncovered, 'عمود جديد قد يحمل مرجع وسائط ولم يُدرَج في MEDIA_REFERENCE_COLUMNS').toEqual([]);
  });
});
