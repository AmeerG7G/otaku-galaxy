import type pg from 'pg';
import type {
  CategoryRow,
  Paginated,
  ProductRow,
  ProductSort,
} from '../types/index.js';

/**
 * خريطة الترتيب: مفاتيح مغلقة ← جمل ORDER BY ثابتة.
 * لا يُركَّب أي نص من العميل داخل الاستعلام.
 */
const SORT_CLAUSES: Record<ProductSort, string> = {
  newest: 'p.created_at DESC',
  // NULLS LAST حتى لا تتصدّر المنتجات بلا سعر/تقييم القائمة.
  price_asc: 'p.price ASC NULLS LAST, p.created_at DESC',
  price_desc: 'p.price DESC NULLS LAST, p.created_at DESC',
  rating: 'p.rating DESC NULLS LAST, p.review_count DESC, p.created_at DESC',
};

function toNumber(v: string | number | null | undefined): number | null {
  return v === null || v === undefined ? null : Number(v);
}

/**
 * المُحوِّل المعتمد لصف منتج ← تمثيل الـAPI. **مصدر الحقيقة الوحيد.**
 *
 * [CRITICAL] لا تكتب تمثيلاً آخر لمنتج في أي مكان.
 *
 * كانت خمس دوال تبني «منتجاً» بأشكال مختلفة: هذه، ومصفوفتان يدويتان في
 * `catalogService` (الاكتشاف والتفاصيل)، وثالثة في `favoritesRepo`. كل
 * واحدة أغفلت حقولاً مختلفة — المفضلة بلا أي بيانات عرض، والتفاصيل
 * والاكتشاف بلا `deliveryPromoAmount` — فكان المنتج الواحد يظهر مخفَّضاً في
 * شاشة وبكامل سعره في أخرى. ولأن نموذج فلاتر يقرأ الغائب كـ`null`/`0`، لم
 * يكن هناك خطأ يُرى: فقط شارة خصم تختفي.
 *
 * نسبة الخصم تُشتق هنا من السعرين ولا تُقبل من أي مُدخل، فلا تُحسب بصيغة
 * ثانية في مكان ثانٍ.
 */
export function mapProduct(
  row: ProductRow & { images?: unknown; franchise_ids?: unknown },
) {
  const price = Number(row.price);
  const previousPrice = toNumber(row.previous_price);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price,
    stock: row.stock,
    images: (row.images as string[]) ?? [],
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    isActive: row.is_active,
    isOffer: row.is_offer,
    isSelected: row.is_selected,
    rating: toNumber(row.rating),
    reviewCount: row.review_count,
    // بيانات العرض الحقيقية: النسبة مشتقة من السعرين ولا تُدخل يدوياً،
    // فلا تظهر شارة خصم بلا سعر سابق فعلي أعلى من الحالي.
    previousPrice,
    discountPercent:
      previousPrice !== null && previousPrice > price
        ? Math.round(((previousPrice - price) / previousPrice) * 100)
        : null,
    hasDeliveryPromo: row.has_delivery_promo ?? false,
    // القيمة المعتمدة تجارياً لخصم التوصيل عن كل قطعة.
    deliveryPromoAmount: toNumber(row.delivery_promo_amount) ?? 0,
    franchiseIds: (row.franchise_ids as string[]) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * الأعمدة المرافقة التي يحتاجها [mapProduct] (الصور والامتيازات).
 *
 * مصدرها واحد لأن المُحوِّل واحد: أي استعلام يعيد منتجاً يجب أن يجلب هذه
 * الأعمدة، وإلا خرج المنتج بصور فارغة بلا سبب ظاهر.
 */
export const PRODUCT_RELATION_COLUMNS = (prefix: string) => `
         COALESCE(
           (SELECT json_agg(pi.url ORDER BY pi.sort_order)
            FROM product_images pi WHERE pi.product_id = ${prefix}.id),
           '[]'::json
         ) AS images,
         COALESCE(
           (SELECT json_agg(pf.franchise_id)
            FROM product_franchises pf WHERE pf.product_id = ${prefix}.id),
           '[]'::json
         ) AS franchise_ids`;

/** جليب منتجات مع صورها (شكل واحد لجميع قوائم الكتالوج). */
export const SELECT_WITH_IMAGES = (prefix: string) => `
  SELECT ${prefix}.*,
${PRODUCT_RELATION_COLUMNS(prefix)}
  FROM products ${prefix}`;

export const productRepo = {
  async findById(db: pg.Pool | pg.PoolClient, id: string) {
    const { rows } = await db.query<ProductRow & { images?: unknown; franchise_ids?: unknown }>(
      `${SELECT_WITH_IMAGES('p')} WHERE p.id = $1`,
      [id],
    );
    return rows[0] ? mapProduct(rows[0]) : null;
  },

  async list(
    db: pg.Pool | pg.PoolClient,
    options: {
      page: number;
      limit: number;
      categoryId?: string;
      subcategoryId?: string;
      isOffer?: boolean;
      isSelected?: boolean;
      includeInactive?: boolean;
      sort?: ProductSort;
    },
  ): Promise<Paginated<ReturnType<typeof mapProduct>>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (!options.includeInactive) conditions.push('p.is_active = TRUE');
    if (options.categoryId) {
      values.push(options.categoryId);
      conditions.push(`p.category_id = $${values.length}`);
    }
    if (options.subcategoryId) {
      values.push(options.subcategoryId);
      conditions.push(`p.subcategory_id = $${values.length}`);
    }
    if (options.isOffer === true) conditions.push('p.is_offer = TRUE');
    if (options.isSelected === true) conditions.push('p.is_selected = TRUE');
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    values.push(options.limit, (options.page - 1) * options.limit);
    // الترتيب الصريح من العميل يسبق ترتيب العروض/المختارات الافتراضي.
    const orderBy = options.sort
      ? SORT_CLAUSES[options.sort]
      : options.isOffer
        ? 'p.offer_rank NULLS LAST, p.created_at DESC'
        : options.isSelected
          ? 'p.selected_rank NULLS LAST, p.created_at DESC'
          : 'p.created_at DESC';

    const [{ rows }, countRows] = await Promise.all([
      db.query<ProductRow & { images?: unknown; franchise_ids?: unknown }>(
        `${SELECT_WITH_IMAGES('p')} ${where} ORDER BY ${orderBy} LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM products p ${where}`,
        values.slice(0, values.length - 2),
      ),
    ]);
    const total = Number(countRows.rows[0]?.total ?? 0);
    return {
      items: rows.map(mapProduct),
      page: options.page,
      limit: options.limit,
      total,
      hasMore: options.page * options.limit < total,
    };
  },

  /**
   * منتجات «اكتشف» — قائمة عشوائية مستقرة لكل بذرة.
   *
   * كان هذا الاستعلام يعيش في `catalogService` ومعه نسخة يدوية من التحويل
   * أسقطت `deliveryPromoAmount`. نُقل هنا ليمرّ بالمُحوِّل المعتمد.
   */
  async listDiscover(db: pg.Pool | pg.PoolClient, seed: string, limit: number) {
    const { rows } = await db.query<ProductRow & { images?: unknown; franchise_ids?: unknown }>(
      `${SELECT_WITH_IMAGES('p')}
       WHERE p.is_active = TRUE
       ORDER BY md5(p.id::text || $1)
       LIMIT $2`,
      [seed, limit],
    );
    return rows.map(mapProduct);
  },

  /**
   * تفاصيل منتج واحد: نفس تمثيل المنتج في القوائم، مضافاً إليه الخيارات.
   *
   * الخيارات هي الفارق الوحيد المشروع بين التفاصيل والقائمة؛ ما عداها يأتي
   * من المُحوِّل المعتمد بدل تمثيل ثانٍ كان ينسى حقولاً.
   */
  async findDetailById(db: pg.Pool | pg.PoolClient, id: string) {
    const { rows } = await db.query<
      ProductRow & { images?: unknown; franchise_ids?: unknown; options?: unknown }
    >(
      `SELECT p.*,
${PRODUCT_RELATION_COLUMNS('p')},
              COALESCE(
                (SELECT json_agg(json_build_object('id', po.id, 'name', po.name, 'values', po.values))
                 FROM product_options po WHERE po.product_id = p.id),
                '[]'::json
              ) AS options
       FROM products p
       WHERE p.id = $1 AND p.is_active = TRUE`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      ...mapProduct(row),
      options: (row.options as { id: string; name: string; values: string[] }[]) ?? [],
    };
  },

  /** بحث نصي جزئي (ILIKE مع دعم العربية) — البحث في PostgreSQL لا في التطبيق. */
  async search(
    db: pg.Pool | pg.PoolClient,
    query: string,
    page: number,
    limit: number,
  ): Promise<Paginated<ReturnType<typeof mapProduct>>> {
    const like = `%${query}%`;
    const [{ rows }, countRows] = await Promise.all([
      db.query<ProductRow & { images?: unknown; franchise_ids?: unknown }>(
        `${SELECT_WITH_IMAGES('p')}
         WHERE p.is_active = TRUE AND p.name ILIKE $1
         ORDER BY (p.name ILIKE $1) DESC, p.name ASC
         LIMIT $2 OFFSET $3`,
        [like, limit, (page - 1) * limit],
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM products p
         WHERE p.is_active = TRUE AND p.name ILIKE $1`,
        [like],
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
};

export const categoryRepo = {
  async list(db: pg.Pool | pg.PoolClient, includeInactive = false) {
    const where = includeInactive ? '' : 'WHERE c.is_active = TRUE';
    const { rows } = await db.query<CategoryRow & { subcategories: unknown }>(
      `SELECT c.*,
              COALESCE(
                json_agg(
                  json_build_object('id', s.id, 'name', s.name, 'sortOrder', s.sort_order)
                  ORDER BY s.sort_order, s.name
                ) FILTER (WHERE s.id IS NOT NULL),
                '[]'
              ) AS subcategories
       FROM categories c
       LEFT JOIN subcategories s ON s.category_id = c.id AND s.is_active = TRUE
       ${where}
       GROUP BY c.id
       ORDER BY c.sort_order, c.name`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      imageUrl: row.image_url,
      sortOrder: row.sort_order,
      isActive: row.is_active,
      subcategories: row.subcategories as { id: string; name: string; sortOrder: number }[],
    }));
  },

  async create(
    db: pg.Pool | pg.PoolClient,
    input: { name: string; imageUrl?: string | null; sortOrder?: number },
  ): Promise<CategoryRow> {
    const { rows } = await db.query<CategoryRow>(
      `INSERT INTO categories (name, image_url, sort_order)
       VALUES ($1, $2, $3) RETURNING *`,
      [input.name, input.imageUrl ?? null, input.sortOrder ?? 0],
    );
    return rows[0]!;
  },

  async update(
    db: pg.Pool | pg.PoolClient,
    id: string,
    input: { name?: string; imageUrl?: string | null; sortOrder?: number; isActive?: boolean },
  ): Promise<CategoryRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [id];
    if (input.name !== undefined) {
      values.push(input.name);
      sets.push(`name = $${values.length}`);
    }
    if (input.imageUrl !== undefined) {
      values.push(input.imageUrl);
      sets.push(`image_url = $${values.length}`);
    }
    if (input.sortOrder !== undefined) {
      values.push(input.sortOrder);
      sets.push(`sort_order = $${values.length}`);
    }
    if (input.isActive !== undefined) {
      values.push(input.isActive);
      sets.push(`is_active = $${values.length}`);
    }
    if (sets.length === 0) {
      const { rows } = await db.query<CategoryRow>('SELECT * FROM categories WHERE id = $1', [id]);
      return rows[0] ?? null;
    }
    const { rows } = await db.query<CategoryRow>(
      `UPDATE categories SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  },

  /**
   * عدد ما يعتمد على القسم.
   *
   * الحذف لا يجوز أن يجرّ معه منتجات: المنتج المحذوف يختفي من طلبات سابقة
   * ومن سلات العملاء، وهي بيانات تجارية لا تُستعاد. نعدّ أولاً ثم نرفض.
   */
  async countDependents(db: pg.Pool | pg.PoolClient, id: string) {
    const { rows } = await db.query<{ products: string; subcategories: string }>(
      `SELECT (SELECT COUNT(*)::text FROM products WHERE category_id = $1)      AS products,
              (SELECT COUNT(*)::text FROM subcategories WHERE category_id = $1) AS subcategories`,
      [id],
    );
    return {
      products: Number(rows[0]?.products ?? 0),
      subcategories: Number(rows[0]?.subcategories ?? 0),
    };
  },

  async delete(db: pg.Pool | pg.PoolClient, id: string): Promise<boolean> {
    const { rowCount } = await db.query('DELETE FROM categories WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },
};

export const subcategoryRepo = {
  async create(
    db: pg.Pool | pg.PoolClient,
    input: { categoryId: string; name: string; sortOrder?: number },
  ) {
    const { rows } = await db.query<{ id: string; name: string }>(
      `INSERT INTO subcategories (category_id, name, sort_order)
       VALUES ($1, $2, $3) RETURNING id, name`,
      [input.categoryId, input.name, input.sortOrder ?? 0],
    );
    return rows[0]!;
  },

  async findById(db: pg.Pool | pg.PoolClient, id: string) {
    const { rows } = await db.query<{
      id: string;
      category_id: string;
      name: string;
      sort_order: number;
      is_active: boolean;
    }>('SELECT * FROM subcategories WHERE id = $1', [id]);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      categoryId: row.category_id,
      name: row.name,
      sortOrder: row.sort_order,
      isActive: row.is_active,
    };
  },

  async update(
    db: pg.Pool | pg.PoolClient,
    id: string,
    input: { name?: string; sortOrder?: number; isActive?: boolean },
  ) {
    const sets: string[] = [];
    const values: unknown[] = [id];
    if (input.name !== undefined) {
      values.push(input.name);
      sets.push(`name = $${values.length}`);
    }
    if (input.sortOrder !== undefined) {
      values.push(input.sortOrder);
      sets.push(`sort_order = $${values.length}`);
    }
    if (input.isActive !== undefined) {
      values.push(input.isActive);
      sets.push(`is_active = $${values.length}`);
    }
    if (sets.length === 0) return this.findById(db, id);
    const { rowCount } = await db.query(
      `UPDATE subcategories SET ${sets.join(', ')} WHERE id = $1`,
      values,
    );
    return (rowCount ?? 0) > 0 ? this.findById(db, id) : null;
  },

  /** المنتجات المرتبطة — تمنع الحذف بدل أن تُحذف معه. */
  async countDependents(db: pg.Pool | pg.PoolClient, id: string) {
    const { rows } = await db.query<{ products: string }>(
      'SELECT COUNT(*)::text AS products FROM products WHERE subcategory_id = $1',
      [id],
    );
    return { products: Number(rows[0]?.products ?? 0) };
  },

  async delete(db: pg.Pool | pg.PoolClient, id: string): Promise<boolean> {
    const { rowCount } = await db.query('DELETE FROM subcategories WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },
};