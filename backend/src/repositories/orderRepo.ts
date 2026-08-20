import type pg from 'pg';
import type { OrderRow, OrderStatus, Paginated } from '../types/index.js';

export interface OrderItemSnapshot {
  productId: string;
  productName: string;
  imageUrl: string | null;
  optionValue: string | null;
  price: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderWithItems {
  id: string;
  number: string;
  status: OrderStatus;
  province: string;
  deliveryFee: number;
  fullAddress: string;
  phone: string;
  productsTotal: number;
  discount: number;
  total: number;
  customer: { id: string; name: string; phone: string } | null;
  createdAt: Date;
  items: OrderItemSnapshot[];
}

const ORDER_WITH_CUSTOMER = `
  SELECT o.*,
         COALESCE(
           (SELECT json_agg(json_build_object(
              'productId', oi.product_id,
              'productName', oi.product_name,
              'imageUrl', oi.image_url,
              'optionValue', oi.option_value,
              'price', oi.price,
              'quantity', oi.quantity,
              'lineTotal', oi.line_total
            ) ORDER BY oi.id)
            FROM order_items oi
            WHERE oi.order_id = o.id),
           '[]'::json
         ) AS items,
         json_build_object('id', u.id, 'name', u.username, 'phone', u.phone) AS customer
  FROM orders o
  LEFT JOIN users u ON u.id = o.user_id`;

function mapOrder(row: Record<string, unknown>): OrderWithItems {
  return {
    id: row.id as string,
    number: row.number as string,
    status: row.status as OrderStatus,
    province: row.province as string,
    deliveryFee: Number(row.delivery_fee),
    fullAddress: row.full_address as string,
    phone: row.phone as string,
    productsTotal: Number(row.products_total),
    discount: Number(row.discount),
    total: Number(row.total),
    customer: (row.customer as OrderWithItems['customer']) ?? null,
    createdAt: new Date(row.created_at as string),
    items: (row.items as OrderItemSnapshot[]) ?? [],
  };
}

export const orderRepo = {
  /** إنشاء الطلب داخل المعاملة: لقطات + تنزيل المخزون + سجل الحالة. */
  async create(
    db: pg.PoolClient,
    input: {
      userId: string;
      governorateId: string;
      province: string;
      deliveryFee: number;
      fullAddress: string;
      phone: string;
      items: OrderItemSnapshot[];
    },
  ): Promise<OrderWithItems> {
    const { rows: numRows } = await db.query<{ number: string }>(
      "SELECT nextval('order_number_seq')::text AS number",
    );
    const orderNumber = numRows[0]!.number;

    const productsTotal = input.items.reduce((sum, item) => sum + item.lineTotal, 0);
    const total = productsTotal + input.deliveryFee;

    const { rows } = await db.query<Record<string, unknown>>(
      `INSERT INTO orders (
         number, user_id, governorate_id, province, delivery_fee, full_address,
         phone, products_total, discount, total, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, 'PENDING_ADMIN_CONFIRMATION')
       RETURNING id, number, status, province, delivery_fee, full_address,
                 phone, products_total, discount, total, created_at`,
      [
        orderNumber,
        input.userId,
        input.governorateId,
        input.province,
        input.deliveryFee,
        input.fullAddress,
        input.phone,
        productsTotal,
        total,
      ],
    );
    const order = rows[0]!;

    for (const item of input.items) {
      await db.query(
        `INSERT INTO order_items (
           order_id, product_id, product_name, image_url, option_value, price, quantity, line_total
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [order.id, item.productId, item.productName, item.imageUrl, item.optionValue, item.price, item.quantity, item.lineTotal],
      );
      await db.query(
        'UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock >= $2',
        [item.productId, item.quantity],
      );
    }

    await db.query(
      `INSERT INTO order_status_history (order_id, status, changed_by)
       VALUES ($1, 'PENDING_ADMIN_CONFIRMATION', $2)`,
      [order.id, input.userId],
    );

    return mapOrder({ ...order, items: [], customer: null });
  },

  async findById(db: pg.Pool | pg.PoolClient, id: string): Promise<OrderWithItems | null> {
    const { rows } = await db.query<Record<string, unknown>>(
      `${ORDER_WITH_CUSTOMER} WHERE o.id = $1`,
      [id],
    );
    return rows[0] ? mapOrder(rows[0]) : null;
  },

  async findByNumber(db: pg.Pool | pg.PoolClient, number: string): Promise<OrderWithItems | null> {
    const { rows } = await db.query<Record<string, unknown>>(
      `${ORDER_WITH_CUSTOMER} WHERE o.number = $1`,
      [number],
    );
    return rows[0] ? mapOrder(rows[0]) : null;
  },

  async listByUser(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    page: number,
    limit: number,
    status?: OrderStatus,
  ): Promise<Paginated<OrderWithItems>> {
    const where = ['o.user_id = $1'];
    const values: unknown[] = [userId];
    if (status) {
      values.push(status);
      where.push(`o.status = $${values.length}`);
    }
    values.push(limit, (page - 1) * limit);
    const condition = where.join(' AND ');
    const [{ rows }, countRows] = await Promise.all([
      db.query<Record<string, unknown>>(
        `${ORDER_WITH_CUSTOMER} WHERE ${condition} ORDER BY o.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM orders o WHERE ${condition}`,
        values.slice(0, values.length - 2),
      ),
    ]);
    const total = Number(countRows.rows[0]?.total ?? 0);
    return { items: rows.map(mapOrder), page, limit, total, hasMore: page * limit < total };
  },

  async listAll(
    db: pg.Pool | pg.PoolClient,
    page: number,
    limit: number,
    status?: OrderStatus,
  ): Promise<Paginated<OrderWithItems>> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (status) {
      values.push(status);
      where.push(`o.status = $${values.length}`);
    }
    values.push(limit, (page - 1) * limit);
    const condition = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const [{ rows }, countRows] = await Promise.all([
      db.query<Record<string, unknown>>(
        `${ORDER_WITH_CUSTOMER} ${condition} ORDER BY o.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM orders o ${condition}`,
        values.slice(0, values.length - 2),
      ),
    ]);
    const total = Number(countRows.rows[0]?.total ?? 0);
    return { items: rows.map(mapOrder), page, limit, total, hasMore: page * limit < total };
  },

  /** عدّادات الحالات لكل طلب لأهداف العرض والإحصاء. */
  async statusCounts(db: pg.Pool | pg.PoolClient, userId?: string) {
    const values: unknown[] = [];
    const where = userId ? 'WHERE o.user_id = $1' : '';
    if (userId) values.push(userId);
    const { rows } = await db.query<{ status: OrderStatus; total: string }>(
      `SELECT o.status, COUNT(*)::text AS total
       FROM orders o ${where}
       GROUP BY o.status`,
      values,
    );
    const counts: Record<OrderStatus, number> = {
      PENDING_ADMIN_CONFIRMATION: 0,
      CONFIRMED: 0,
      PREPARING: 0,
      OUT_FOR_DELIVERY: 0,
      COMPLETED: 0,
      REJECTED: 0,
    };
    for (const row of rows) counts[row.status] = Number(row.total);
    return counts;
  },

  /** تحديث الحالة مع التحقق من الانتقال المسموح + تسجيل التاريخ. */
  async updateStatus(
    db: pg.Pool | pg.PoolClient,
    id: string,
    status: OrderStatus,
    note: string | null,
    changedBy: string,
  ) {
    await db.query('UPDATE orders SET status = $2 WHERE id = $1', [id, status]);
    await db.query(
      'INSERT INTO order_status_history (order_id, status, changed_by, note) VALUES ($1, $2, $3, $4)',
      [id, status, changedBy, note],
    );
  },
};