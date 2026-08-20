import type pg from 'pg';
import type { CartItemRow } from '../types/index.js';

export interface CartLine {
  id: string;
  productId: string;
  productName: string;
  productImage: string | null;
  optionValue: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  stock: number;
  createdAt: Date;
}

/** يضمن وجود عربة للمستخدم ويعيد معرّفها. */
async function ensureCart(db: pg.Pool | pg.PoolClient, userId: string): Promise<string> {
  await db.query('INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
  const { rows } = await db.query<{ id: string }>('SELECT id FROM carts WHERE user_id = $1', [userId]);
  return rows[0]!.id;
}

const LINE_SELECT = `
  SELECT ci.id, ci.product_id AS "productId", ci.option_value AS "optionValue",
         ci.quantity, ci.created_at AS "createdAt",
         p.name AS "productName", p.stock, p.price AS "unitPrice",
         (SELECT pi.url FROM product_images pi
          WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1) AS "productImage"
  FROM cart_items ci
  JOIN products p ON p.id = ci.product_id
  WHERE ci.cart_id = $1 AND p.is_active = TRUE`;

function mapLine(row: Record<string, unknown>): CartLine {
  return {
    id: row.id as string,
    productId: row.productId as string,
    productName: row.productName as string,
    productImage: (row.productImage as string | null) ?? null,
    optionValue: (row.optionValue as string | null) ?? null,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
    lineTotal: Number(row.unitPrice) * Number(row.quantity),
    stock: Number(row.stock),
    createdAt: new Date(row.createdAt as string),
  };
}

export const cartRepo = {
  async listItems(db: pg.Pool | pg.PoolClient, userId: string): Promise<CartLine[]> {
    const cartId = await ensureCart(db, userId);
    const { rows } = await db.query<Record<string, unknown>>(`${LINE_SELECT}
      ORDER BY ci.created_at DESC`, [cartId]);
    return rows.map(mapLine);
  },

  /** إضافة/دمج منتج في العربة؛ إن وُجد سطر مطابق تُدمج الكمية. */
  async upsertItem(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    input: { productId: string; optionValue: string | null; quantity: number },
  ): Promise<CartLine> {
    const cartId = await ensureCart(db, userId);
    const { rows } = await db.query(
      `INSERT INTO cart_items (cart_id, product_id, option_value, quantity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cart_id, product_id, option_value)
       DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
       RETURNING *`,
      [cartId, input.productId, input.optionValue, input.quantity],
    );
    const row = rows[0]!;
    // إعادة جلب السطر الكامل.
    const { rows: lineRows } = await db.query<Record<string, unknown>>(
      `${LINE_SELECT} AND ci.id = $2
      ORDER BY ci.created_at DESC`,
      [cartId, row.id],
    );
    return mapLine(lineRows[0]!);
  },

  async findItem(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    itemId: string,
  ): Promise<CartLine | null> {
    const cartId = await ensureCart(db, userId);
    const { rows } = await db.query<Record<string, unknown>>(
      `${LINE_SELECT} AND ci.id = $2
      ORDER BY ci.created_at DESC`,
      [cartId, itemId],
    );
    return rows[0] ? mapLine(rows[0]) : null;
  },

  async updateQuantity(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    itemId: string,
    quantity: number,
  ): Promise<boolean> {
    const cartId = await ensureCart(db, userId);
    const result = await db.query(
      'UPDATE cart_items SET quantity = $3 WHERE id = $1 AND cart_id = $2',
      [itemId, cartId, quantity],
    );
    return (result.rowCount ?? 0) > 0;
  },

  async removeItem(db: pg.Pool | pg.PoolClient, userId: string, itemId: string): Promise<boolean> {
    const cartId = await ensureCart(db, userId);
    const result = await db.query('DELETE FROM cart_items WHERE id = $1 AND cart_id = $2', [itemId, cartId]);
    return (result.rowCount ?? 0) > 0;
  },

  async clear(db: pg.Pool | pg.PoolClient, userId: string): Promise<void> {
    const cartId = await ensureCart(db, userId);
    await db.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
  },
};