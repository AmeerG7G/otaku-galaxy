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

describe('مسار إعدادات نسخة التطبيق', () => {
  afterEach(clearVersionSettings);

  it('يعيد الإعداد كاملاً بلا مصادقة', async () => {
    await setVersionSettings({
      app_min_supported_version: '1.2.0',
      app_latest_version: '1.3.0',
      app_android_store_url: 'https://play.google.com/store/apps/details?id=x',
      app_ios_store_url: 'https://apps.apple.com/app/id1',
      app_update_message: 'حدّث التطبيق من فضلك',
    });

    const res = await api.get('/api/catalog/app-version');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      minimumSupportedVersion: '1.2.0',
      latestVersion: '1.3.0',
      androidStoreUrl: 'https://play.google.com/store/apps/details?id=x',
      iosStoreUrl: 'https://apps.apple.com/app/id1',
      updateMessage: 'حدّث التطبيق من فضلك',
    });
  });

  it('[CRITICAL] بلا إعداد لا حدّ أدنى — التثبيت لا يغيّر سلوك أحد', async () => {
    const res = await api.get('/api/catalog/app-version');
    expect(res.status).toBe(200);
    expect(res.body.data.minimumSupportedVersion).toBe('');
  });

  it('[CRITICAL] المسار مفتوح لنسخة محجوبة — وإلا صار الحجب حلقةً مغلقة', async () => {
    await setVersionSettings({ app_min_supported_version: '9.0.0' });
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
    await setVersionSettings({ app_min_supported_version: '2.0.0' });

    const res = await api
      .get('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .set('X-App-Version', '1.9.0');

    expect(res.status).toBe(426);
    expect(res.body.error.code).toBe('APP_UPDATE_REQUIRED');
  });

  it('النسخة المساوية للحدّ والأحدث منه تمرّان', async () => {
    const { token } = await registerAndLogin();
    await setVersionSettings({ app_min_supported_version: '2.0.0' });

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
    await setVersionSettings({ app_min_supported_version: '99.0.0' });

    const res = await api.get('/api/cart').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('الرأس الفاسد يمرّ — لا حجب عند الشكّ', async () => {
    const { token } = await registerAndLogin();
    await setVersionSettings({ app_min_supported_version: '99.0.0' });

    const res = await api
      .get('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .set('X-App-Version', 'not-a-version');
    expect(res.status).toBe(200);
  });

  it('المصادقة تبقى مطلوبة — فحص النسخة لا يفتح مساراً محميّاً', async () => {
    await setVersionSettings({ app_min_supported_version: '1.0.0' });
    const res = await api.get('/api/cart').set('X-App-Version', '2.0.0');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────── ضبطها من اللوحة ───────────────────────

describe('ضبط الحدّ الأدنى من لوحة التحكم', () => {
  afterEach(clearVersionSettings);

  it('[CRITICAL] المسؤول يرفع الحدّ بلا نشر خادم جديد', async () => {
    const token = await createAdminUser();

    const saved = await api
      .patch('/api/admin/settings/app-version')
      .set('Authorization', `Bearer ${token}`)
      .send({
        app_min_supported_version: '1.2.0',
        app_latest_version: '1.3.0',
        app_android_store_url: 'https://play.google.com/store/apps/details?id=x',
      });
    expect(saved.status).toBe(200);

    // يظهر فوراً على المسار العام: التخبئة تُبطَل مع الحفظ لا بعد مهلتها.
    const publicRes = await api.get('/api/catalog/app-version');
    expect(publicRes.body.data.minimumSupportedVersion).toBe('1.2.0');
    expect(publicRes.body.data.latestVersion).toBe('1.3.0');
  });

  it('[CRITICAL] الحدّ بصيغة فاسدة يُرفض قبل الكتابة', async () => {
    // الخطأ هنا يحجب التطبيق عن كل مستخدميه، فلا يُقبل حفظه أصلاً.
    const token = await createAdminUser();
    const res = await api
      .patch('/api/admin/settings/app-version')
      .set('Authorization', `Bearer ${token}`)
      .send({ app_min_supported_version: 'v1.2' });
    // 400 هو عقد التحقق الموحّد في هذا الخادم (`parse` في utils/zod).
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    const publicRes = await api.get('/api/catalog/app-version');
    expect(publicRes.body.data.minimumSupportedVersion).toBe('');
  });

  it('رابط المتجر يجب أن يكون http(s) — لا javascript:', async () => {
    const token = await createAdminUser();
    const res = await api
      .patch('/api/admin/settings/app-version')
      .set('Authorization', `Bearer ${token}`)
      .send({ app_android_store_url: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  it('[CRITICAL] غير المسؤول لا يملك حجب التطبيق', async () => {
    const { token } = await registerAndLogin();
    const res = await api
      .patch('/api/admin/settings/app-version')
      .set('Authorization', `Bearer ${token}`)
      .send({ app_min_supported_version: '99.0.0' });
    expect(res.status).toBe(403);
  });
});

afterAll(async () => {
  await clearVersionSettings();
  await purgeTestUsers();
  await db.end();
});
