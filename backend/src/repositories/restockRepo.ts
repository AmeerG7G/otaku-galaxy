import type pg from 'pg';
import { kurdishOrNull } from '../utils/locale.js';

/**
 * «أخبرني عند توفره»: اشتراك العميل بمنتج نافد المخزون.
 *
 * الهدف إعلام بالتوفر داخل التطبيق لا push: عند عودة المخزون من صفر إلى ما
 * فوق تُنشأ إشعارات `backInStock` للمشتركين وتُحذف اشتراكاتهم (الاشتراك
 * يُستهلَك بإشعار واحد لا يتكرر).
 */
export const restockRepo = {
  /** تسجيل اشتراك — مكرَّر آمن (الفريد على الثنائي لا خطأ). */
  async subscribe(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    productId: string,
  ): Promise<{ alreadySubscribed: boolean }> {
    const { rowCount } = await db.query(
      `INSERT INTO restock_subscriptions (user_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO NOTHING`,
      [userId, productId],
    );
    return { alreadySubscribed: (rowCount ?? 0) === 0 };
  },

  /** إلغاء اشتراك العميل بمنتج. */
  async unsubscribe(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    productId: string,
  ): Promise<boolean> {
    const { rowCount } = await db.query(
      'DELETE FROM restock_subscriptions WHERE user_id = $1 AND product_id = $2',
      [userId, productId],
    );
    return (rowCount ?? 0) > 0;
  },

  /** هل اشترك هذا العميل بمنتج معيّن؟ */
  async isSubscribed(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    productId: string,
  ): Promise<boolean> {
    const { rows } = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM restock_subscriptions WHERE user_id = $1 AND product_id = $2',
      [userId, productId],
    );
    return Number(rows[0]?.total ?? 0) > 0;
  },

  /**
   * اشتراكات العميل الحالية — مع موعد التوفر المتوقَّع لكل منتج.
   *
   * [CRITICAL] الموعد يُقرأ من `products` عند كل نداء، لا من نسخة محفوظة في
   * صفّ الاشتراك. المسؤول قد يكون عدّله بعد اشتراك الزبون بأسبوع؛ لقطةٌ
   * مخزَّنة وقت الاشتراك كانت ستعرض للزبون موعداً بطل مفعوله.
   *
   * `inStock` مرفق لأن التوفر الفعلي يتقدّم على أي موعد متوقَّع: الواجهة
   * تحتاج أن تعرف أن المنتج عاد فتعرض «أضف إلى السلة» بدل انتظارٍ انتهى.
   */
  async listMine(
    db: pg.Pool | pg.PoolClient,
    userId: string,
  ): Promise<
    {
      productId: string;
      /** الاسم العربي — الحقل القديم؛ الاسمان الصريحان بجانبه (066). */
      name: string;
      nameAr: string;
      nameCkb: string | null;
      restockAt: string | null;
      inStock: boolean;
    }[]
  > {
    const { rows } = await db.query<{
      product_id: string;
      name: string;
      name_ckb: string | null;
      restock_at: Date | string | null;
      in_stock: boolean;
    }>(
      `SELECT rs.product_id, p.name, p.name_ckb, p.restock_at, (p.stock > 0) AS in_stock
         FROM restock_subscriptions rs
         JOIN products p ON p.id = rs.product_id
        WHERE rs.user_id = $1
        ORDER BY rs.created_at DESC`,
      [userId],
    );
    return rows.map((r) => ({
      productId: r.product_id,
      name: r.name,
      nameAr: r.name,
      nameCkb: kurdishOrNull(r.name_ckb),
      restockAt: r.restock_at ? new Date(r.restock_at).toISOString() : null,
      inStock: r.in_stock === true,
    }));
  },

  /** كل المشتركين بمنتج — مسار الإعلام عند عودة التوفر. */
  async subscriberIds(
    db: pg.Pool | pg.PoolClient,
    productId: string,
  ): Promise<string[]> {
    const { rows } = await db.query<{ user_id: string }>(
      'SELECT user_id FROM restock_subscriptions WHERE product_id = $1',
      [productId],
    );
    return rows.map((r) => r.user_id);
  },

  /** فراغ قائمة الاشتراكات بمنتج — يُستكمل فور إرسال إشعارات التوفر. */
  async clearForProduct(
    db: pg.Pool | pg.PoolClient,
    productId: string,
  ): Promise<void> {
    await db.query('DELETE FROM restock_subscriptions WHERE product_id = $1', [
      productId,
    ]);
  },

  /**
   * طلبات إعادة التوفر من وجهة الإدارة: المنتجات النافدة التي عليها
   * اشتراكات، مع عددها وأحدث المشتركين (اسم + هاتف كامل).
   *
   * [CRITICAL] هذه الدالة تُقرأ من `GET /api/admin/restock/demand` وحده،
   * وهو خلف `authenticate` ثم `requireAdmin` (انظر `app.ts`). لم تكن يوماً
   * مسارَ عميل، فالتقنيع الذي كان هنا لم يكن يحرس واجهةً عامة — كان تقليلاً
   * للبيانات داخل سياقٍ مُصرَّح له أصلاً.
   *
   * وقد سقط مبرّره: الطاقم يتواصل مع المشترك ليخبره بالتوفر، والرقم منقوصَ
   * أربع خانات لا يُتّصل به. الشكل الآن يطابق `listCustomers` في
   * `userRepo`: حقل `phone` كاملاً بالصيغة الدولية على مسار إداري — لا
   * تمثيل ثانٍ للهاتف ولا قاعدة تقنيع تتفرّع.
   *
   * ما زال ممنوعاً خروجُه من أي مسار عميل: مسارات `/restock-subscriptions`
   * لا تُرجع هاتفاً أصلاً (`listMine` لا يلمس `users`).
   */
  async adminDemand(
    db: pg.Pool | pg.PoolClient,
  ): Promise<
    {
      productId: string;
      name: string;
      subscriberCount: number;
      restockAt: string | null;
      subscribers: { username: string; phone: string }[];
    }[]
  > {
    const { rows } = await db.query(
      `SELECT p.id           AS product_id,
              p.name         AS name,
              p.restock_at   AS restock_at,
              COUNT(rs.id)::text AS subscriber_count,
              COALESCE(
                json_agg(
                  json_build_object(
                    'username', u.username,
                    'phone', u.phone
                  ) ORDER BY rs.created_at DESC
                ) FILTER (WHERE rs.id IS NOT NULL),
                '[]'::json
              ) AS subscribers
         FROM products p
         JOIN restock_subscriptions rs ON rs.product_id = p.id
         JOIN users u ON u.id = rs.user_id
        WHERE p.is_active = TRUE AND p.stock = 0
        GROUP BY p.id
        ORDER BY COUNT(rs.id) DESC, p.name`,
    );
    return rows.map((row) => ({
      productId: row.product_id,
      name: row.name,
      subscriberCount: Number(row.subscriber_count),
      restockAt: row.restock_at ? new Date(row.restock_at).toISOString() : null,
      subscribers: (row.subscribers as { username: string; phone: string }[]) ?? [],
    }));
  },
};