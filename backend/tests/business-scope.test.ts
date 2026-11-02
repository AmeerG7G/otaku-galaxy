import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * تصنيف الطلبات للتحليلات (D2، الهجرة ٠٧٣).
 *
 * [CRITICAL] `orders.placed_by_role` لقطةُ دور صاحب الحساب **ساعة الطلب**،
 * يكتبها زنادٌ لكل طريق إدراج ولا تتغيّر بعدها. ترقيةُ زبونٍ إلى مسؤول لاحقاً
 * (كما يفعل `seedAdmin.ts`) لا تقلب مشترياته السابقة إلى «طلبات إدارية».
 */

let governorateId: string;

async function insertOrder(userId: string, claimedRole?: string) {
  const { rows } = await db.query<{ id: string; placed_by_role: string }>(
    `INSERT INTO orders (number, user_id, governorate_id, province, full_address, phone,
                         products_total, delivery_fee, discount, total${claimedRole ? ', placed_by_role' : ''})
     VALUES ($1, $2, $3, 'بغداد', 'عنوان', '+9647700000000', 10000, 4000, 0, 14000${claimedRole ? ', $4' : ''})
     RETURNING id, placed_by_role`,
    claimedRole
      ? [`T-${randomUUID().slice(0, 8)}`, userId, governorateId, claimedRole]
      : [`T-${randomUUID().slice(0, 8)}`, userId, governorateId],
  );
  return rows[0]!;
}

beforeAll(async () => {
  governorateId = (await seedTestCatalog()).governorateId;
});

afterAll(async () => {
  await purgeTestUsers();
});

describe('لقطة دور صاحب الطلب', () => {
  it('[CRITICAL] تُشتقّ من صاحب الحساب ولا تقبل قيمةً يرسلها المستدعي', async () => {
    const customer = await registerAndLogin();
    const order = await insertOrder(customer.userId, 'admin');
    expect(order.placed_by_role).toBe('customer');
  });

  it('[CRITICAL] ترقية الزبون إلى مسؤول لاحقاً لا تقلب طلبه السابق', async () => {
    const customer = await registerAndLogin();
    const before = await insertOrder(customer.userId);
    // كما يفعل seedAdmin: ON CONFLICT (phone) DO UPDATE SET role = 'admin'.
    await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [customer.userId]);
    const after = await insertOrder(customer.userId);

    const { rows } = await db.query<{ id: string; placed_by_role: string }>(
      'SELECT id, placed_by_role FROM orders WHERE id = ANY($1::uuid[]) ORDER BY created_at',
      [[before.id, after.id]],
    );
    expect(rows.find((r) => r.id === before.id)?.placed_by_role).toBe('customer');
    expect(rows.find((r) => r.id === after.id)?.placed_by_role).toBe('admin');
  });

  it('لا تتغيّر بعد الإدراج', async () => {
    const customer = await registerAndLogin();
    const order = await insertOrder(customer.userId);
    await expect(
      db.query("UPDATE orders SET placed_by_role = 'admin' WHERE id = $1", [order.id]),
    ).rejects.toThrow(/immutable/);
  });

  it('علَم الحساب الداخلي افتراضه FALSE', async () => {
    const customer = await registerAndLogin();
    const { rows } = await db.query<{ is_internal_account: boolean }>(
      'SELECT is_internal_account FROM users WHERE id = $1',
      [customer.userId],
    );
    expect(rows[0]!.is_internal_account).toBe(false);
  });
});
