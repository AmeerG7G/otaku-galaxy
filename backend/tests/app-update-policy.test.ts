import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, createAdminUser, createSubAdmin, purgeSubAdmins, purgeTestUsers, registerAndLogin } from './helpers.js';
import { db } from '../src/database/pool.js';
import { adminAuditRepo } from '../src/repositories/adminAuditRepo.js';
import { resetAppVersionCache } from '../src/services/appVersionService.js';
import { APP_PACKAGE_IDS, canonicalPlayStoreUrl } from '../src/utils/playStoreUrl.js';

/**
 * [CRITICAL] سياسة تحديث التطبيق من اللوحة (STEP 70، قرار المالك 2026-10-24):
 * أحدث إصدار + نوع التحديث (اختياري/إجباري) فوق حقول STEP 64، بلا رسالة مسؤول.
 *
 * «إرسال التحديث» ينشر السياسة إلى الخادم وحده — لا يرفع APK ولا ينشر إصداراً
 * على Google Play.
 */

const PLAY = 'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy';

async function setVersionSettings(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    await db.query(
      `INSERT INTO store_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value],
    );
  }
  resetAppVersionCache();
}

/**
 * قاعدة الاختبار وحدها: السياسة **وسجلّها** يُمحيان بين الاختبارات، وإلا قرأ
 * «السجلّ» صفوف اختباراتٍ سبقت (السجلّ في الواقع لا يُمحى أبداً).
 */
async function clearVersionSettings() {
  await db.query(`DELETE FROM store_settings WHERE key LIKE 'app_%'`);
  await db.query(`DELETE FROM admin_audit_log WHERE action = 'settings.app_version_updated'`);
  resetAppVersionCache();
}

const publicPolicy = async () => (await api.get('/api/catalog/app-version').expect(200)).body.data;

// ───────────────────────────── رابط المتجر ─────────────────────────────

describe('[SECURITY] رابط التحديث = صفحة تطبيقنا على Google Play وحدها', () => {
  it('يقبل صفحة التطبيق ويعيدها بشكلها القانوني (تُسقَط المعاملات الأخرى)', () => {
    expect(canonicalPlayStoreUrl(PLAY)).toBe(PLAY);
    expect(canonicalPlayStoreUrl(`  ${PLAY}&hl=ar&referrer=x#reviews  `)).toBe(PLAY);
    expect(canonicalPlayStoreUrl('https://play.google.com/store/apps/details?hl=ar&id=com.otakugalaxy.otaku_galaxy.staging')).toBe(
      'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy.staging',
    );
  });

  it('يرفض كل ما سواه: مخطّط، نطاق، مستخدم، منفذ، مسار، حزمة غريبة', () => {
    for (const bad of [
      '',
      'not a url',
      'javascript:alert(1)',
      'market://details?id=com.otakugalaxy.otaku_galaxy',
      'intent://details?id=com.otakugalaxy.otaku_galaxy#Intent;scheme=market;end',
      'http://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
      'https://play.google.com.evil.example/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
      'https://evil.example/play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
      'https://evil.example/?u=https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
      'https://user:pw@play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
      'https://play.google.com:8443/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
      'https://play.google.com/store/apps/dev?id=com.otakugalaxy.otaku_galaxy',
      'https://play.google.com/store/apps/details',
      'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy&id=com.evil.app',
      'https://play.google.com/store/apps/details?id=com.evil.app',
      'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy.evil',
      'https://apps.apple.com/app/id123',
    ]) {
      expect(canonicalPlayStoreUrl(bad), bad).toBeNull();
    }
    expect(canonicalPlayStoreUrl(42)).toBeNull();
    expect(canonicalPlayStoreUrl(null)).toBeNull();
  });

  it('[CRITICAL] قائمة الحِزم = applicationId ولاحقتا dev/staging في build.gradle.kts', async () => {
    const gradle = await readFile(new URL('../../android/app/build.gradle.kts', import.meta.url), 'utf8');
    const base = /applicationId\s*=\s*"([^"]+)"/.exec(gradle)?.[1];
    const suffixes = [...gradle.matchAll(/applicationIdSuffix\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(base).toBe('com.otakugalaxy.otaku_galaxy');
    expect([...APP_PACKAGE_IDS].sort()).toEqual([base, ...suffixes.map((s) => `${base}${s}`)].sort());
  });
});

// ─────────────────────── النوعان كما تراهما التطبيقات ───────────────────────

describe('اختياري وإجباري في الردّ العامّ وعلى الخادم', () => {
  afterEach(clearVersionSettings);

  it('اختياري: أحدث إصدار يصل، ولا حدّ أدنى ولا 426 — ولو بقي حدٌّ محفوظ', async () => {
    await setVersionSettings({
      app_force_update_enabled: 'true',
      app_update_mode: 'optional',
      app_latest_version: '1.4.0',
      app_min_supported_version: '1.3.0',
      app_update_url: PLAY,
    });
    expect(await publicPolicy()).toMatchObject({
      updateMode: 'optional',
      latestVersion: '1.4.0',
      minimumSupportedVersion: '',
      forceUpdateEnabled: false,
      updateUrl: PLAY,
    });
    const { token } = await registerAndLogin();
    await api.get('/api/cart').set('Authorization', `Bearer ${token}`).set('X-App-Version', '1.0.0').expect(200);
  });

  it('إجباري مع أحدث إصدار: الحدّ يحجب، وأحدث إصدار يصل للتنبيه بين الاثنين', async () => {
    await setVersionSettings({
      app_force_update_enabled: 'true',
      app_update_mode: 'mandatory',
      app_latest_version: '1.4.0',
      app_min_supported_version: '1.2.0',
      app_update_url: PLAY,
    });
    expect(await publicPolicy()).toMatchObject({
      updateMode: 'mandatory',
      forceUpdateEnabled: true,
      minimumSupportedVersion: '1.2.0',
      latestVersion: '1.4.0',
    });
    const { token } = await registerAndLogin();
    const status = async (version: string) =>
      (await api.get('/api/cart').set('Authorization', `Bearer ${token}`).set('X-App-Version', version)).status;
    expect(await status('1.1.9')).toBe(426);
    expect(await status('1.2.0')).toBe(200);
    expect(await status('1.3.0')).toBe(200);
  });

  it('[CRITICAL] سياسةٌ مفعّلة برابطٍ غير صفحة تطبيقنا (كُتب خارج اللوحة) لا تحجب ولا تنبّه', async () => {
    for (const url of ['https://example.com/app.apk', 'https://play.google.com/store/apps/details?id=com.evil.app']) {
      await setVersionSettings({
        app_force_update_enabled: 'true',
        app_update_mode: 'mandatory',
        app_min_supported_version: '9.0.0',
        app_latest_version: '9.0.0',
        app_update_url: url,
      });
      expect(await publicPolicy(), url).toMatchObject({ updateMode: 'none', minimumSupportedVersion: '', latestVersion: '', updateUrl: '' });
    }
  });

  it('[CRITICAL] نوعٌ محفوظ غير معروف لا يحجب', async () => {
    await setVersionSettings({
      app_force_update_enabled: 'true',
      app_update_mode: 'force',
      app_min_supported_version: '9.0.0',
      app_update_url: PLAY,
    });
    expect(await publicPolicy()).toMatchObject({ updateMode: 'none', minimumSupportedVersion: '' });
  });

  it('سياسةٌ حُفظت قبل STEP 70 (بلا نوع ولا أحدث إصدار) تبقى تحجب كما كانت', async () => {
    await setVersionSettings({ app_force_update_enabled: 'true', app_min_supported_version: '1.5.0', app_update_url: PLAY });
    expect(await publicPolicy()).toMatchObject({ updateMode: 'mandatory', minimumSupportedVersion: '1.5.0', latestVersion: '' });
  });

  it('الرابط يبقى في الردّ والسياسة موقوفة — الموقع يعرضه رابطَ «Google Play»', async () => {
    await setVersionSettings({ app_force_update_enabled: 'false', app_update_url: PLAY });
    expect(await publicPolicy()).toMatchObject({ updateMode: 'none', updateUrl: PLAY, androidStoreUrl: PLAY });
  });

  it('لا تخبئة: كل قراءة تصل إلى الخادم', async () => {
    const res = await api.get('/api/catalog/app-version').expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

// ─────────────────────── النشر من اللوحة ───────────────────────

describe('[CRITICAL] «إرسال التحديث» من اللوحة: تحقّق، مراجعة، تراجع، سجلّ', () => {
  beforeEach(clearVersionSettings);
  afterEach(async () => {
    vi.restoreAllMocks();
    await clearVersionSettings();
  });

  const view = async (token: string) =>
    (await api.get('/api/admin/settings/app-version').set('Authorization', `Bearer ${token}`).expect(200)).body.data;
  const save = (token: string, body: Record<string, unknown>) =>
    api.patch('/api/admin/settings/app-version').set('Authorization', `Bearer ${token}`).send(body);

  const mandatory = { enabled: true, mode: 'mandatory', latestVersion: '1.2.0', minimumVersion: '1.1.0', updateUrl: PLAY };

  it('الحالة الأولى: موقوفة، مراجعة ٠، بلا سجلّ ولا مشكلة', async () => {
    const token = await createAdminUser();
    expect(await view(token)).toMatchObject({
      enabled: false,
      mode: 'mandatory',
      revision: 0,
      problem: null,
      updatedAt: null,
      effective: { updateMode: 'none' },
    });
  });

  it('حدودُ التحقّق: اختياري بلا أحدث إصدار، حدٌّ فوق أحدث إصدار، نسخ فاسدة، حزمةٌ غريبة', async () => {
    const token = await createAdminUser();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ enabled: true, mode: 'optional', latestVersion: '', updateUrl: PLAY }, 'أحدث إصدار'],
      [{ ...mandatory, minimumVersion: '1.3.0' }, 'أعلى من أحدث إصدار'],
      [{ ...mandatory, minimumVersion: '' }, 'الحدّ الأدنى'],
      [{ ...mandatory, latestVersion: '1.2' }, 'بصيغة'],
      [{ ...mandatory, updateUrl: 'https://play.google.com/store/apps/details?id=com.evil.app' }, 'Google Play'],
      [{ ...mandatory, mode: 'force' }, 'نوع التحديث'],
      [{ ...mandatory, updateUrl: '' }, 'Google Play'],
    ];
    for (const [body, message] of cases) {
      const res = await save(token, { ...body, revision: 0 });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.message, JSON.stringify(body)).toContain(message);
    }
    expect(await view(token)).toMatchObject({ revision: 0, enabled: false });
    expect(await publicPolicy()).toMatchObject({ updateMode: 'none' });
  });

  it('الحدّ يساوي أحدث إصدار مقبول؛ والرابط يُحفظ بشكله القانوني', async () => {
    const token = await createAdminUser();
    const res = await save(token, { ...mandatory, minimumVersion: '1.2.0', updateUrl: `${PLAY}&hl=ar`, revision: 0 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ minimumVersion: '1.2.0', updateUrl: PLAY, revision: 1 });
  });

  it('[CRITICAL] الحفظ على مراجعةٍ قديمة يُرفض ولا يكتب شيئاً — ولا حفظان متزامنان على المراجعة نفسها', async () => {
    const token = await createAdminUser();
    await save(token, { ...mandatory, revision: 0 }).expect(200);

    const stale = await save(token, { ...mandatory, minimumVersion: '1.2.0', revision: 0 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('APP_UPDATE_POLICY_CHANGED');
    expect(await view(token)).toMatchObject({ minimumVersion: '1.1.0', revision: 1 });

    const results = await Promise.all([
      save(token, { ...mandatory, minimumVersion: '1.0.0', revision: 1 }),
      save(token, { ...mandatory, minimumVersion: '1.2.0', revision: 1 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const after = await view(token);
    expect(after.revision).toBe(2);
    const winner = results.find((r) => r.status === 200)!;
    expect(after.minimumVersion).toBe(winner.body.data.minimumVersion);
  });

  it('[CRITICAL] التراجع: «إيقاف» يرفع الحجب فوراً ولا يُرفض ولو كان المحفوظ لا يجتاز التحقّق', async () => {
    const token = await createAdminUser();
    // سياسةٌ كُتبت خارج اللوحة برابطٍ لا يُقبل اليوم: الإيقاف يجب ألّا يتوقّف عليه.
    await setVersionSettings({
      app_force_update_enabled: 'true',
      app_update_mode: 'mandatory',
      app_min_supported_version: '9.0.0',
      app_update_url: 'https://example.com/app.apk',
    });
    const before = await view(token);
    expect(before.problem).toContain('Google Play');

    await save(token, { enabled: false, revision: before.revision }).expect(200);
    const after = await view(token);
    expect(after).toMatchObject({ enabled: false, minimumVersion: '9.0.0', updateUrl: 'https://example.com/app.apk', problem: null });
    expect(await publicPolicy()).toMatchObject({ updateMode: 'none', minimumSupportedVersion: '' });
  });

  it('[CRITICAL] من التفعيل إلى الحجب ثم الإيقاف ثم الاستعادة من السجلّ — والتطبيق القديم يتبع في كل خطوة', async () => {
    const token = await createAdminUser();
    const { token: customer } = await registerAndLogin();
    const cart = async () =>
      (await api.get('/api/cart').set('Authorization', `Bearer ${customer}`).set('X-App-Version', '1.0.0')).status;

    await save(token, { ...mandatory, revision: 0 }).expect(200);
    expect(await cart()).toBe(426);

    await save(token, { enabled: false, revision: 1 }).expect(200);
    expect(await cart()).toBe(200);

    // السجلّ يحمل لقطة كل مراجعة: «استعادة» تعيد إرسالها كما هي.
    const { history } = await view(token);
    expect(history.map((h: { revision: number }) => h.revision)).toEqual([2, 1]);
    expect(history[1]).toMatchObject({ actorName: expect.any(String), policy: mandatory });
    await save(token, { ...history[1].policy, revision: 2 }).expect(200);
    expect(await cart()).toBe(426);
    expect(await view(token)).toMatchObject({ ...mandatory, revision: 3, updatedBy: expect.any(String), updatedAt: expect.any(String) });
  });

  it('حفظٌ لا يغيّر شيئاً لا يزيد المراجعة ولا يكتب سجلّاً', async () => {
    const token = await createAdminUser();
    await save(token, { ...mandatory, revision: 0 }).expect(200);
    await save(token, { ...mandatory, revision: 1 }).expect(200);
    const after = await view(token);
    expect(after.revision).toBe(1);
    expect(after.history).toHaveLength(1);
  });

  it('[CRITICAL] السجلّ جزءٌ من المعاملة: فشلُ كتابته يُلغي الحفظ كله', async () => {
    const token = await createAdminUser();
    vi.spyOn(adminAuditRepo, 'record').mockRejectedValueOnce(new Error('audit down'));
    const res = await save(token, { ...mandatory, revision: 0 });
    expect(res.status).toBe(500);
    vi.restoreAllMocks();
    expect(await view(token)).toMatchObject({ enabled: false, minimumVersion: '', revision: 0 });
    expect(await publicPolicy()).toMatchObject({ updateMode: 'none' });

    // والعكس: سجلٌّ كُتب ثم فشل ما بعده لا يبقى شاهداً على تغييرٍ لم يقع.
    const original = adminAuditRepo.record.bind(adminAuditRepo);
    vi.spyOn(adminAuditRepo, 'record').mockImplementationOnce(async (client, entry) => {
      await original(client, entry);
      throw new Error('after audit');
    });
    expect((await save(token, { ...mandatory, revision: 0 })).status).toBe(500);
    vi.restoreAllMocks();
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM admin_audit_log WHERE action = 'settings.app_version_updated'`,
    );
    expect(rows[0]!.n).toBe(0);
    expect(await view(token)).toMatchObject({ enabled: false, revision: 0 });
  });

  it('[CRITICAL] مسؤولٌ فرعي بلا «الإعدادات» لا يقرأ السياسة ولا ينشرها؛ ومعها يملكهما', async () => {
    const without = await createSubAdmin(['products'], { suffix: 900 });
    const withSettings = await createSubAdmin(['settings'], { suffix: 901 });
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    await api.get('/api/admin/settings/app-version').set(auth(without.token)).expect(403);
    await api.patch('/api/admin/settings/app-version').set(auth(without.token)).send({ ...mandatory, revision: 0 }).expect(403);
    expect(await publicPolicy()).toMatchObject({ updateMode: 'none' });

    await api.patch('/api/admin/settings/app-version').set(auth(withSettings.token)).send({ ...mandatory, revision: 0 }).expect(200);
    expect(await publicPolicy()).toMatchObject({ updateMode: 'mandatory' });
    await purgeSubAdmins();
  });

  it('عميلٌ وزائر لا يكتبان؛ والمسار العامّ للقراءة وحدها', async () => {
    const { token } = await registerAndLogin();
    await api.patch('/api/admin/settings/app-version').set('Authorization', `Bearer ${token}`).send({ ...mandatory, revision: 0 }).expect(403);
    await api.patch('/api/admin/settings/app-version').send({ ...mandatory, revision: 0 }).expect(401);
    // لا مسار كتابة عامّ: أي فعلٍ غير GET يقع على الموجّه المحميّ فيُرفض.
    for (const method of ['post', 'patch', 'put', 'delete'] as const) {
      const res = await api[method]('/api/catalog/app-version').send({ ...mandatory });
      expect(res.status, method).toBeGreaterThanOrEqual(400);
    }
    expect(await publicPolicy()).toMatchObject({ updateMode: 'none' });
  });
});

afterAll(async () => {
  await clearVersionSettings();
  await purgeSubAdmins();
  await purgeTestUsers();
  await db.end();
});
