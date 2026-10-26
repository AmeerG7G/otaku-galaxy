import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/database/pool.js';
import { mediaRepo } from '../src/repositories/mediaRepo.js';
import { storage, uploadsRoot } from '../src/storage/index.js';
import {
  api,
  createAdminUser,
  createSubAdmin,
  purgeSubAdmins,
  registerAndLogin,
} from './helpers.js';

/**
 * خطّ الرفع كاملاً كما يمرّ به عميلٌ حقيقي — لا كما يرسله `supertest` المثالي.
 *
 * [CRITICAL] كل اختبارات الرفع السابقة كانت ترسل `contentType: 'image/png'`
 * مطابقاً للمحتوى. العملاء الحقيقيون لا يفعلون ذلك دائماً:
 *
 * - `image_picker` على أندرويد يعيد ترميز الصورة (JPEG/PNG) ويُبقي **امتداد
 *   الأصل** (`scaled_<اسم>.heic`)، فيعلن Dio النوعَ من الامتداد: `image/heic`
 *   لبايتاتٍ هي JPEG فعلاً.
 * - الملف بلا امتداد، وcurl، ومتصفّحٌ لا يعرف الامتداد: `application/octet-stream`.
 *
 * كان حارس `multer` يرفض هذه كلها على **النوع المعلَن** قبل أن يُفحص المحتوى
 * — أي أن الرفض وقع على قيمةٍ يتحكّم بها العميل، بينما الفحص الحقيقي (التوقيع
 * الثنائي) لم يُستشَر. هذا الملف يثبّت أن **المحتوى** هو الحَكَم: الصورة
 * الحقيقية تُقبل مهما كان وسمُها، وغير الصورة تُرفض مهما كان وسمُها.
 */

// توقيعات ثنائية حقيقية — ما يفحصه الخادم.
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x1a, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
// ترويسة PE (ملف تنفيذي لويندوز) — `MZ`.
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 0x90)]);

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

let adminToken: string;
let customer: { token: string; userId: string };
/** كل مرجعٍ أنشأه هذا الملف — يُحذف ملفّه وصفّه في النهاية. */
const createdUrls: string[] = [];

beforeAll(async () => {
  adminToken = await createAdminUser();
  const registered = await registerAndLogin();
  customer = { token: registered.token, userId: registered.userId };
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  for (const url of createdUrls) {
    const row = await mediaRepo.findByUrl(db, url);
    if (row) {
      await storage.remove(row.storage_key);
      await db.query('DELETE FROM media_files WHERE id = $1', [row.id]);
    }
  }
  await purgeSubAdmins();
});

function customerUpload(
  bytes: Buffer,
  file: { filename: string; contentType: string },
  purpose = 'review',
) {
  return api
    .post('/api/uploads')
    .set('Authorization', `Bearer ${customer.token}`)
    .attach('file', bytes, file)
    .field('purpose', purpose);
}

function adminUpload(
  bytes: Buffer,
  file: { filename: string; contentType: string },
  purpose = 'product',
  token = adminToken,
) {
  return api
    .post('/api/admin/uploads')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', bytes, file)
    .field('purpose', purpose);
}

function track(response: request.Response) {
  const url = response.body?.data?.url;
  if (typeof url === 'string') createdUrls.push(url);
  return response;
}

function diskPath(url: string) {
  return path.join(uploadsRoot, url.replace(/^\/uploads\//, ''));
}

describe('[CRITICAL] الرفع الناجح: ملفٌّ على القرص + صفٌّ في القاعدة + مرجعٌ يُخدَم', () => {
  it('صورة تقييم من زبون: 201، مرجعٌ نسبي غير قابل للتخمين، والملف والصف يطابقان المرفوع', async () => {
    const response = track(
      await customerUpload(JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' }),
    );

    expect(response.status).toBe(201);
    const { id, url } = response.body.data as { id: string; url: string };
    expect(url).toMatch(new RegExp(`^/uploads/review/\\d{4}/\\d{2}/${UUID}\\.jpg$`));

    // على القرص، داخل جذر التخزين، ببايتات المرفوع نفسها.
    const onDisk = diskPath(url);
    expect(path.relative(uploadsRoot, onDisk).startsWith('..')).toBe(false);
    expect(readFileSync(onDisk).equals(JPEG)).toBe(true);

    // صفّ الوسائط: المالك والغرض والنوع الحقيقي والحجم.
    const { rows } = await db.query(
      'SELECT url, purpose, mime_type, size_bytes, uploaded_by FROM media_files WHERE id = $1',
      [id],
    );
    expect(rows[0]).toEqual({
      url,
      purpose: 'review',
      mime_type: 'image/jpeg',
      size_bytes: JPEG.length,
      uploaded_by: customer.userId,
    });
  });

  it('صورة منتج من المسؤول تُخدَم من المرجع العائد بنوعها الصحيح وبلا تخمين نوع', async () => {
    const response = track(
      await adminUpload(PNG, { filename: 'p.png', contentType: 'image/png' }, 'product'),
    );
    expect(response.status).toBe(201);
    const { url } = response.body.data as { url: string };
    expect(url).toMatch(new RegExp(`^/uploads/product/\\d{4}/\\d{2}/${UUID}\\.png$`));

    const served = await api.get(url);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(served.body as Buffer).equals(PNG)).toBe(true);
  });

  it('بنر وصورة شخصية وWebP: كل غرضٍ في مجلّده', async () => {
    const banner = track(
      await adminUpload(WEBP, { filename: 'b.webp', contentType: 'image/webp' }, 'banner'),
    );
    expect(banner.status).toBe(201);
    expect(banner.body.data.url).toMatch(new RegExp(`^/uploads/banner/.+\\.webp$`));

    const avatar = track(
      await customerUpload(PNG, { filename: 'me.png', contentType: 'image/png' }, 'avatar'),
    );
    expect(avatar.status).toBe(201);
    expect(avatar.body.data.url).toMatch(new RegExp(`^/uploads/avatar/.+\\.png$`));
  });

  /**
   * التخزين على القرص لا في ذاكرة العملية: نسخةُ تطبيقٍ جديدة (ما يحدث عند
   * إعادة تشغيل الخادم) تخدم الملف نفسه من المرجع نفسه.
   */
  it('الملف يبقى متاحاً لنسخة تطبيقٍ جديدة — ما بعد إعادة التشغيل', async () => {
    const response = track(
      await customerUpload(JPEG, { filename: 'persist.jpg', contentType: 'image/jpeg' }),
    );
    expect(response.status).toBe(201);

    const restarted = request(createApp());
    const served = await restarted.get(response.body.data.url as string);
    expect(served.status).toBe(200);
    expect(Buffer.from(served.body as Buffer).equals(JPEG)).toBe(true);
  });
});

describe('[CRITICAL] المحتوى هو الحَكَم لا النوع المعلَن', () => {
  /**
   * ما يرسله تطبيق أندرويد فعلاً لصورةٍ أصلها HEIC: `image_picker` أعاد
   * ترميزها JPEG وسمّاها `scaled_….heic`، وDio أعلن `image/heic`.
   */
  it('JPEG حقيقي معلَنٌ `image/heic` باسم `.heic` يُقبل ويُخزَّن `.jpg` بنوعه الحقيقي', async () => {
    const response = track(
      await customerUpload(JPEG, { filename: 'scaled_IMG_0042.heic', contentType: 'image/heic' }),
    );
    expect(response.status).toBe(201);
    expect(response.body.data.url).toMatch(/\.jpg$/);

    const { rows } = await db.query('SELECT mime_type FROM media_files WHERE id = $1', [
      response.body.data.id,
    ]);
    expect(rows[0].mime_type).toBe('image/jpeg');
  });

  it('صورة حقيقية بلا امتداد ومعلَنة `application/octet-stream` تُقبل (Dio/curl/متصفّح لا يعرف الامتداد)', async () => {
    const customerRes = track(
      await customerUpload(PNG, { filename: 'image', contentType: 'application/octet-stream' }),
    );
    expect(customerRes.status).toBe(201);
    expect(customerRes.body.data.url).toMatch(/\.png$/);

    const adminRes = track(
      await adminUpload(WEBP, { filename: 'x', contentType: 'application/octet-stream' }),
    );
    expect(adminRes.status).toBe(201);
    expect(adminRes.body.data.url).toMatch(/\.webp$/);
  });

  it('PNG حقيقي معلَنٌ `image/jpeg` يُخزَّن `.png` — الامتداد يتبع المحتوى', async () => {
    const response = track(
      await adminUpload(PNG, { filename: 'wrong.jpg', contentType: 'image/jpeg' }),
    );
    expect(response.status).toBe(201);
    expect(response.body.data.url).toMatch(/\.png$/);
  });

  it('نصٌّ معلَنٌ نوعاً صورياً يُرفض UNSUPPORTED_MEDIA', async () => {
    const response = await customerUpload(HTML, { filename: 'evil.jpg', contentType: 'image/jpeg' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA');
  });

  it('نصٌّ معلَنٌ `application/octet-stream` يُرفض — التخفيف في الوسم لا في الفحص', async () => {
    const response = await customerUpload(HTML, {
      filename: 'evil',
      contentType: 'application/octet-stream',
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA');
  });

  it('نوعٌ غير صوري معلَنٌ بصدق (`text/html`) يُرفض مبكراً قبل التخزين', async () => {
    const response = await adminUpload(HTML, { filename: 'evil.html', contentType: 'text/html' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA');
  });

  /** [SECURITY] SVG يحمل سكربتاً ويُعرض كمستند — لا يُقبل بأي وسم. */
  it('[SECURITY] SVG يُرفض ولو أُعلن `image/svg+xml`', async () => {
    const response = await adminUpload(SVG, { filename: 'logo.svg', contentType: 'image/svg+xml' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA');
  });

  it('[SECURITY] ملف تنفيذي باسم وصورة `.jpg` يُرفض', async () => {
    const response = await customerUpload(EXE, { filename: 'setup.jpg', contentType: 'image/jpeg' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA');
  });

  it('ملفٌّ فارغ يُرفض', async () => {
    const response = await customerUpload(Buffer.alloc(0), {
      filename: 'empty.jpg',
      contentType: 'image/jpeg',
    });
    expect(response.status).toBe(400);
    expect(['EMPTY_FILE', 'UNSUPPORTED_MEDIA']).toContain(response.body.error.code);
  });
});

describe('[SECURITY] اسم الملف القادم من العميل لا يلمس المسار', () => {
  it('اسمٌ يحاول الخروج من الجذر يُتجاهَل: المفتاح uuid داخل مجلّد الغرض', async () => {
    const response = track(
      await customerUpload(JPEG, {
        filename: '../../../../etc/cron.d/evil.jpg',
        contentType: 'image/jpeg',
      }),
    );
    expect(response.status).toBe(201);
    const url = response.body.data.url as string;
    expect(url).toMatch(new RegExp(`^/uploads/review/\\d{4}/\\d{2}/${UUID}\\.jpg$`));
    expect(url).not.toContain('..');
    expect(url).not.toContain('evil');
    const onDisk = diskPath(url);
    expect(path.relative(uploadsRoot, onDisk).startsWith('..')).toBe(false);
    expect(existsSync(onDisk)).toBe(true);
  });

  it('الغرض خارج القائمة لا يصير مجلّداً', async () => {
    const response = await adminUpload(
      JPEG,
      { filename: 'a.jpg', contentType: 'image/jpeg' },
      '../../etc',
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('الحدود والصلاحيات', () => {
  it('ملفٌّ فوق السقف يُرفض FILE_TOO_LARGE برسالةٍ تذكر الحدّ', async () => {
    const oversized = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024 + 1024, 0)]);
    const response = await customerUpload(oversized, {
      filename: 'big.jpg',
      contentType: 'image/jpeg',
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('FILE_TOO_LARGE');
    expect(response.body.message).toContain('ميغابايت');
  });

  it('بلا توكن: 401 على مساري الزبون والإدارة', async () => {
    for (const route of ['/api/uploads', '/api/admin/uploads']) {
      const response = await api
        .post(route)
        .attach('file', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' })
        .field('purpose', 'review');
      expect(response.status).toBe(401);
    }
  });

  it('الزبون لا يرفع لغرضٍ إداري ولا عبر مسار الإدارة: 403', async () => {
    const asCustomer = await customerUpload(
      JPEG,
      { filename: 'a.jpg', contentType: 'image/jpeg' },
      'product',
    );
    expect(asCustomer.status).toBe(403);

    const viaAdminRoute = await adminUpload(
      JPEG,
      { filename: 'a.jpg', contentType: 'image/jpeg' },
      'product',
      customer.token,
    );
    expect(viaAdminRoute.status).toBe(403);
  });

  it('مسؤولٌ فرعي بلا المنتجات والبنرات: 403 ADMIN_PERMISSION_DENIED؛ ومن يملك البنرات يرفع', async () => {
    const orders = await createSubAdmin(['orders'], { suffix: 60 });
    const denied = await adminUpload(
      JPEG,
      { filename: 'a.jpg', contentType: 'image/jpeg' },
      'product',
      orders.token,
    );
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('ADMIN_PERMISSION_DENIED');

    const banners = await createSubAdmin(['banners'], { suffix: 61 });
    const allowed = track(
      await adminUpload(
        JPEG,
        { filename: 'a.jpg', contentType: 'image/jpeg' },
        'banner',
        banners.token,
      ),
    );
    expect(allowed.status).toBe(201);
  });
});

describe('[CRITICAL] فشل التخزين أو القاعدة لا يترك أثراً ولا يسرّب مساراً', () => {
  /**
   * القرص ممتلئ أو المجلّد بلا صلاحية كتابة (حجمٌ مُركَّب بمالكٍ خاطئ).
   * كان يخرج ٥٠٠ عامّاً «حدث خطأ غير متوقع» لا يميّزه المشغّل ولا العميل.
   */
  it('فشل الكتابة على القرص: 500 STORAGE_FAILED برسالةٍ بلا مسار داخلي، ولا صفّ', async () => {
    vi.spyOn(storage, 'save').mockRejectedValueOnce(
      Object.assign(new Error("EACCES: permission denied, mkdir '/app/uploads/review/2026'"), {
        code: 'EACCES',
      }),
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const before = await db.query('SELECT count(*)::int AS n FROM media_files WHERE uploaded_by = $1', [
      customer.userId,
    ]);

    const response = await customerUpload(JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('STORAGE_FAILED');
    expect(response.body.message).not.toMatch(/uploads|EACCES|\/app/);
    // المشغّل يرى السبب الحقيقي في السجل.
    expect(error).toHaveBeenCalled();
    const after = await db.query('SELECT count(*)::int AS n FROM media_files WHERE uploaded_by = $1', [
      customer.userId,
    ]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  /** الملف كُتب ثم فشل إدراج صفّه — لا يبقى ملفٌّ بلا سجلّ على القرص. */
  it('فشل إدراج الصف بعد الكتابة يحذف الملف المكتوب', async () => {
    const save = vi.spyOn(storage, 'save');
    vi.spyOn(mediaRepo, 'create').mockRejectedValueOnce(
      Object.assign(new Error('connection terminated'), { code: '57P01' }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await customerUpload(JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(500);
    expect(save).toHaveBeenCalledTimes(1);
    const saved = await save.mock.results[0]!.value as { storageKey: string };
    expect(existsSync(path.join(uploadsRoot, saved.storageKey))).toBe(false);
  });
});
