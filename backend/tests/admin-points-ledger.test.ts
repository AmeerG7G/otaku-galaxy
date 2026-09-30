import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  api,
  createAdminUser,
  createSubAdmin,
  purgeSubAdmins,
  purgeTestUsers,
  registerAndLogin,
  seedTestCatalog,
} from './helpers.js';

/**
 * نقاط المجرّة في اللوحة — «رصيده ٣٥ والسجلّ فارغ» (STEP 66).
 *
 * الرصيد في هذا النظام **مجموع** `points_ledger` لا عمودٌ مخزَّن، فرصيدٌ بلا
 * صفوفٍ خلفه مستحيل. ما كان يُفرغ السجلّ هو القراءة:
 *   ١) «أعلى الأرصدة» يجمع كل صفوف الدفتر — ومنها نقاط حساباتٍ **مسؤولة**
 *      (طلبات اختبار من التطبيق برقم المسؤول) — بينما `GET /customers/:id/points`
 *      يرفض غير الزبون بـ404 منذ STEP 64. اللوحة تعرض الصفّ، ودفترُه يعود
 *      فارغاً برصيد صفر. وكان الصفّ نفسه يكشف اسم المسؤول ورقمه لمسؤولٍ فرعي
 *      يملك «النقاط» وحدها — التسريب الذي أغلقه STEP 64 في مسار الزبائن.
 *   ٢) صفحة الزبون تعرض الرصيد بلا أي سجلّ (يُختبر في اللوحة).
 * العقد هنا: كل من يظهر في أرقام النقاط يُفتح دفتره، والدفتر يشرح الرصيد
 * سطراً سطراً (الرصيد بعد كل حركة، ورقم الطلب مرجعاً).
 */

const ADMIN_POINTS = 1_000_000; // أكبر من أي رصيد زبون ⇒ كان سيتصدّر «أعلى الأرصدة».

describe('نقاط المجرّة في اللوحة — الرصيد يُفسَّر بالدفتر', () => {
  let adminToken: string;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let heldByAdmin: { userId: string };

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    // مسؤولٌ اشترى من التطبيق فكسب نقاطاً — الحالة التي أفرغت السجلّ.
    heldByAdmin = await createSubAdmin(['orders'], { suffix: 61, username: 'مسؤول يتسوّق' });
    await db.query(
      `INSERT INTO points_ledger (user_id, label, amount, reason)
       VALUES ($1, 'نقاط حساب مسؤول', $2, 'manual')`,
      [heldByAdmin.userId, ADMIN_POINTS],
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM points_ledger WHERE user_id = $1', [heldByAdmin.userId]);
    await purgeSubAdmins();
    await purgeTestUsers();
  });

  /** طلبٌ حقيقي يكتمل عبر مسار الإدارة — يمنح نقاط الشراء كما في الإنتاج. */
  async function completedOrderFor(token: string) {
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: catalog.productIds[0], quantity: 3 })
      .expect(200);
    const created = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07744444444' })
      .expect(201);
    const orderId = created.body.data.id as string;
    for (const status of ['OUT_FOR_DELIVERY', 'COMPLETED'] as const) {
      await api
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
    }
    return { orderId, number: created.body.data.number as string };
  }

  it('[CRITICAL] كل صاحب رصيدٍ في «أعلى الأرصدة» يُفتح دفتره، ومجموع الدفتر = الرصيد', async () => {
    const customer = await registerAndLogin();
    await completedOrderFor(customer.token);

    const summary = await api
      .get('/api/admin/points/summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const top = summary.body.data.topBalances as { userId: string; balance: number; entries: number }[];

    expect(top.map((row) => row.userId)).toContain(customer.userId);
    // حساب المسؤول ليس زبوناً — لا يظهر هنا ولا يُكشف اسمه ورقمه.
    expect(top.map((row) => row.userId)).not.toContain(heldByAdmin.userId);

    for (const row of top) {
      const detail = await api
        .get(`/api/admin/customers/${row.userId}/points`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(detail.status, `دفتر ${row.userId}`).toBe(200);
      const ledger = detail.body.data.ledger as { amount: number }[];
      expect(detail.body.data.balance).toBe(row.balance);
      expect(ledger.length).toBe(row.entries);
      expect(ledger.reduce((sum, entry) => sum + entry.amount, 0)).toBe(row.balance);
    }
  });

  it('الأرقام المجمَّعة للزبائن وحدهم — نقاط حساب المسؤول خارجها', async () => {
    const summary = await api
      .get('/api/admin/points/summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const { rows } = await db.query<{ total: string; holders: string; entries: string }>(
      `SELECT COALESCE(SUM(l.amount), 0)::text AS total,
              COUNT(DISTINCT l.user_id)::text  AS holders,
              COUNT(*)::text                   AS entries
         FROM points_ledger l JOIN users u ON u.id = l.user_id
        WHERE u.role = 'customer'`,
    );
    expect(summary.body.data.totalInCirculation).toBe(Number(rows[0]!.total));
    expect(summary.body.data.customersWithPoints).toBe(Number(rows[0]!.holders));
    expect(summary.body.data.ledgerEntries).toBe(Number(rows[0]!.entries));
    const byReasonTotal = (summary.body.data.byReason as { total: number }[]).reduce((s, r) => s + r.total, 0);
    expect(byReasonTotal).toBe(Number(rows[0]!.total));
  });

  it('الدفتر يشرح الرصيد: الرصيد بعد كل حركة، ورقم الطلب مرجعاً', async () => {
    const customer = await registerAndLogin();
    const first = await completedOrderFor(customer.token);
    const second = await completedOrderFor(customer.token);

    const detail = await api
      .get(`/api/admin/customers/${customer.userId}/points`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const ledger = detail.body.data.ledger as {
      amount: number;
      reason: string;
      orderId: string | null;
      orderNumber: string | null;
      balanceAfter: number;
      createdAt: string;
    }[];

    expect(ledger).toHaveLength(2);
    // الأحدث أولاً، وآخر «رصيد بعد» هو الرصيد الحالي نفسه.
    expect(ledger[0]!.balanceAfter).toBe(detail.body.data.balance);
    expect(ledger[1]!.balanceAfter).toBe(ledger[1]!.amount);
    expect(ledger[0]!.balanceAfter).toBe(ledger[1]!.balanceAfter + ledger[0]!.amount);
    expect(new Set(ledger.map((e) => e.orderNumber))).toEqual(new Set([first.number, second.number]));
    for (const entry of ledger) {
      expect(entry.reason).toBe('order_received');
      expect(entry.amount).toBeGreaterThan(0);
    }
  });

  it('الرصيد بعد كل حركة يُحسب على الدفتر كله لا على الصفحة المعروضة', async () => {
    const customer = await registerAndLogin();
    // ٢٠٥ حركات — أكثر من سقف ما يُعرض (٢٠٠): أقدمها خارج القائمة.
    await db.query(
      `INSERT INTO points_ledger (user_id, label, amount, reason, created_at)
       SELECT $1, 'حركة ' || g, 1, 'manual', now() - (g || ' minutes')::interval
         FROM generate_series(1, 205) AS g`,
      [customer.userId],
    );
    const detail = await api
      .get(`/api/admin/customers/${customer.userId}/points`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.data.balance).toBe(205);
    expect(detail.body.data.ledger).toHaveLength(200);
    expect(detail.body.data.ledger[0].balanceAfter).toBe(205);
    // أقدم ما يظهر هو السادس تاريخياً: قبله خمسٌ لم تُعرض، ورصيده بعده ٦.
    expect(detail.body.data.ledger[199].balanceAfter).toBe(6);
    await db.query('DELETE FROM points_ledger WHERE user_id = $1', [customer.userId]);
  });

  it('[SECURITY] مسؤولٌ فرعي بصلاحية «النقاط» وحدها لا يرى حساب مسؤولٍ في الأرقام', async () => {
    const pointsOnly = await createSubAdmin(['points'], { suffix: 62 });
    const summary = await api
      .get('/api/admin/points/summary')
      .set('Authorization', `Bearer ${pointsOnly.token}`)
      .expect(200);
    const serialised = JSON.stringify(summary.body.data);
    expect(serialised).not.toContain(heldByAdmin.userId);
    expect(serialised).not.toContain('+9647800000061');
  });
});
