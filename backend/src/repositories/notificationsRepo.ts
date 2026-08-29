import type pg from 'pg';
import type { NotificationDto, NotificationRow, NotificationType } from '../types/index.js';

function shapeNotification(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    read: row.read_at !== null,
    createdAt: new Date(row.created_at).toISOString(),
    orderId: row.order_id,
    reviewId: row.review_id,
    productId: row.product_id,
  };
}

export const notificationRepo = {
  async listMine(db: pg.Pool | pg.PoolClient, userId: string, limit = 100) {
    const { rows } = await db.query<NotificationRow>(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return rows.map(shapeNotification);
  },

  async countUnread(db: pg.Pool | pg.PoolClient, userId: string) {
    const { rows } = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId],
    );
    return Number(rows[0]?.total ?? 0);
  },

  /** تعليم إشعار واحد كمقروء — مقيّد بمالكه. */
  async markRead(db: pg.Pool | pg.PoolClient, userId: string, id: string) {
    const { rowCount } = await db.query(
      `UPDATE notifications SET read_at = now()
       WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  },

  async markAllRead(db: pg.Pool | pg.PoolClient, userId: string) {
    const { rowCount } = await db.query(
      'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
      [userId],
    );
    return rowCount ?? 0;
  },

  /**
   * الإشعارات كما تقرأها الإدارة — كل المستخدمين، مع ترشيح وترقيم.
   *
   * نفس الجدول ونفس الأنواع التي يستعملها التطبيق. المسار الإداري يقرأ فقط:
   * لا إنشاء ولا تعليم كمقروء نيابةً عن العميل — «مقروء» حالةٌ يملكها صاحب
   * الإشعار وحده، وتزويرها من اللوحة يفسد عدّاد غير المقروء لديه.
   */
  async listForAdmin(
    db: pg.Pool | pg.PoolClient,
    options: {
      page: number;
      limit: number;
      type?: NotificationType;
      userId?: string;
      read?: boolean;
    },
  ) {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (options.type) {
      values.push(options.type);
      conditions.push(`n.type = $${values.length}`);
    }
    if (options.userId) {
      values.push(options.userId);
      conditions.push(`n.user_id = $${values.length}`);
    }
    if (options.read === true) conditions.push('n.read_at IS NOT NULL');
    if (options.read === false) conditions.push('n.read_at IS NULL');

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countValues = [...values];
    values.push(options.limit, (options.page - 1) * options.limit);

    const [{ rows }, countRows] = await Promise.all([
      db.query<NotificationRow & { username: string; phone: string }>(
        `SELECT n.*, u.username, u.phone
           FROM notifications n
           JOIN users u ON u.id = n.user_id
           ${where}
          ORDER BY n.created_at DESC
          LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM notifications n ${where}`,
        countValues,
      ),
    ]);

    const total = Number(countRows.rows[0]?.total ?? 0);
    return {
      items: rows.map((row) => ({
        ...shapeNotification(row),
        userId: row.user_id,
        // الاسم والهاتف فقط — نفس ما تعرضه إدارة الزبائن، بلا بيانات أخرى.
        username: row.username,
        phone: row.phone,
        readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
      })),
      page: options.page,
      limit: options.limit,
      total,
      hasMore: options.page * options.limit < total,
    };
  },

  /** أرقام مجمَّعة: الإجمالي، غير المقروء، والتوزيع على الأنواع. */
  async statsForAdmin(db: pg.Pool | pg.PoolClient) {
    const [totals, byType] = await Promise.all([
      db.query<{ total: string; unread: string; recipients: string }>(
        `SELECT COUNT(*)::text                                   AS total,
                COUNT(*) FILTER (WHERE read_at IS NULL)::text     AS unread,
                COUNT(DISTINCT user_id)::text                     AS recipients
           FROM notifications`,
      ),
      db.query<{ type: NotificationType; total: string; unread: string }>(
        `SELECT type,
                COUNT(*)::text                               AS total,
                COUNT(*) FILTER (WHERE read_at IS NULL)::text AS unread
           FROM notifications
          GROUP BY type
          ORDER BY COUNT(*) DESC`,
      ),
    ]);
    const row = totals.rows[0];
    return {
      total: Number(row?.total ?? 0),
      unread: Number(row?.unread ?? 0),
      recipients: Number(row?.recipients ?? 0),
      byType: byType.rows.map((r) => ({
        type: r.type,
        total: Number(r.total),
        unread: Number(r.unread),
      })),
    };
  },

  /** إنشاء إشعار — يُستدعى من خدمات الطلبات والتقييمات. */
  async create(
    db: pg.Pool | pg.PoolClient,
    input: {
      userId: string;
      type: NotificationType;
      title: string;
      body?: string;
      orderId?: string | null;
      reviewId?: string | null;
      productId?: string | null;
    },
  ) {
    const { rows } = await db.query<NotificationRow>(
      `INSERT INTO notifications (user_id, type, title, body, order_id, review_id, product_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.userId,
        input.type,
        input.title,
        input.body ?? '',
        input.orderId ?? null,
        input.reviewId ?? null,
        input.productId ?? null,
      ],
    );
    return shapeNotification(rows[0]!);
  },
};
