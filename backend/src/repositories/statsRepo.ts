import type pg from 'pg';
import type { OrderStatus } from '../types/index.js';

export interface DashboardStats {
  orders: {
    total: number;
    byStatus: Record<OrderStatus, number>;
  };
  revenue: {
    /** إيراد الطلبات المكتملة فقط — المال المحصَّل فعلاً. */
    completed: number;
    /** قيمة الطلبات الجارية (غير المكتملة وغير المرفوضة). */
    inProgress: number;
    completedThisMonth: number;
  };
  products: { total: number; active: number; lowStock: number; outOfStock: number };
  customers: { total: number };
  reviews: { pending: number };
}

/** حدّ «قارب على النفاد» — نفس الحد المستخدم في واجهة لوحة التحكم. */
export const LOW_STOCK_THRESHOLD = 5;

export const statsRepo = {
  /**
   * كل أرقام لوحة التحكم في استعلام واحد مجمَّع على الخادم — أدق وأخف من
   * جلب كل المنتجات والطلبات للمتصفح ثم عدّها هناك.
   */
  async dashboard(db: pg.Pool | pg.PoolClient): Promise<DashboardStats> {
    const { rows } = await db.query<Record<string, string>>(
      `SELECT
         (SELECT COUNT(*)::text FROM orders) AS orders_total,
         (SELECT COUNT(*)::text FROM orders WHERE status = 'PENDING_ADMIN_CONFIRMATION') AS s_pending,
         (SELECT COUNT(*)::text FROM orders WHERE status = 'CONFIRMED') AS s_confirmed,
         (SELECT COUNT(*)::text FROM orders WHERE status = 'PREPARING') AS s_preparing,
         (SELECT COUNT(*)::text FROM orders WHERE status = 'OUT_FOR_DELIVERY') AS s_delivery,
         (SELECT COUNT(*)::text FROM orders WHERE status = 'COMPLETED') AS s_completed,
         (SELECT COUNT(*)::text FROM orders WHERE status = 'REJECTED') AS s_rejected,
         (SELECT COALESCE(SUM(total), 0)::text FROM orders WHERE status = 'COMPLETED') AS rev_completed,
         (SELECT COALESCE(SUM(total), 0)::text FROM orders
           WHERE status NOT IN ('COMPLETED', 'REJECTED')) AS rev_in_progress,
         (SELECT COALESCE(SUM(total), 0)::text FROM orders
           WHERE status = 'COMPLETED'
             AND created_at >= date_trunc('month', now())) AS rev_month,
         (SELECT COUNT(*)::text FROM products) AS products_total,
         (SELECT COUNT(*)::text FROM products WHERE is_active = TRUE) AS products_active,
         (SELECT COUNT(*)::text FROM products
           WHERE is_active = TRUE AND stock > 0 AND stock <= $1) AS products_low,
         (SELECT COUNT(*)::text FROM products WHERE is_active = TRUE AND stock = 0) AS products_out,
         (SELECT COUNT(*)::text FROM users WHERE role = 'customer') AS customers_total,
         (SELECT COUNT(*)::text FROM reviews WHERE status = 'pending') AS reviews_pending`,
      [LOW_STOCK_THRESHOLD],
    );

    const row = rows[0]!;
    const n = (key: string) => Number(row[key] ?? 0);

    return {
      orders: {
        total: n('orders_total'),
        byStatus: {
          PENDING_ADMIN_CONFIRMATION: n('s_pending'),
          CONFIRMED: n('s_confirmed'),
          PREPARING: n('s_preparing'),
          OUT_FOR_DELIVERY: n('s_delivery'),
          COMPLETED: n('s_completed'),
          REJECTED: n('s_rejected'),
        },
      },
      revenue: {
        completed: n('rev_completed'),
        inProgress: n('rev_in_progress'),
        completedThisMonth: n('rev_month'),
      },
      products: {
        total: n('products_total'),
        active: n('products_active'),
        lowStock: n('products_low'),
        outOfStock: n('products_out'),
      },
      customers: { total: n('customers_total') },
      reviews: { pending: n('reviews_pending') },
    };
  },

  /** المنتجات التي قاربت النفاد — للوحة التحكم. */
  async lowStockProducts(db: pg.Pool | pg.PoolClient, limit = 8) {
    const { rows } = await db.query<{
      id: string;
      name: string;
      stock: number;
      price: string;
      image_url: string | null;
    }>(
      `SELECT p.id, p.name, p.stock, p.price,
              (SELECT pi.url FROM product_images pi
                WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1) AS image_url
         FROM products p
        WHERE p.is_active = TRUE AND p.stock <= $1
        ORDER BY p.stock, p.name
        LIMIT $2`,
      [LOW_STOCK_THRESHOLD, limit],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      stock: row.stock,
      price: Number(row.price),
      imageUrl: row.image_url,
    }));
  },
};
