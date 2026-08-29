import type pg from 'pg';
import type { Paginated, ReviewDto, ReviewRow, ReviewStatus } from '../types/index.js';

/** يحوّل صف قاعدة البيانات إلى الشكل الذي يتوقعه تطبيق فلاتر. */
export function shapeReview(row: ReviewRow): ReviewDto {
  return {
    id: row.id,
    // المنتج قد يكون محذوفاً؛ التقييم يبقى تاريخياً بسلسلة فارغة.
    productId: row.product_id ?? '',
    productName: row.product_name,
    orderId: row.order_id,
    rating: row.rating,
    comment: row.comment,
    photoUrl: row.photo_url,
    status: row.status,
    rejectionReason: row.rejection_reason,
    customerName: row.customer_name,
    createdAt: new Date(row.created_at).toISOString(),
    // تُملأ في صور المجتمع فقط؛ تبقى undefined في بقية الاستعلامات.
    categoryId: row.category_id ?? undefined,
    categoryName: row.category_name ?? undefined,
  };
}

export const reviewRepo = {
  async findById(db: pg.Pool | pg.PoolClient, id: string) {
    const { rows } = await db.query<ReviewRow>('SELECT * FROM reviews WHERE id = $1', [id]);
    return rows[0] ?? null;
  },

  /** كل تقييمات العميل (بكل الحالات). */
  async listMine(db: pg.Pool | pg.PoolClient, userId: string) {
    const { rows } = await db.query<ReviewRow>(
      'SELECT * FROM reviews WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return rows.map(shapeReview);
  },

  /** تقييم منتج ضمن طلب محدّد — تقييم واحد لكل منتج بكل طلب. */
  async findForOrderProduct(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    orderId: string,
    productId: string,
  ) {
    const { rows } = await db.query<ReviewRow>(
      `SELECT * FROM reviews
       WHERE user_id = $1 AND order_id = $2 AND product_id = $3`,
      [userId, orderId, productId],
    );
    return rows[0] ? shapeReview(rows[0]) : null;
  },

  /** التقييمات المنشورة لمنتج — تُعرض في تفاصيل المنتج. */
  async listApprovedForProduct(db: pg.Pool | pg.PoolClient, productId: string) {
    const { rows } = await db.query<ReviewRow>(
      `SELECT * FROM reviews
       WHERE product_id = $1 AND status = 'approved'
       ORDER BY created_at DESC`,
      [productId],
    );
    return rows.map(shapeReview);
  },

  /**
   * التقييمات المعتمدة المصحوبة بصورة — تُغذّي شاشة المجتمع.
   *
   * تُربط بالمنتج والقسم حتى تحمل كل صورة قسمها، وتُفلتر على الخادم قبل
   * الحدّ الأعلى — فالفلترة تشمل كامل البيانات لا الصفحة المحمَّلة فقط.
   */
  async listCommunityPhotos(
    db: pg.Pool | pg.PoolClient,
    limit: number,
    categoryId?: string | null,
  ) {
    const { rows } = await db.query<ReviewRow>(
      `SELECT r.*, p.category_id, c.name AS category_name
         FROM reviews r
         LEFT JOIN products p ON p.id = r.product_id
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE r.status = 'approved'
          AND r.photo_url IS NOT NULL AND btrim(r.photo_url) <> ''
          AND ($2::uuid IS NULL OR p.category_id = $2::uuid)
        ORDER BY r.created_at DESC
        LIMIT $1`,
      [limit, categoryId ?? null],
    );
    return rows.map(shapeReview);
  },

  async create(
    db: pg.Pool | pg.PoolClient,
    input: {
      userId: string;
      orderId: string;
      productId: string;
      productName: string;
      rating: number;
      comment: string;
      photoUrl: string | null;
      customerName: string;
    },
  ) {
    const { rows } = await db.query<ReviewRow>(
      `INSERT INTO reviews
         (user_id, order_id, product_id, product_name, rating, comment, photo_url, customer_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.userId,
        input.orderId,
        input.productId,
        input.productName,
        input.rating,
        input.comment,
        input.photoUrl,
        input.customerName,
      ],
    );
    return shapeReview(rows[0]!);
  },

  /** تعديل تقييم مرفوض وإعادته لقائمة الانتظار. */
  async resubmit(
    db: pg.Pool | pg.PoolClient,
    id: string,
    input: { rating: number; comment: string; photoUrl: string | null },
  ) {
    const { rows } = await db.query<ReviewRow>(
      `UPDATE reviews
          SET rating = $2,
              comment = $3,
              photo_url = $4,
              status = 'pending',
              rejection_reason = NULL,
              reviewed_by = NULL,
              reviewed_at = NULL
        WHERE id = $1
        RETURNING *`,
      [id, input.rating, input.comment, input.photoUrl],
    );
    return rows[0] ? shapeReview(rows[0]) : null;
  },

  /** قرار الإدارة: اعتماد أو رفض مع سبب. */
  async moderate(
    db: pg.Pool | pg.PoolClient,
    id: string,
    status: Exclude<ReviewStatus, 'pending'>,
    adminId: string,
    rejectionReason: string | null,
  ) {
    const { rows } = await db.query<ReviewRow>(
      `UPDATE reviews
          SET status = $2,
              rejection_reason = $3,
              reviewed_by = $4,
              reviewed_at = now()
        WHERE id = $1
        RETURNING *`,
      [id, status, status === 'rejected' ? rejectionReason : null, adminId],
    );
    return rows[0] ?? null;
  },

  /** قائمة الإدارة مع فلترة بالحالة. */
  async listForAdmin(
    db: pg.Pool | pg.PoolClient,
    filter: { status?: ReviewStatus; page: number; limit: number },
  ): Promise<Paginated<ReviewDto & { userId: string; hasPhoto: boolean }>> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filter.status) {
      values.push(filter.status);
      where.push(`status = $${values.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    values.push(filter.limit, (filter.page - 1) * filter.limit);
    const [{ rows }, countRows] = await Promise.all([
      db.query<ReviewRow>(
        `SELECT * FROM reviews ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM reviews ${whereSql}`,
        values.slice(0, values.length - 2),
      ),
    ]);

    const total = Number(countRows.rows[0]?.total ?? 0);
    return {
      items: rows.map((row) => ({
        ...shapeReview(row),
        userId: row.user_id,
        hasPhoto: Boolean(row.photo_url && row.photo_url.trim()),
      })),
      page: filter.page,
      limit: filter.limit,
      total,
      hasMore: filter.page * filter.limit < total,
    };
  },

  /** عدّاد التقييمات المعلّقة — يظهر في لوحة التحكم. */
  async countPending(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM reviews WHERE status = 'pending'`,
    );
    return Number(rows[0]?.total ?? 0);
  },
};
