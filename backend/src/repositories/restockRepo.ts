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

  // ═══ اشتراكات اللون (088) ═══

  /** اشتراك بلونٍ بعينه — مكرَّر آمن (الفريد على الزبون واللون). */
  async subscribeVariant(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    productId: string,
    variantId: string,
  ): Promise<{ alreadySubscribed: boolean }> {
    const { rowCount } = await db.query(
      `INSERT INTO restock_variant_subscriptions (user_id, product_id, variant_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, variant_id) DO NOTHING`,
      [userId, productId, variantId],
    );
    return { alreadySubscribed: (rowCount ?? 0) === 0 };
  },

  /** إلغاء اشتراك الزبون بلون — صفّه وحده (الملكية في شرط الجملة). */
  async unsubscribeVariant(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    productId: string,
    variantId: string,
  ): Promise<boolean> {
    const { rowCount } = await db.query(
      `DELETE FROM restock_variant_subscriptions
        WHERE user_id = $1 AND product_id = $2 AND variant_id = $3`,
      [userId, productId, variantId],
    );
    return (rowCount ?? 0) > 0;
  },

  /** حالة الزبون على منتجٍ واحد: اشتراك المنتج كله، والألوان المشترَك بها. */
  async viewerState(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    productId: string,
  ): Promise<{ product: boolean; variantIds: string[] }> {
    const { rows } = await db.query<{ product: boolean; variant_ids: string[] | null }>(
      `SELECT EXISTS (SELECT 1 FROM restock_subscriptions
                       WHERE user_id = $1 AND product_id = $2) AS product,
              (SELECT array_agg(variant_id::text ORDER BY created_at)
                 FROM restock_variant_subscriptions
                WHERE user_id = $1 AND product_id = $2) AS variant_ids`,
      [userId, productId],
    );
    return { product: rows[0]?.product === true, variantIds: rows[0]?.variant_ids ?? [] };
  },

  /** اشتراكات الزبون بالألوان — اسم اللون وتوفره من القاعدة عند كل نداء. */
  async listMineVariants(
    db: pg.Pool | pg.PoolClient,
    userId: string,
  ): Promise<
    {
      productId: string;
      variantId: string;
      nameAr: string;
      nameCkb: string | null;
      colorNameAr: string;
      colorNameCkb: string | null;
      colorHex: string | null;
      inStock: boolean;
    }[]
  > {
    const { rows } = await db.query<{
      product_id: string;
      variant_id: string;
      name: string;
      name_ckb: string | null;
      color_name: string;
      color_name_ckb: string | null;
      color_hex: string | null;
      in_stock: boolean;
    }>(
      `SELECT rv.product_id, rv.variant_id, p.name, p.name_ckb,
              v.color_name, v.color_name_ckb, v.color_hex,
              (v.is_active AND v.stock > 0) AS in_stock
         FROM restock_variant_subscriptions rv
         JOIN products p ON p.id = rv.product_id
         JOIN product_variants v ON v.id = rv.variant_id
        WHERE rv.user_id = $1
        ORDER BY rv.created_at DESC`,
      [userId],
    );
    return rows.map((r) => ({
      productId: r.product_id,
      variantId: r.variant_id,
      nameAr: r.name,
      nameCkb: kurdishOrNull(r.name_ckb),
      colorNameAr: r.color_name,
      colorNameCkb: kurdishOrNull(r.color_name_ckb),
      colorHex: r.color_hex,
      inStock: r.in_stock === true,
    }));
  },

  /**
   * اشتراكات ألوان المنتج التي صار لونها متاحاً الآن — مع حذفها في الجملة نفسها.
   *
   * «متاح» = اللون فعّال بمخزونٍ موجب، والمنتج فعّال ومُسعَّر. الاشتراك لا
   * يُنشأ إلا على لونٍ غير متاح (`VARIANT_IN_STOCK`)، فاشتراكٌ على لونٍ متاح
   * لا يعني إلا أن اللون عاد — أيّاً كان المسار الذي أعاده.
   *
   * [CRITICAL] `DELETE … RETURNING` يستهلك الاشتراك ويعيد صاحبه معاً: معاملتان
   * متزامنتان على المنتج نفسه لا تُبلّغان الزبون مرتين — الثانية لا تجد صفّاً.
   */
  async consumeAvailableVariants(
    db: pg.Pool | pg.PoolClient,
    productId: string,
  ): Promise<
    { userId: string; variantId: string; colorNameAr: string; colorNameCkb: string | null }[]
  > {
    const { rows } = await db.query<{
      user_id: string;
      variant_id: string;
      color_name: string;
      color_name_ckb: string | null;
    }>(
      `WITH available AS (
         SELECT v.id, v.color_name, v.color_name_ckb
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
          WHERE v.product_id = $1
            AND v.is_active AND v.stock > 0
            AND p.is_active AND p.price IS NOT NULL
       ), consumed AS (
         DELETE FROM restock_variant_subscriptions rv
          USING available a
          WHERE rv.product_id = $1 AND rv.variant_id = a.id
         RETURNING rv.user_id, rv.variant_id, rv.created_at
       )
       SELECT c.user_id, c.variant_id, a.color_name, a.color_name_ckb
         FROM consumed c JOIN available a ON a.id = c.variant_id
        ORDER BY c.created_at`,
      [productId],
    );
    return rows.map((r) => ({
      userId: r.user_id,
      variantId: r.variant_id,
      colorNameAr: r.color_name,
      colorNameCkb: kurdishOrNull(r.color_name_ckb),
    }));
  },

  /** طلب التوفر بالألوان من وجهة الإدارة — الألوان غير المتاحة التي عليها اشتراكات. */
  async adminVariantDemand(db: pg.Pool | pg.PoolClient): Promise<
    {
      productId: string;
      productName: string;
      productStock: number;
      restockAt: string | null;
      variantId: string;
      colorName: string;
      subscriberCount: number;
      subscribers: { username: string; phone: string }[];
    }[]
  > {
    const { rows } = await db.query(
      `SELECT p.id AS product_id, p.name AS product_name, p.stock AS product_stock,
              p.restock_at, v.id AS variant_id, v.color_name,
              COUNT(rv.id)::text AS subscriber_count,
              json_agg(json_build_object('username', u.username, 'phone', u.phone)
                       ORDER BY rv.created_at DESC) AS subscribers
         FROM restock_variant_subscriptions rv
         JOIN product_variants v ON v.id = rv.variant_id
         JOIN products p ON p.id = rv.product_id
         JOIN users u ON u.id = rv.user_id
        WHERE p.is_active = TRUE AND NOT (v.is_active AND v.stock > 0)
        GROUP BY p.id, v.id
        ORDER BY COUNT(rv.id) DESC, p.name, v.sort_order`,
    );
    return rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      productStock: Number(row.product_stock),
      restockAt: row.restock_at ? new Date(row.restock_at).toISOString() : null,
      variantId: row.variant_id,
      colorName: row.color_name,
      subscriberCount: Number(row.subscriber_count),
      subscribers: (row.subscribers as { username: string; phone: string }[]) ?? [],
    }));
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