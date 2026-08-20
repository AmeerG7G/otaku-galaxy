import type pg from 'pg';
import type { Paginated, ProductRow } from '../types/index.js';

/** يحوّل صفوف المنتجات + صورها إلى الشكل الجاهز للواجهة. */
export function shapeProductImages(
  rows: (ProductRow & { images?: string[] })[],
) {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    stock: row.stock,
    images: (row.images ?? []) as string[],
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    reviewCount: row.review_count,
    isOffer: row.is_offer,
    isSelected: row.is_selected,
  }));
}

const PRODUCT_WITH_IMAGES = `
  SELECT p.*,
         COALESCE(
           (SELECT json_agg(pi.url ORDER BY pi.sort_order)
            FROM product_images pi WHERE pi.product_id = p.id),
           '[]'::json
         ) AS images
  FROM products p`;

export const favoriteRepo = {
  /** مفضّلات المستخدم — المنتجات النشطة فقط. */
  async list(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    page: number,
    limit: number,
  ): Promise<Paginated<ReturnType<typeof shapeProductImages>[number]>> {
    const values: unknown[] = [userId, limit, (page - 1) * limit];
    const [{ rows }, countRows] = await Promise.all([
      db.query(
        `${PRODUCT_WITH_IMAGES}
         JOIN favorites fav ON fav.product_id = p.id AND fav.user_id = $1
         WHERE p.is_active = TRUE
         ORDER BY fav.created_at DESC
         LIMIT $2 OFFSET $3`,
        values,
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total
         FROM favorites fav
         JOIN products p ON p.id = fav.product_id
         WHERE fav.user_id = $1 AND p.is_active = TRUE`,
        [userId],
      ),
    ]);
    const total = Number(countRows.rows[0]?.total ?? 0);
    return {
      items: shapeProductImages(rows),
      page,
      limit,
      total,
      hasMore: page * limit < total,
    };
  },

  async isFavorite(db: pg.Pool | pg.PoolClient, userId: string, productId: string) {
    const { rows } = await db.query(
      'SELECT 1 FROM favorites WHERE user_id = $1 AND product_id = $2',
      [userId, productId],
    );
    return rows.length > 0;
  },

  async add(db: pg.Pool | pg.PoolClient, userId: string, productId: string) {
    await db.query(
      'INSERT INTO favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, productId],
    );
  },

  async remove(db: pg.Pool | pg.PoolClient, userId: string, productId: string) {
    await db.query(
      'DELETE FROM favorites WHERE user_id = $1 AND product_id = $2',
      [userId, productId],
    );
  },
};