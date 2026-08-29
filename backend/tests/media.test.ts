import { beforeAll, describe, expect, it } from 'vitest';
import { api, createAdminUser, registerAndLogin } from './helpers.js';

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

  it('rejects an honestly declared non-image type', async () => {
    const response = await api
      .post('/api/uploads')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', NOT_AN_IMAGE, { filename: 'evil.html', contentType: 'text/html' })
      .field('purpose', 'product');
    expect(response.status).toBe(400);
  });
});
