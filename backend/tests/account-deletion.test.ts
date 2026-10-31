import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { dispatchDueRatingReminders, sendRatingReminderNow } from '../src/jobs/ratingReminderJob.js';
import { userRepo } from '../src/repositories/userRepo.js';
import { ERASED_TABLES, RETAINED_TABLES } from '../src/repositories/accountDeletionRepo.js';
import {
  api,
  createAdminUser,
  registerAndLogin,
  registerUploadedPhoto,
  seedTestCatalog,
  simulateLegacyNullGender,
  TEST_PASSWORD,
} from './helpers.js';
import { approve, complete, createProduct, placeOrder, reject } from './orderFixtures.js';

/**
 * حذف الحساب بطلب صاحبه (STEP 78) — `POST /api/auth/me/delete`.
 *
 * كل شيء عبر المسارات الحقيقية: تسجيلٌ توافق عليه الإدارة، طلباتٌ تمرّ
 * بانتقالات اللوحة، تقييمٌ بصورة مرفوعة. ما يُقاس بعد الحذف هو القاعدة نفسها.
 */

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const REFERENCE = /^DEL-[0-9A-HJKMNP-TV-Z]{10}$/;

/** شواهد هذه السويت — بلا رقم، فلا يطالها `purgeTestUsers`؛ تُنظَّف هنا. */
const tombstones: string[] = [];

async function cleanupTombstones() {
  if (tombstones.length === 0) return;
  const ids = [tombstones];
  const orders = `(SELECT id FROM orders WHERE user_id = ANY($1::uuid[]))`;
  await db.query(`DELETE FROM order_status_history WHERE order_id IN ${orders}`, ids);
  await db.query(`DELETE FROM order_items WHERE order_id IN ${orders}`, ids);
  await db.query('DELETE FROM birthday_discount_usage WHERE user_id = ANY($1::uuid[])', ids);
  await db.query('DELETE FROM loyalty_reward_redemptions WHERE user_id = ANY($1::uuid[])', ids);
  await db.query('DELETE FROM reviews WHERE user_id = ANY($1::uuid[])', ids);
  await db.query('DELETE FROM points_ledger WHERE user_id = ANY($1::uuid[])', ids);
  await db.query('DELETE FROM notifications WHERE user_id = ANY($1::uuid[])', ids);
  await db.query('DELETE FROM orders WHERE user_id = ANY($1::uuid[])', ids);
  await db.query('DELETE FROM carts WHERE user_id = ANY($1::uuid[])', ids);
  await db.query('DELETE FROM account_deletions WHERE user_id = ANY($1::uuid[])', ids);
  await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', ids);
}

async function countRows(table: string, userId: string) {
  const { rows } = await db.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM ${table} WHERE user_id = $1`, [userId]);
  return Number(rows[0]!.n);
}

async function deleteAccount(token: string, body: Record<string, unknown>) {
  const res = await api.post('/api/auth/me/delete').set(bearer(token)).send(body);
  return res;
}

let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
let adminToken: string;

beforeAll(async () => {
  catalog = await seedTestCatalog();
  adminToken = await createAdminUser();
});

afterAll(async () => {
  await cleanupTombstones();
});

describe('[CRITICAL] حذف الحساب — كل مفتاح أجنبي إلى users له مصير مكتوب', () => {
  /**
   * أعمدة الفاعل الإداري (`SET NULL`) لا تخصّ بيانات الزبون: من راجع، من حسم،
   * من أنشأ. الحذف لا يمسّها لأن الزبون ليس فاعلاً فيها.
   */
  const ACTOR_COLUMNS = new Set([
    'reviews.reviewed_by',
    'order_status_history.changed_by',
    'loyalty_reward_redemptions.fulfilled_by',
    'account_requests.resolved_by',
    'notification_campaigns.created_by',
    'admin_audit_log.actor_id',
    'product_cost_entries.entered_by',
    'users.admin_created_by',
  ]);
  /** مُعالَجة صراحةً في `erasePersonalRows`/`deletePersonalMedia` لا بالقائمة العامة. */
  const SPECIAL = new Set(['account_requests.user_id', 'media_files.uploaded_by']);

  it('جدولٌ جديد يحمل مفتاحاً إلى users يُسقط الاختبار حتى يُقرَّر مصيره', async () => {
    const { rows } = await db.query<{ ref: string }>(
      `SELECT c.conrelid::regclass::text || '.' || a.attname AS ref
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass
        ORDER BY 1`,
    );
    const undecided = rows
      .map((row) => row.ref)
      .filter((ref) => {
        const [table, column] = ref.split('.') as [string, string];
        if (ACTOR_COLUMNS.has(ref) || SPECIAL.has(ref)) return false;
        if (column === 'user_id' && (ERASED_TABLES as readonly string[]).includes(table)) return false;
        if (column === 'user_id' && table in RETAINED_TABLES) return false;
        return true;
      });
    expect(undecided, `مفاتيح إلى users بلا مصير عند حذف الحساب:\n  ${undecided.join('\n  ')}`).toEqual([]);
  });
});

describe('[SECURITY] من يحذف وكيف يُثبت أنه صاحب الحساب', () => {
  it('بلا جلسة: 401 — لا مسار عام يحذف حساباً برقمٍ وكلمة مرور', async () => {
    const res = await api.post('/api/auth/me/delete').send({ password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('كلمة مرور خاطئة: 400 ولا شيء يُمسّ، والجلسة باقية', async () => {
    const user = await registerAndLogin();
    const res = await deleteAccount(user.token, { password: 'wrong-password' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    await api.get('/api/auth/me').set(bearer(user.token)).expect(200);
    const { rows } = await db.query('SELECT role, phone FROM users WHERE id = $1', [user.userId]);
    expect(rows[0]).toEqual({ role: 'customer', phone: user.phone });
  });

  it('بلا كلمة مرور: 400 تحقّق', async () => {
    const user = await registerAndLogin();
    const res = await deleteAccount(user.token, {});
    expect(res.status).toBe(400);
  });

  it('حساب المسؤول لا يُحذف من هنا', async () => {
    const res = await deleteAccount(adminToken, { password: 'test-admin-password-not-a-default' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DELETION_CUSTOMERS_ONLY');
  });

  it('توكنٌ أبطله تغيير كلمة المرور لا يحذف شيئاً', async () => {
    const user = await registerAndLogin();
    await api
      .patch('/api/auth/me/password')
      .set(bearer(user.token))
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'newsecret456' })
      .expect(200);
    const res = await deleteAccount(user.token, { password: 'newsecret456' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_REVOKED');
    const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [user.userId]);
    expect(rows[0]!.role).toBe('customer');
  });

  it('طلبٌ قيد التنفيذ يمنع الحذف (409) ولا يُمسّ شيء', async () => {
    const user = await registerAndLogin();
    const product = await createProduct({ categoryId: catalog.categoryId, price: 10000 });
    const orderId = await placeOrder(user.token, catalog.governorateId, [{ productId: product.id, quantity: 1 }]);
    const res = await deleteAccount(user.token, { password: TEST_PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_HAS_ACTIVE_ORDERS');
    await api.get('/api/auth/me').set(bearer(user.token)).expect(200);

    // يكتمل الطلب ← يصير الحذف ممكناً.
    await reject(adminToken, orderId);
    const done = await deleteAccount(user.token, { password: TEST_PASSWORD });
    expect(done.status).toBe(200);
    tombstones.push(user.userId);
  });

  it('حذفان متزامنان بالجلسة نفسها: واحدٌ ينجح والآخر يُرفض', async () => {
    const user = await registerAndLogin();
    const [a, b] = await Promise.all([
      deleteAccount(user.token, { password: TEST_PASSWORD }),
      deleteAccount(user.token, { password: TEST_PASSWORD }),
    ]);
    tombstones.push(user.userId);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM account_deletions WHERE user_id = $1', [user.userId]);
    expect(rows[0]!.n).toBe(1);
  });
});

describe('[CRITICAL] ما يُمحى وما يبقى', () => {
  it('حسابٌ له طلبات وتقييم بصورة ومفضلة وسلة: يُمحى الشخصي وتبقى الطلبات كاملة', async () => {
    const user = await registerAndLogin();
    const productA = await createProduct({ categoryId: catalog.categoryId, price: 12000 });
    const productB = await createProduct({ categoryId: catalog.categoryId, price: 8000 });

    // طلبٌ مكتمل (يمنح نقاطاً وإشعارات) وآخر مرفوض.
    const completed = await placeOrder(user.token, catalog.governorateId, [{ productId: productA.id, quantity: 1 }]);
    await approve(adminToken, completed);
    await complete(adminToken, completed);
    const rejected = await placeOrder(user.token, catalog.governorateId, [{ productId: productB.id, quantity: 1 }]);
    await reject(adminToken, rejected);

    // تقييمٌ بصورة رفعها الزبون.
    const photoUrl = await registerUploadedPhoto(user.userId);
    await api
      .post('/api/reviews')
      .set(bearer(user.token))
      .send({ orderId: completed, productId: productA.id, rating: 5, comment: 'تجربة ممتازة فعلاً', photoUrls: [photoUrl] })
      .expect(201);

    // مفضلة وسلة وجهاز إشعار واشتراك توفّر وتفضيل إشعار وصورة ملف شخصي.
    await api.post('/api/favorites').set(bearer(user.token)).send({ productId: productB.id }).expect((r) => expect(r.status).toBeLessThan(300));
    await api.post('/api/cart').set(bearer(user.token)).send({ productId: productB.id, quantity: 1 }).expect(200);
    await db.query(`INSERT INTO device_tokens (user_id, token, platform) VALUES ($1, $2, 'android')`, [user.userId, `tok-${user.userId}`]);
    await db.query('INSERT INTO restock_subscriptions (user_id, product_id) VALUES ($1, $2)', [user.userId, productB.id]);
    await db.query(`INSERT INTO user_notification_prefs (user_id, key, enabled) VALUES ($1, 'offers', FALSE)`, [user.userId]);
    await db.query(`INSERT INTO user_daily_activity (user_id, activity_date, logins) VALUES ($1, CURRENT_DATE, 1)`, [user.userId]);
    // طلب إعادة تعيين سابق بالرقم (يبقى بعد فكّ الربط لولا الحذف بالرقم).
    await api
      .post('/api/auth/forgot-password')
      .send({ phone: user.phone, username: 'مختبر', gender: 'male', levelKey: 'beginner' })
      .expect(202);

    // إكمالٌ إداري لجنس حسابٍ قديم بلا جنس يكتب سطر تدقيق يحمل القيمة.
    await simulateLegacyNullGender(user.userId);
    await api.patch(`/api/admin/customers/${user.userId}/gender`).set(bearer(adminToken)).send({ gender: 'female' })
      .expect((r) => expect(r.status, JSON.stringify(r.body)).toBe(200));
    const auditBefore = await db.query(`SELECT details FROM admin_audit_log WHERE target_type = 'customer' AND target_id = $1`, [user.userId]);
    expect(auditBefore.rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(auditBefore.rows)).toContain('female');

    const before = await db.query<{ phone: string; full_address: string; total: string }>(
      'SELECT phone, full_address, total FROM orders WHERE user_id = $1 ORDER BY created_at',
      [user.userId],
    );
    expect(before.rows).toHaveLength(2);
    expect(await countRows('points_ledger', user.userId)).toBeGreaterThan(0);
    expect(await countRows('notifications', user.userId)).toBeGreaterThan(0);

    const res = await deleteAccount(user.token, { password: TEST_PASSWORD, reason: '  لم أعد أستعمل التطبيق  ' });
    tombstones.push(user.userId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.reference).toMatch(REFERENCE);
    expect(res.body.data.retainedOrders).toBe(2);
    // [PRIVACY] الردّ لا يحمل الرقم ولا الاسم.
    expect(JSON.stringify(res.body)).not.toContain(user.phone);
    expect(JSON.stringify(res.body)).not.toContain(user.phone.slice(4));

    // ── الشاهد ──
    const { rows: [row] } = await db.query(
      `SELECT role, phone, username, gender, avatar_url, birth_day, is_active, deleted_at, password_hash
         FROM users WHERE id = $1`,
      [user.userId],
    );
    expect(row).toMatchObject({ role: 'deleted', phone: null, username: 'حساب محذوف', gender: null, avatar_url: null, birth_day: null, is_active: false });
    expect(row!.deleted_at).toBeInstanceOf(Date);
    expect(row!.password_hash).not.toMatch(/^\$2/);

    // ── المحو ──
    for (const table of ERASED_TABLES) {
      expect(await countRows(table, user.userId), table).toBe(0);
    }
    const media = await db.query('SELECT 1 FROM media_files WHERE uploaded_by = $1', [user.userId]);
    expect(media.rows).toHaveLength(0);
    const requests = await db.query('SELECT 1 FROM account_requests WHERE user_id = $1 OR submitted_phone = $2', [user.userId, user.phone]);
    expect(requests.rows).toHaveLength(0);

    // ── سجلّ الإدارة: الإجراء باقٍ ومحتواه عن الزبون ممحو ──
    const auditAfter = await db.query(`SELECT action, details FROM admin_audit_log WHERE target_type = 'customer' AND target_id = $1`, [user.userId]);
    expect(auditAfter.rows.length).toBe(auditBefore.rows.length);
    for (const row of auditAfter.rows) expect(row.details).toEqual({});

    // ── ما يبقى: الطلبات كاملة ──
    const after = await db.query('SELECT phone, full_address, total FROM orders WHERE user_id = $1 ORDER BY created_at', [user.userId]);
    expect(after.rows).toEqual(before.rows);
    const items = await db.query(`SELECT COUNT(*)::int AS n FROM order_items WHERE order_id = ANY($1::uuid[])`, [[completed, rejected]]);
    expect(items.rows[0]!.n).toBe(2);

    // ── سجلّ الحذف: المرجع والسبب، بلا رقم ولا اسم ──
    const { rows: [record] } = await db.query('SELECT * FROM account_deletions WHERE user_id = $1', [user.userId]);
    expect(record).toMatchObject({ reference: res.body.data.reference, reason: 'لم أعد أستعمل التطبيق', retained_orders: 2 });
    expect(JSON.stringify(record)).not.toContain(user.phone.slice(4));

    // ── الجلسة والدخول ──
    const me = await api.get('/api/auth/me').set(bearer(user.token));
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('UNAUTHORIZED');
    const replay = await deleteAccount(user.token, { password: TEST_PASSWORD });
    expect(replay.status).toBe(401);
    const login = await api.post('/api/auth/login').send({ phone: user.phone, password: TEST_PASSWORD });
    expect(login.status).toBe(401);

    // ── اللوحة: الطلب الباقي يعرض «حساب محذوف» ورقم التوصيل المحفوظ في الطلب ──
    const order = await api.get(`/api/admin/orders/${completed}`).set(bearer(adminToken)).expect(200);
    expect(order.body.data.order?.customer?.name ?? order.body.data.customer?.name).toBe('حساب محذوف');
    // الزبون المحذوف خارج قائمة الزبائن.
    const list = await api.get('/api/admin/users').query({ search: user.phone.slice(-8) }).set(bearer(adminToken)).expect(200);
    expect(JSON.stringify(list.body)).not.toContain(user.userId);
    // ولا تُقرأ نقاطه بمعرّفه.
    await api.get(`/api/admin/customers/${user.userId}/points`).set(bearer(adminToken)).expect(404);
  });

  it('الرقم يتحرّر: صاحبه يسجّل من جديد كحسابٍ جديد بلا ماضٍ', async () => {
    const user = await registerAndLogin();
    await deleteAccount(user.token, { password: TEST_PASSWORD }).then((r) => expect(r.status).toBe(200));
    tombstones.push(user.userId);
    const local = `0${user.phone.slice(4)}`;
    const again = await registerAndLogin(local);
    expect(again.userId).not.toBe(user.userId);
    expect(again.phone).toBe(user.phone);
  });

  it('حسابٌ بلا أي طلب يُحذف أيضاً، ومرجعه بلا طلبات باقية', async () => {
    const user = await registerAndLogin();
    const res = await deleteAccount(user.token, { password: TEST_PASSWORD });
    tombstones.push(user.userId);
    expect(res.status).toBe(200);
    expect(res.body.data.retainedOrders).toBe(0);
  });

  it('سببٌ أطول من 500 حرف يُرفض ولا يُحذف شيء', async () => {
    const user = await registerAndLogin();
    const res = await deleteAccount(user.token, { password: TEST_PASSWORD, reason: 'س'.repeat(501) });
    expect(res.status).toBe(400);
    await api.get('/api/auth/me').set(bearer(user.token)).expect(200);
  });
});

describe('[CRITICAL] لا شيء يعود إلى الحساب المحذوف بعد حذفه', () => {
  it('تذكير التقييم لطلبٍ مكتمل لا يُرسَل، والمكافأة غير المستعملة تُحذف، والصفّ لا يُكتب عليه', async () => {
    const user = await registerAndLogin();
    const product = await createProduct({ categoryId: catalog.categoryId, price: 9000 });
    const orderId = await placeOrder(user.token, catalog.governorateId, [{ productId: product.id, quantity: 1 }]);
    await approve(adminToken, orderId);
    await complete(adminToken, orderId);
    // مكافأةٌ طُلبت ولم تُستعمل (بلا طلب).
    await db.query(
      `INSERT INTO loyalty_reward_redemptions (user_id, level_key, kind, gift_amount)
       VALUES ($1, 'explorer', 'gift', 5000)`,
      [user.userId],
    );
    expect(await countRows('loyalty_reward_redemptions', user.userId)).toBe(1);

    const res = await deleteAccount(user.token, { password: TEST_PASSWORD });
    tombstones.push(user.userId);
    expect(res.status).toBe(200);

    const unconsumed = await db.query(
      'SELECT 1 FROM loyalty_reward_redemptions WHERE user_id = $1 AND consumed_order_id IS NULL AND fulfilled_at IS NULL',
      [user.userId],
    );
    expect(unconsumed.rows).toHaveLength(0);

    // موعد التذكير حلّ: الدورة تسحبه بدل أن تكتب إشعاراً للشاهد.
    const moved = await db.query(
      `UPDATE orders
          SET dispatched_at = dispatched_at - interval '30 days',
              delivered_at = delivered_at - interval '30 days',
              rating_reminder_at = rating_reminder_at - interval '30 days'
        WHERE id = $1 AND rating_reminder_at IS NOT NULL`,
      [orderId],
    );
    expect(moved.rowCount).toBe(1);
    await dispatchDueRatingReminders();
    expect(await sendRatingReminderNow(orderId)).toBe(false);
    expect(await countRows('notifications', user.userId)).toBe(0);
    expect(await countRows('push_outbox', user.userId)).toBe(0);

    // كتابةٌ متأخّرة (طلبٌ صودق قبل الحذف بلحظة) تُرفض لا تُعيد بيانات.
    await expect(userRepo.update(db, user.userId, { username: 'عاد' })).rejects.toMatchObject({ statusCode: 401 });
    const { rows } = await db.query('SELECT username, role FROM users WHERE id = $1', [user.userId]);
    expect(rows[0]).toEqual({ username: 'حساب محذوف', role: 'deleted' });
  });
});

describe('قيد الشكل في القاعدة (٠٩١)', () => {
  it('زبونٌ بلا رقم أو شاهدٌ برقم يُرفضان', async () => {
    const user = await registerAndLogin();
    await expect(db.query('UPDATE users SET phone = NULL WHERE id = $1', [user.userId])).rejects.toThrow(/users_deleted_shape/);
    await expect(
      db.query(`UPDATE users SET role = 'deleted', deleted_at = now() WHERE id = $1`, [user.userId]),
    ).rejects.toThrow(/users_deleted_shape/);
  });
});
