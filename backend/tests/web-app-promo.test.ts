import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { WEB_APP_PROMO_SETTING_KEYS } from '../src/repositories/settingsRepo.js';
import { officialPlayStoreUrl } from '../src/utils/playStoreUrl.js';
import { api, createAdminUser } from './helpers.js';

/**
 * إعلان «حمّل التطبيق من Google Play» في المتجر الإلكتروني — إعدادات المتجر
 * (مفتاح/قيمة، بلا هجرة)، يُظهره المسؤول ويخفيه بلا حذف، ووجهته صفحة تطبيق
 * الإنتاج على Google Play وحدها.
 */
const PLAY = 'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy';

const clear = () =>
  db.query('DELETE FROM store_settings WHERE key = ANY($1::text[])', [[...WEB_APP_PROMO_SETTING_KEYS]]);

describe('officialPlayStoreUrl — وجهة الإعلان صفحة تطبيق الإنتاج فقط', () => {
  it('يقبل صفحة تطبيق الإنتاج ويعيدها بشكلها القانوني', () => {
    expect(officialPlayStoreUrl(PLAY)).toBe(PLAY);
    expect(officialPlayStoreUrl(` ${PLAY}&hl=ar#reviews `)).toBe(PLAY);
  });

  it('يرفض نسختي dev/staging وAPK والمتاجر الأخرى وكل ما ليس صفحة Play', () => {
    for (const bad of [
      'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy.staging',
      'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy.dev',
      'https://play.google.com/store/apps/details?id=com.example.other',
      'https://otakugalaxystore.com/app.apk',
      'https://apps.apple.com/app/id123',
      'https://www.amazon.com/gp/mas/dl/android?p=com.otakugalaxy.otaku_galaxy',
      'http://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
      'https://play.google.com.evil.example/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
      'javascript:alert(1)',
      '',
      null,
    ]) {
      expect(officialPlayStoreUrl(bad), String(bad)).toBeNull();
    }
  });
});

describe('إعلان التطبيق عبر الإعدادات', () => {
  let token: string;
  const save = (body: Record<string, unknown>) =>
    api.patch('/api/admin/settings').set('Authorization', `Bearer ${token}`).send(body);
  const publicPromo = async () => (await api.get('/api/catalog/settings').expect(200)).body.data.webAppPromo;

  beforeEach(async () => {
    await clear();
    token ??= await createAdminUser();
  });
  afterAll(clear);

  it('غير مضبوط = مخفيّ (null) — سلوك ما قبل الميزة', async () => {
    expect(await publicPromo()).toBeNull();
  });

  it('المسؤول يضبطه ويظهره فيصل المتجر بنصوصه ورابطه', async () => {
    const res = await save({
      web_app_promo_title: 'تطبيق مجرة الأوتاكو',
      web_app_promo_subtitle: 'تسوّق أسرع من هاتفك',
      web_app_promo_cta: 'حمّل التطبيق الآن',
      web_app_promo_url: `${PLAY}&hl=ar`,
      web_app_promo_style: 'night',
      web_app_promo_enabled: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.web_app_promo_url).toBe(PLAY);
    expect(await publicPromo()).toEqual({
      title: 'تطبيق مجرة الأوتاكو',
      subtitle: 'تسوّق أسرع من هاتفك',
      cta: 'حمّل التطبيق الآن',
      url: PLAY,
      style: 'night',
    });
  });

  it('الإخفاء لا يحذف شيئاً، والإظهار ثانيةً يعيده كما كان', async () => {
    await save({ web_app_promo_title: 'عنوان', web_app_promo_url: PLAY, web_app_promo_enabled: true }).then((r) =>
      expect(r.status).toBe(200),
    );
    await save({ web_app_promo_enabled: false }).then((r) => expect(r.status).toBe(200));
    expect(await publicPromo()).toBeNull();
    const { body } = await api.get('/api/admin/settings').set('Authorization', `Bearer ${token}`).expect(200);
    expect(body.data).toMatchObject({ web_app_promo_enabled: 'false', web_app_promo_title: 'عنوان', web_app_promo_url: PLAY });

    await save({ web_app_promo_enabled: true }).then((r) => expect(r.status).toBe(200));
    expect((await publicPromo()).title).toBe('عنوان');
  });

  it('[CRITICAL] لا يُظهَر بلا رابط، ولا يُمسح رابطه وهو ظاهر', async () => {
    const enable = await save({ web_app_promo_enabled: true });
    expect(enable.status).toBe(400);
    expect(enable.body.error.code).toBe('VALIDATION_ERROR');
    expect(await publicPromo()).toBeNull();

    await save({ web_app_promo_url: PLAY, web_app_promo_enabled: true }).then((r) => expect(r.status).toBe(200));
    expect((await save({ web_app_promo_url: '' })).status).toBe(400);
    expect((await publicPromo()).url).toBe(PLAY);
  });

  it('[SECURITY] الرابط صفحة Play لتطبيق الإنتاج وحدها — لا APK ولا متجر آخر ولا javascript:', async () => {
    for (const bad of [
      'https://otakugalaxystore.com/otaku-galaxy.apk',
      'https://apps.apple.com/app/id123',
      'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy.staging',
      'javascript:alert(1)',
    ]) {
      const res = await save({ web_app_promo_url: bad });
      expect(res.status, bad).toBe(400);
    }
    expect((await save({ web_app_promo_enabled: 'yes' })).status).toBe(400);
    expect((await save({ web_app_promo_style: 'neon' })).status).toBe(400);
    expect((await save({ web_app_promo_title: 'x'.repeat(61) })).status).toBe(400);
  });

  it('[SECURITY] صفٌّ فاسد في القاعدة لا يصل الجمهور', async () => {
    await db.query(
      `INSERT INTO store_settings (key, value) VALUES
         ('web_app_promo_enabled', 'true'), ('web_app_promo_url', 'https://evil.example/app.apk')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    expect(await publicPromo()).toBeNull();
  });

  it('التغيير يُسجَّل في سجلّ المسؤول قبل/بعد', async () => {
    await save({ web_app_promo_url: PLAY, web_app_promo_enabled: true }).then((r) => expect(r.status).toBe(200));
    const audit = await db.query<{ details: { changes: Record<string, unknown> } }>(
      `SELECT details FROM admin_audit_log WHERE action = 'settings.updated' ORDER BY id DESC LIMIT 1`,
    );
    expect(audit.rows[0]!.details.changes.web_app_promo_enabled).toEqual({ before: '', after: 'true' });
  });

  it('بلا مصادقة لا يُكتب شيء', async () => {
    await api.patch('/api/admin/settings').send({ web_app_promo_enabled: false }).expect(401);
  });
});
