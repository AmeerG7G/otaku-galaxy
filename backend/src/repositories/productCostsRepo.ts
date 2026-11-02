import type pg from 'pg';

/**
 * تكلفة الشراء (الهجرة ٠٧٨، D1).
 *
 * `product_cost_entries` سجلٌّ يُلحق ولا يُعدَّل: التكلفة السارية = أحدث صفّ.
 * لقطة البند تُكتب **مرة واحدة** عند قبول الطلب، داخل معاملة خصم المخزون وتحت
 * قفل صفوف المنتجات نفسها — فلا يتسلّل صفّ تكلفةٍ جديد بين القراءة والكتابة
 * (إدراجه يحتاج `KEY SHARE` على المنتج، والقبول يمسكه `FOR UPDATE`).
 *
 * [CRITICAL] لا شيء هنا يقرأ التكلفة الحالية لحساب ربحٍ سابق: الربح التاريخي
 * يُقرأ من لقطات البنود وحدها.
 */

export interface CostEntry {
  id: string;
  productId: string;
  unitCost: number;
  effectiveFrom: string;
  enteredBy: string | null;
  enteredByName: string | null;
  note: string | null;
}

interface CostEntryRow {
  id: string;
  product_id: string;
  unit_cost: string;
  effective_from: Date;
  entered_by: string | null;
  entered_by_name: string | null;
  note: string | null;
}

function toEntry(row: CostEntryRow): CostEntry {
  return {
    id: row.id,
    productId: row.product_id,
    unitCost: Number(row.unit_cost),
    effectiveFrom: row.effective_from.toISOString(),
    enteredBy: row.entered_by,
    enteredByName: row.entered_by_name,
    note: row.note,
  };
}

export const productCostsRepo = {
  /** سجلّ تكاليف المنتج، الأحدث أولاً (الأول = الساري). */
  async listForProduct(db: pg.Pool | pg.PoolClient, productId: string, limit = 100): Promise<CostEntry[]> {
    const { rows } = await db.query<CostEntryRow>(
      `SELECT e.id, e.product_id, e.unit_cost, e.effective_from, e.entered_by, e.note,
              u.username AS entered_by_name
         FROM product_cost_entries e
         LEFT JOIN users u ON u.id = e.entered_by
        WHERE e.product_id = $1
        ORDER BY e.effective_from DESC, e.created_at DESC, e.id DESC
        LIMIT $2`,
      [productId, limit],
    );
    return rows.map(toEntry);
  },

  /** صفٌّ جديد بوقت الخادم — الزناد يتجاهل أي تأريخ يُرسَل. */
  async add(
    db: pg.Pool | pg.PoolClient,
    input: { productId: string; unitCost: number; enteredBy: string; note: string | null },
  ): Promise<CostEntry> {
    const { rows } = await db.query<CostEntryRow>(
      `WITH inserted AS (
         INSERT INTO product_cost_entries (product_id, unit_cost, entered_by, note)
         VALUES ($1, $2, $3, $4)
         RETURNING id, product_id, unit_cost, effective_from, entered_by, note
       )
       SELECT i.*, u.username AS entered_by_name
         FROM inserted i LEFT JOIN users u ON u.id = i.entered_by`,
      [input.productId, input.unitCost, input.enteredBy, input.note],
    );
    return toEntry(rows[0]!);
  },

  /**
   * لقطة تكلفة بنود طلبٍ عند قبوله — تُكتب مرة واحدة.
   *
   * كل بندٍ لمنتجٍ له صفّ تكلفة يحمل التكلفة السارية والصفّ المرجعي بعينه.
   * بندٌ لمنتجٍ بلا تكلفة مسجّلة يبقى NULL — «الربح غير متاح» لطلبه، ولا تُختلق
   * قيمة. البنود الملتقَطة سابقاً لا تُمسّ (`cost_entry_id IS NULL`).
   */
  async snapshotOrderItemCosts(tx: pg.PoolClient, orderId: string): Promise<number> {
    const { rowCount } = await tx.query(
      `UPDATE order_items oi
          SET unit_cost = current_cost.unit_cost,
              cost_entry_id = current_cost.id,
              cost_captured_at = now()
         FROM (
           SELECT DISTINCT ON (e.product_id) e.id, e.product_id, e.unit_cost
             FROM product_cost_entries e
            -- كل صفٍّ ساري منذ إدراجه (لا تأريخ مستقبلي): الأحدث الملتزم هو الساري.
            -- مقارنة effective_from بـ now() كانت ستستبعد صفّاً التُزم أثناء
            -- معاملة القبول قبل قفلها المنتجات (now() = بداية المعاملة).
            WHERE e.product_id IN (SELECT product_id FROM order_items WHERE order_id = $1)
            ORDER BY e.product_id, e.effective_from DESC, e.created_at DESC, e.id DESC
         ) AS current_cost
        WHERE oi.order_id = $1
          AND oi.product_id = current_cost.product_id
          AND oi.cost_entry_id IS NULL`,
      [orderId],
    );
    return rowCount ?? 0;
  },
};
