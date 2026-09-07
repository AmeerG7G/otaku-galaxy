import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * استهداف الإشعارات وشرائح الزبائن.
 *
 * ثلاث حالات استهداف (الكل / زبون واحد / عدة زبائن) وشرائح محسوبة من
 * القاعدة (أعياد الميلاد، وجود طلبات). و«اليوم» يُحسب بمنطقة المتجر
 * الزمنية لا بساعة الخادم — وهو الفرق بين تهنئة تصل في يومها وأخرى
 * تسبقه بثلاث ساعات.
 */
describe('استهداف الإشعارات وشرائح الزبائن', () => {
  let adminToken: string;
  let today: { id: string; token: string };
  let soon: { id: string; token: string };
  let far: { id: string; token: string };
  let noBirthday: { id: string; token: string };

  /** «اليوم» بتقويم المتجر — نفس ما يحسبه الخادم في استعلاماته. */
  async function storeToday(): Promise<{ day: number; month: number }> {
    const { rows } = await db.query<{ d: string; m: string }>(
      `SELECT EXTRACT(DAY FROM (now() AT TIME ZONE $1))::text AS d,
              EXTRACT(MONTH FROM (now() AT TIME ZONE $1))::text AS m`,
      [config.storeTimezone],
    );
    return { day: Number(rows[0]!.d), month: Number(rows[0]!.m) };
  }

  /** ميلاد بعد `offset` يوماً من اليوم، بتقويم المتجر. */
  async function birthdayIn(offset: number) {
    const { rows } = await db.query<{ d: string; m: string }>(
      `SELECT EXTRACT(DAY FROM d)::text AS d, EXTRACT(MONTH FROM d)::text AS m
         FROM (SELECT ((now() AT TIME ZONE $1)::date + $2::int) AS d) t`,
      [config.storeTimezone, offset],
    );
    return { day: Number(rows[0]!.d), month: Number(rows[0]!.m) };
  }

  async function makeCustomer(birthday: { day: number; month: number } | null) {
    const user = await registerAndLogin();
    if (birthday) {
      await db.query(
        `UPDATE users SET birth_day = $2, birth_month = $3, birthday_set_at = now()
          WHERE id = $1`,
        [user.userId, birthday.day, birthday.month],
      );
    }
    return { id: user.userId, token: user.token };
  }

  beforeAll(async () => {
    await seedTestCatalog();
    adminToken = await createAdminUser();
    today = await makeCustomer(await storeToday());
    soon = await makeCustomer(await birthdayIn(5));
    far = await makeCustomer(await birthdayIn(100));
    noBirthday = await makeCustomer(null);
  });

  function broadcast(payload: Record<string, unknown>) {
    return api
      .post('/api/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
  }

  async function notificationsOf(token: string) {
    const res = await api
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.data.items as { title: string }[];
  }

  // ── الاستهداف ──

  it('البثّ للجميع يصل كل زبون نشط', async () => {
    const title = `إعلان للجميع ${Date.now()}`;
    const res = await broadcast({ audience: 'all', title, body: 'نص' }).expect(201);
    expect(res.body.data.recipients).toBeGreaterThanOrEqual(4);

    for (const user of [today, soon, far, noBirthday]) {
      const titles = (await notificationsOf(user.token)).map((n) => n.title);
      expect(titles).toContain(title);
    }
  });

  it('البثّ لزبون واحد لا يصل غيره', async () => {
    const title = `رسالة خاصة ${Date.now()}`;
    const res = await broadcast({
      audience: 'users',
      userIds: [today.id],
      title,
      body: '',
    }).expect(201);
    expect(res.body.data.recipients).toBe(1);

    expect((await notificationsOf(today.token)).map((n) => n.title)).toContain(title);
    expect((await notificationsOf(soon.token)).map((n) => n.title)).not.toContain(title);
  });

  it('البثّ لعدة زبائن يصل المختارين وحدهم', async () => {
    const title = `رسالة لاثنين ${Date.now()}`;
    const res = await broadcast({
      audience: 'users',
      userIds: [today.id, soon.id],
      title,
      body: '',
    }).expect(201);
    expect(res.body.data.recipients).toBe(2);

    expect((await notificationsOf(today.token)).map((n) => n.title)).toContain(title);
    expect((await notificationsOf(soon.token)).map((n) => n.title)).toContain(title);
    expect((await notificationsOf(far.token)).map((n) => n.title)).not.toContain(title);
  });

  // ── الشرائح ──

  it('شريحة «عيد ميلاد اليوم» تصيب صاحب اليوم وحده', async () => {
    const title = `كل عام وأنت بخير ${Date.now()}`;
    await broadcast({
      audience: 'segment',
      segment: 'birthday_today',
      title,
      body: '🎂',
    }).expect(201);

    expect((await notificationsOf(today.token)).map((n) => n.title)).toContain(title);
    expect((await notificationsOf(soon.token)).map((n) => n.title)).not.toContain(title);
    expect((await notificationsOf(noBirthday.token)).map((n) => n.title)).not.toContain(title);
  });

  it('شريحة «قريباً» تحترم النافذة المطلوبة', async () => {
    const near = `قريباً ٧ ${Date.now()}`;
    await broadcast({
      audience: 'segment',
      segment: 'birthday_upcoming',
      windowDays: 7,
      title: near,
      body: '',
    }).expect(201);
    expect((await notificationsOf(soon.token)).map((n) => n.title)).toContain(near);
    expect((await notificationsOf(far.token)).map((n) => n.title)).not.toContain(near);

    // نافذة أوسع تلتقط الأبعد أيضاً — النافذة معيار حقيقي لا زينة.
    const wide = `قريباً ١٢٠ ${Date.now()}`;
    await broadcast({
      audience: 'segment',
      segment: 'birthday_upcoming',
      windowDays: 120,
      title: wide,
      body: '',
    }).expect(201);
    expect((await notificationsOf(far.token)).map((n) => n.title)).toContain(wide);
  });

  it('شريحة «لم يسجّل ميلاده» تصيب من لم يسجّل وحده', async () => {
    const title = `أكمل تاريخ ميلادك ${Date.now()}`;
    await broadcast({
      audience: 'segment',
      segment: 'birthday_missing',
      title,
      body: '🎂',
    }).expect(201);

    expect((await notificationsOf(noBirthday.token)).map((n) => n.title)).toContain(title);
    expect((await notificationsOf(today.token)).map((n) => n.title)).not.toContain(title);
  });

  it('الحساب الموقوف لا يصله بثّ', async () => {
    await api
      .patch(`/api/admin/users/${far.id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const title = `بعد الإيقاف ${Date.now()}`;
    await broadcast({ audience: 'all', title, body: '' }).expect(201);

    const { rows } = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM notifications WHERE user_id = $1 AND title = $2',
      [far.id, title],
    );
    expect(Number(rows[0]!.total)).toBe(0);

    // إعادة التفعيل حتى لا تتأثر بقية السويت.
    await api
      .patch(`/api/admin/users/${far.id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  // ── الصدق في التسليم ──

  it('الاستجابة تفصل «سجل داخل التطبيق» عن «تسليم دفع»', async () => {
    const res = await broadcast({
      audience: 'users',
      userIds: [today.id],
      title: `صدق التسليم ${Date.now()}`,
      body: '',
    }).expect(201);
    // [CRITICAL] الرقمان منفصلان ولا يجوز خلطهما.
    //
    // كان `push` يساوي `null` ما دام لا مزوّد مربوطاً؛ صار يحمل نتيجة
    // حقيقية بعد ربط طبقة الدفع. الغرض الذي يحرسه هذا الاختبار لم يتغيّر —
    // بل صار أوضح: هذا الزبون بلا جهاز مسجَّل، فسجلّ التطبيق يُكتب (١)
    // بينما التسليم صفر. لو عاد الحقلان بالرقم نفسه لكان معناه أن أحدهما
    // يُشتقّ من الآخر، وعندها يظنّ المسؤول أن الإشعار وصل الهواتف لمجرّد
    // أنه كُتب في القاعدة.
    expect(res.body.data.recipients).toBe(1);
    expect(res.body.data.push).not.toBeNull();
    expect(res.body.data.push.delivered).toBe(0);
    expect(res.body.data.push.provider).toBe('noop');
    expect(res.body.message).toContain('داخل التطبيق');
  });

  it('معاينة الجمهور تعيد عدداً قبل الإرسال بلا إنشاء إشعار', async () => {
    const before = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM notifications',
    );
    const res = await api
      .post('/api/admin/notifications/audience')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ audience: 'segment', segment: 'birthday_today' })
      .expect(200);
    expect(res.body.data.recipients).toBeGreaterThanOrEqual(1);

    const after = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM notifications',
    );
    expect(after.rows[0]!.total).toBe(before.rows[0]!.total);
  });

  it('جمهور فارغ يُرفض بدل إنشاء بثّ بلا مستقبِلين', async () => {
    const res = await broadcast({
      audience: 'users',
      userIds: ['00000000-0000-0000-0000-000000000000'],
      title: 'لا أحد',
      body: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('AUDIENCE_EMPTY');
  });

  /**
   * الحمولة المتناقضة أخطر ما في هذه الشاشة: «للجميع» مع قائمة زبونين
   * تعني، إن مرّت بصمت، إعلاناً يصل كل زبون في المتجر بينما ظنّ المسؤول
   * أنه أرسله لاثنين. لا رسالة تُسحب بعد إرسالها.
   */
  it('استهداف متناقض يُرفض ولا يُنشئ إشعاراً واحداً', async () => {
    const title = `متناقض ${Date.now()}`;
    const res = await broadcast({
      audience: 'all',
      userIds: [today.id],
      title,
      body: '',
    });
    expect(res.status).toBe(400);

    const { rows } = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM notifications WHERE title = $1',
      [title],
    );
    expect(Number(rows[0]!.total)).toBe(0);
  });

  it('شريحة بلا اسم شريحة تُرفض', async () => {
    const res = await broadcast({ audience: 'segment', title: 'بلا شريحة', body: '' });
    expect(res.status).toBe(400);
  });

  it('العميل العادي لا يبثّ إشعارات', async () => {
    const res = await api
      .post('/api/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${today.token}`)
      .send({ audience: 'all', title: 'اختراق', body: '' });
    expect(res.status).toBe(403);
  });

  // ── قوائم أعياد الميلاد ──

  it('قائمة «اليوم» و«قريباً» و«غير مسجّل» تتفق مع الشرائح', async () => {
    const fetchFilter = async (filter: string, windowDays?: number) => {
      const res = await api
        .get('/api/admin/customers/birthdays')
        .query({ filter, limit: 100, ...(windowDays ? { windowDays } : {}) })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      return res.body.data;
    };

    const todayList = await fetchFilter('today');
    expect((todayList.items as { id: string }[]).some((u) => u.id === today.id)).toBe(true);
    expect(todayList.timezone).toBe(config.storeTimezone);

    const upcoming = await fetchFilter('upcoming', 7);
    const upcomingIds = (upcoming.items as { id: string }[]).map((u) => u.id);
    expect(upcomingIds).toContain(soon.id);
    expect(upcomingIds).not.toContain(far.id);

    const missing = await fetchFilter('missing');
    expect((missing.items as { id: string }[]).some((u) => u.id === noBirthday.id)).toBe(true);

    // العدّادات تُرافق كل استجابة — المسؤول يرى الأرقام قبل فتح التبويب.
    expect(todayList.counts.today).toBeGreaterThanOrEqual(1);
    expect(todayList.counts.missing).toBeGreaterThanOrEqual(1);
  });

  it('«الأيام حتى العيد» صفر لصاحب اليوم', async () => {
    const res = await api
      .get('/api/admin/customers/birthdays')
      .query({ filter: 'today', limit: 100 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = (res.body.data.items as { id: string; daysUntilBirthday: number }[]).find(
      (u) => u.id === today.id,
    );
    expect(row?.daysUntilBirthday).toBe(0);
  });

  // ── بحث الزبائن وترشيحهم ──

  it('البحث بالاسم والهاتف يجري على الخادم', async () => {
    const { rows } = await db.query<{ username: string; phone: string }>(
      'SELECT username, phone FROM users WHERE id = $1',
      [today.id],
    );
    const { phone } = rows[0]!;

    const byPhone = await api
      .get('/api/admin/users')
      .query({ search: phone, limit: 50 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((byPhone.body.data.items as { id: string }[]).map((u) => u.id)).toContain(today.id);

    const nomatch = await api
      .get('/api/admin/users')
      .query({ search: 'لا-يوجد-زبون-بهذا-الاسم', limit: 50 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(nomatch.body.data.items).toHaveLength(0);
    expect(nomatch.body.data.total).toBe(0);
  });

  it('ترشيح «سجّل ميلاده» يفصل المجموعتين', async () => {
    const withBirthday = await api
      .get('/api/admin/users')
      .query({ hasBirthday: 'true', limit: 100 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const ids = (withBirthday.body.data.items as { id: string }[]).map((u) => u.id);
    expect(ids).toContain(today.id);
    expect(ids).not.toContain(noBirthday.id);

    const without = await api
      .get('/api/admin/users')
      .query({ hasBirthday: 'false', limit: 100 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((without.body.data.items as { id: string }[]).map((u) => u.id)).toContain(
      noBirthday.id,
    );
  });

  it('الترقيم يعمل والقائمة لا تسرّب كلمات المرور', async () => {
    const page1 = await api
      .get('/api/admin/users')
      .query({ page: 1, limit: 2 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(page1.body.data.items.length).toBeLessThanOrEqual(2);
    expect(page1.body.data.page).toBe(1);

    const row = page1.body.data.items[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty('password_hash');
    expect(row).not.toHaveProperty('passwordHash');
    expect(row).not.toHaveProperty('token_version');
    // الحقول التي تحتاجها شاشة الزبائن للقرار.
    expect(row).toHaveProperty('points');
    expect(row).toHaveProperty('ordersTotal');
  });

  it('الترتيب بالنقاط لا يكسر القائمة', async () => {
    const res = await api
      .get('/api/admin/users')
      .query({ sort: 'points_desc', limit: 10 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const points = (res.body.data.items as { points: number }[]).map((u) => u.points);
    const sorted = [...points].sort((a, b) => b - a);
    expect(points).toEqual(sorted);
  });

  it('غير المسؤول لا يقرأ قائمة الزبائن', async () => {
    const res = await api
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${today.token}`);
    expect(res.status).toBe(403);
  });
});
