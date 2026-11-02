import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { api, createAdminUser, purgeTestUsers, registerAndLogin } from './helpers.js';
import { db } from '../src/database/pool.js';
import {
  compareVersionStrings,
  isBelowMinimum,
  parseVersion,
} from '../src/utils/semver.js';
import { resetAppVersionCache } from '../src/services/appVersionService.js';

/** يضبط إعدادات النسخة مباشرة في القاعدة ويُبطل التخبئة. */
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

async function clearVersionSettings() {
  await db.query(`DELETE FROM store_settings WHERE key LIKE 'app_%'`);
  resetAppVersionCache();
}

// ───────────────────────────── مقارنة النسخ ─────────────────────────────

describe('مقارنة النسخ الدلالية', () => {
  it('[CRITICAL] 1.10.0 أحدث من 1.9.0 — لا مقارنة نصّية', () => {
    // نصّياً `'1.10.0' < '1.9.0'` لأن `'1' < '9'`. هذا الخطأ بعينه يمرّر
    // نسخةً قديمة أو يحجب أحدث نسخة، بلا أي عرَض يكشفه.
    expect(compareVersionStrings('1.10.0', '1.9.0')).toBe(1);
    expect(isBelowMinimum('1.10.0', '1.9.0')).toBe(false);
    expect(isBelowMinimum('1.9.0', '1.10.0')).toBe(true);
  });

  it('الترتيب يمرّ على الأجزاء الثلاثة بالتسلسل', () => {
    const ascending = ['1.0.0', '1.0.1', '1.1.0', '1.9.0', '1.10.0', '2.0.0'];
    for (let i = 1; i < ascending.length; i += 1) {
      expect(
        compareVersionStrings(ascending[i - 1], ascending[i]),
        `${ascending[i - 1]} < ${ascending[i]}`,
      ).toBe(-1);
    }
  });

  it('المتساويتان متساويتان', () => {
    expect(compareVersionStrings('2.3.4', '2.3.4')).toBe(0);
    expect(isBelowMinimum('1.2.0', '1.2.0')).toBe(false);
  });

  it('ما قبل الإصدار أدنى من نظيره المستقرّ', () => {
    expect(compareVersionStrings('1.2.0-beta', '1.2.0')).toBe(-1);
    expect(compareVersionStrings('1.2.0-alpha', '1.2.0-beta')).toBe(-1);
    expect(compareVersionStrings('1.2.0-beta.2', '1.2.0-beta.10')).toBe(-1);
    // المعرّف الرقمي أدنى من النصّي، والأطول أعلى عند تساوي المقارَن.
    expect(compareVersionStrings('1.2.0-1', '1.2.0-alpha')).toBe(-1);
    expect(compareVersionStrings('1.2.0-a', '1.2.0-a.1')).toBe(-1);
  });

  it('بيانات البناء لا تدخل في الأسبقية — رقم بناء Flutter يقع هنا', () => {
    // `version: 1.0.0+1` في pubspec: الجزء بعد `+` رقم بناء لا نسخة.
    expect(compareVersionStrings('1.0.0+1', '1.0.0+99')).toBe(0);
    expect(parseVersion('1.0.0+7')?.patch).toBe(0);
  });

  it('[CRITICAL] المدخل الفاسد يعيد null — لا يُقرأ كـ«محجوب»', () => {
    // `null` تعني «لا أعرف». لو رجّعت الدالة `true` عند الفساد لحُجب كل
    // مستخدم كتب أحدهم في اللوحة حدّاً بصيغة خاطئة.
    for (const bad of ['', 'v1.2.3', '1.2', '1.2.3.4', 'abc', null, undefined, 12]) {
      expect(parseVersion(bad), `المدخل: ${String(bad)}`).toBeNull();
    }
    expect(isBelowMinimum('غير-صالح', '1.2.0')).toBeNull();
    expect(isBelowMinimum('1.2.0', '')).toBeNull();
  });
});

// ─────────────────────── مسار الإعداد العام ───────────────────────

/** صفحة تطبيقنا على Google Play — الشكل الوحيد المقبول لرابط التحديث (STEP 70). */
const PLAY = 'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy';

/** إجبارٌ نافذ كما حُفظ قبل STEP 70: مفعَّل + حدّ + رابط، بلا نوع ولا أحدث إصدار. */
async function enforce(minimum: string, url = PLAY) {
  await setVersionSettings({
    app_force_update_enabled: 'true',
    app_min_supported_version: minimum,
    app_update_url: url,
  });
}

describe('مسار إعدادات نسخة التطبيق', () => {
  afterEach(clearVersionSettings);

  it('يعيد الحدّ الفعلي والرابط بلا مصادقة — والحقول القديمة مشتقّة للنسخ المثبَّتة', async () => {
    await enforce('1.2.0');
    const res = await api.get('/api/catalog/app-version');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      forceUpdateEnabled: true,
      minimumSupportedVersion: '1.2.0',
      // النوع الفارغ (ما قبل STEP 70) إجباريٌّ كما كان.
      updateMode: 'mandatory',
      updateUrl: PLAY,
      revision: 0,
      // نسخة 1.0.0 تقرأ هذه: الرابط نفسه للمنصّتين، ولا رسالة مخصّصة؛ ولا
      // «أحدث» لأن هذه السياسة لم تضبطه.
      latestVersion: '',
      androidStoreUrl: PLAY,
      iosStoreUrl: PLAY,
      updateMessage: '',
      updateMessageCkb: '',
    });
  });

  it('[CRITICAL] بلا إعداد لا حدّ أدنى — التثبيت لا يغيّر سلوك أحد', async () => {
    const res = await api.get('/api/catalog/app-version');
    expect(res.status).toBe(200);
    expect(res.body.data.minimumSupportedVersion).toBe('');
    expect(res.body.data.forceUpdateEnabled).toBe(false);
  });

  it('[CRITICAL] الإجبار الموقوف لا يحجب ولو بقي حدٌّ محفوظ', async () => {
    await setVersionSettings({ app_force_update_enabled: 'false', app_min_supported_version: '9.0.0' });
    const res = await api.get('/api/catalog/app-version');
    expect(res.body.data).toMatchObject({ forceUpdateEnabled: false, minimumSupportedVersion: '' });
  });

  it('[CRITICAL] حدٌّ فاسد في القاعدة (كُتب خارج اللوحة) لا يحجب', async () => {
    await setVersionSettings({ app_force_update_enabled: 'true', app_min_supported_version: 'v2' });
    const res = await api.get('/api/catalog/app-version');
    expect(res.body.data).toMatchObject({ forceUpdateEnabled: false, minimumSupportedVersion: '' });
  });

  it('[CRITICAL] المسار مفتوح لنسخة محجوبة — وإلا صار الحجب حلقةً مغلقة', async () => {
    await enforce('9.0.0');
    // نفس الرأس الذي يُرفض به أي طلب محميّ.
    const res = await api.get('/api/catalog/app-version').set('X-App-Version', '1.0.0');
    expect(res.status).toBe(200);
    expect(res.body.data.minimumSupportedVersion).toBe('9.0.0');
  });
});

// ─────────────────────── الفرض على الخادم ───────────────────────

describe('رفض النسخ غير المدعومة على الخادم', () => {
  afterEach(clearVersionSettings);

  it('[CRITICAL] نسخة دون الحدّ تُرفض بـ426 حتى بتوكن صالح', async () => {
    // الحاجز في Flutter يُتجاوَز بتعديل التطبيق؛ هذا هو الحاجز الذي لا يُتجاوَز.
    const { token } = await registerAndLogin();
    await enforce('2.0.0');

    const res = await api
      .get('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .set('X-App-Version', '1.9.0');

    expect(res.status).toBe(426);
    expect(res.body.error.code).toBe('APP_UPDATE_REQUIRED');
    expect(res.body.error.details).toEqual({
      minimumSupportedVersion: '2.0.0',
      updateUrl: PLAY,
    });
  });

  it('[CRITICAL] 1.9.9 < 1.10.0 < 2.0.0 — المقارنة دلالية على الخادم أيضاً', async () => {
    const { token } = await registerAndLogin();
    await enforce('1.10.0');
    const status = async (version: string) =>
      (await api.get('/api/cart').set('Authorization', `Bearer ${token}`).set('X-App-Version', version)).status;
    expect(await status('1.9.9')).toBe(426);
    expect(await status('1.10.0')).toBe(200);
    expect(await status('2.0.0')).toBe(200);
  });

  it('الإجبار الموقوف لا يرفض أحداً', async () => {
    const { token } = await registerAndLogin();
    await setVersionSettings({ app_force_update_enabled: 'false', app_min_supported_version: '99.0.0' });
    const res = await api.get('/api/cart').set('Authorization', `Bearer ${token}`).set('X-App-Version', '1.0.0');
    expect(res.status).toBe(200);
  });

  it('النسخة المساوية للحدّ والأحدث منه تمرّان', async () => {
    const { token } = await registerAndLogin();
    await enforce('2.0.0');

    for (const version of ['2.0.0', '2.0.1', '10.0.0']) {
      const res = await api
        .get('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .set('X-App-Version', version);
      expect(res.status, `النسخة ${version}`).toBe(200);
    }
  });

  it('[CRITICAL] الرأس الغائب يمرّ — لا تعطيل شامل للعملاء الحاليين', async () => {
    // العميل الحالي لا يرسل الرأس أصلاً. حجبُ الغياب كان سيقطع الـAPI عن
    // كل من ثبّت التطبيق، وهو تعطيلٌ لا إجبارُ تحديث.
    const { token } = await registerAndLogin();
    await enforce('99.0.0');

    const res = await api.get('/api/cart').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('الرأس الفاسد يمرّ — لا حجب عند الشكّ', async () => {
    const { token } = await registerAndLogin();
    await enforce('99.0.0');

    const res = await api
      .get('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .set('X-App-Version', 'not-a-version');
    expect(res.status).toBe(200);
  });

  it('المصادقة تبقى مطلوبة — فحص النسخة لا يفتح مساراً محميّاً', async () => {
    await enforce('1.0.0');
    const res = await api.get('/api/cart').set('X-App-Version', '2.0.0');
    expect(res.status).toBe(401);
  });

  it('رسالة 426 نصٌّ افتراضي بلغة الطلب — كرديٌّ لطلبٍ كردي', async () => {
    const { token } = await registerAndLogin();
    await enforce('2.0.0');
    const reject = (language: string) =>
      api
        .get('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .set('Accept-Language', language)
        .set('X-App-Version', '1.9.0');
    expect((await reject('ar')).body.message).toBe('يلزم تحديث التطبيق للمتابعة');
    expect((await reject('ckb')).body.message).toBe('بۆ بەردەوامبوون ئەپەکە نوێ بکەرەوە');
  });
});

// ─────────────────────── ضبطها من اللوحة ───────────────────────

describe('ضبط سياسة التحديث من لوحة التحكم', () => {
  afterEach(clearVersionSettings);

  /** المراجعة التي يفتح عليها المسؤول الصفحة — الحفظ يحملها. */
  const revision = async (token: string) =>
    (await api.get('/api/admin/settings/app-version').set('Authorization', `Bearer ${token}`).expect(200)).body.data
      .revision as number;

  const save = (token: string, body: unknown) =>
    api.patch('/api/admin/settings/app-version').set('Authorization', `Bearer ${token}`).send(body as object);

  it('[CRITICAL] المسؤول يفعّل الإجبار بلا نشر خادم جديد — ويسري فوراً', async () => {
    const token = await createAdminUser();
    const policy = { enabled: true, mode: 'mandatory', latestVersion: '1.3.0', minimumVersion: '1.2.0', updateUrl: PLAY };
    const saved = await save(token, { ...policy, revision: await revision(token) });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data).toMatchObject({ ...policy, revision: 1, problem: null });

    // التخبئة تُبطَل مع الحفظ لا بعد مهلتها.
    const publicRes = await api.get('/api/catalog/app-version');
    expect(publicRes.body.data).toMatchObject({
      forceUpdateEnabled: true,
      updateMode: 'mandatory',
      minimumSupportedVersion: '1.2.0',
      latestVersion: '1.3.0',
      updateUrl: PLAY,
      revision: 1,
    });

    const read = await api.get('/api/admin/settings/app-version').set('Authorization', `Bearer ${token}`);
    expect(read.body.data).toMatchObject({ ...policy, revision: 1 });

    // الإيقاف يُبقي القيم للمرة القادمة ويرفع الحجب.
    await save(token, { enabled: false, revision: 1 }).expect(200);
    expect((await api.get('/api/catalog/app-version')).body.data).toMatchObject({
      minimumSupportedVersion: '',
      updateMode: 'none',
    });
    expect((await save(token, { enabled: false, revision: 1 })).status).toBe(409);
    const kept = await api.get('/api/admin/settings/app-version').set('Authorization', `Bearer ${token}`);
    expect(kept.body.data).toMatchObject({ ...policy, enabled: false, revision: 2 });
  });

  it('[CRITICAL] التفعيل بلا حدٍّ أو بلا رابط مرفوض — لا حبس بلا زرّ يعمل', async () => {
    const token = await createAdminUser();
    for (const body of [
      { enabled: true, mode: 'mandatory', latestVersion: '1.0.0', minimumVersion: '', updateUrl: PLAY },
      { enabled: true, mode: 'mandatory', latestVersion: '1.0.0', minimumVersion: '1.0.0', updateUrl: '' },
    ]) {
      const res = await save(token, { ...body, revision: 0 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await api.get('/api/catalog/app-version')).body.data.forceUpdateEnabled).toBe(false);
  });

  it('[CRITICAL] الحدّ بصيغة فاسدة يُرفض قبل الكتابة', async () => {
    const token = await createAdminUser();
    const res = await save(token, { enabled: true, mode: 'mandatory', minimumVersion: 'v1.2', updateUrl: PLAY, revision: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect((await api.get('/api/catalog/app-version')).body.data.minimumSupportedVersion).toBe('');
  });

  it('رابط التحديث صفحة تطبيقنا على Google Play وحدها — لا javascript: ولا موقع آخر', async () => {
    const token = await createAdminUser();
    for (const updateUrl of ['javascript:alert(1)', 'https://example.com/app.apk', 'http://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy']) {
      const res = await save(token, { enabled: false, updateUrl, revision: 0 });
      expect(res.status, updateUrl).toBe(400);
    }
  });

  it('الحقول القديمة مرفوضة لا مُسقَطة بصمت (جسمٌ صارم)', async () => {
    const token = await createAdminUser();
    const res = await save(token, { app_min_supported_version: '9.0.0' });
    expect(res.status).toBe(400);
    expect((await api.get('/api/catalog/app-version')).body.data.minimumSupportedVersion).toBe('');
  });

  it('التغيير مسجَّل قبل/بعد في سجلّ نشاط الإدارة', async () => {
    const token = await createAdminUser();
    await save(token, { enabled: true, mode: 'mandatory', latestVersion: '3.1.0', minimumVersion: '3.1.0', updateUrl: PLAY, revision: 0 }).expect(200);
    const { rows } = await db.query<{ details: { changes: Record<string, { before: string; after: string }> } }>(
      `SELECT details FROM admin_audit_log WHERE action = 'settings.app_version_updated' ORDER BY id DESC LIMIT 1`,
    );
    expect(rows[0]!.details.changes.app_min_supported_version).toEqual({ before: '', after: '3.1.0' });
    expect(rows[0]!.details.changes.app_force_update_enabled).toEqual({ before: '', after: 'true' });
  });

  it('[CRITICAL] غير المسؤول لا يملك حجب التطبيق', async () => {
    const { token } = await registerAndLogin();
    const res = await save(token, { enabled: true, mode: 'mandatory', minimumVersion: '99.0.0', updateUrl: PLAY, revision: 0 });
    expect(res.status).toBe(403);
    expect((await api.get('/api/catalog/app-version')).body.data.forceUpdateEnabled).toBe(false);
  });
});

// ─────────────────────── هجرة ٠٦٩ ───────────────────────

describe('هجرة 069 — الإعدادات الستّة إلى ثلاثة بلا تغيير في السلوك', () => {
  const migration = () =>
    readFile(new URL('../src/database/migrations/069_simplify_app_update.sql', import.meta.url), 'utf8');

  /** تُعاد الهجرة على صفوفٍ قديمة داخل معاملة تُلغى — القاعدة لا تتغيّر. */
  async function replay(before: Record<string, string>) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM store_settings WHERE key LIKE 'app_%'`);
      for (const [key, value] of Object.entries(before)) {
        await client.query('INSERT INTO store_settings (key, value) VALUES ($1, $2)', [key, value]);
      }
      await client.query(await migration());
      const { rows } = await client.query<{ key: string; value: string }>(
        `SELECT key, value FROM store_settings WHERE key LIKE 'app_%' ORDER BY key`,
      );
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  it('حدٌّ مضبوط ⇒ مفعَّل، ورابط أندرويد يصير رابط التحديث، والقديم يُحذف', async () => {
    expect(
      await replay({
        app_min_supported_version: '1.4.0',
        app_latest_version: '1.5.0',
        app_android_store_url: 'https://play.google.com/x',
        app_ios_store_url: 'https://apps.apple.com/x',
        app_update_message: 'حدّث',
        app_update_message_ckb: 'نوێ بکەرەوە',
      }),
    ).toEqual({
      app_force_update_enabled: 'true',
      app_min_supported_version: '1.4.0',
      app_update_url: 'https://play.google.com/x',
    });
  });

  it('بلا حدّ ⇒ موقوف؛ رابط آبل وحده يصير رابط التحديث', async () => {
    expect(await replay({ app_ios_store_url: 'https://apps.apple.com/x', app_min_supported_version: '' })).toEqual({
      app_force_update_enabled: 'false',
      app_min_supported_version: '',
      app_update_url: 'https://apps.apple.com/x',
    });
  });

  it('بيئةٌ لم تُضبط قطّ ⇒ موقوف ورابط فارغ', async () => {
    expect(await replay({})).toEqual({ app_force_update_enabled: 'false', app_update_url: '' });
  });
});

afterAll(async () => {
  await clearVersionSettings();
  await purgeTestUsers();
  await db.end();
});
