import type pg from 'pg';
import { SELECT_WITH_IMAGES, mapProduct } from './catalogRepo.js';
import type { Paginated, ProductRow } from '../types/index.js';

export const favoriteRepo = {
  /**
   * مفضّلات المستخدم — المنتجات النشطة فقط.
   *
   * تعيد **منتجات**، فتستعمل تمثيل المنتج المعتمد ([mapProduct]).
   *
   * [CRITICAL] كان هنا `shapeProductImages` — تمثيلٌ ثالثٌ للمنتج أسقط كل
   * بيانات العرض: `previousPrice` و`discountPercent` و`hasDeliveryPromo`
   * و`deliveryPromoAmount` و`franchiseIds` و`isActive`. فكان المنتج المخفَّض
   * يظهر بسعره الكامل بلا شارة خصم في شاشة المفضلة وحدها، بينما يظهر
   * مخفَّضاً في الرئيسية والبحث — بلا خطأ يكشف السبب، لأن نموذج فلاتر يقرأ
   * الحقول الغائبة كـ`null`/`0`.
   *
   * الاستعلام يستعمل بنية `SELECT_WITH_IMAGES` كي تصل الأعمدة التي يحتاجها
   * المُحوِّل (الصور والامتيازات) — لا يكفي استدعاء المُحوِّل وحده.
   */
  async list(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    page: number,
    limit: number,
  ): Promise<Paginated<ReturnType<typeof mapProduct>>> {
    const values: unknown[] = [userId, limit, (page - 1) * limit];
    const [{ rows }, countRows] = await Promise.all([
      db.query<ProductRow & { images?: unknown; franchise_ids?: unknown }>(
        `${SELECT_WITH_IMAGES('p')}
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
      items: rows.map(mapProduct),
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