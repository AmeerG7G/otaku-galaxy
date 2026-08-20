import type pg from 'pg';
import type { CategoryRow, Paginated, ProductRow } from '../types/index.js';

function toNumber(v: string | number | null | undefined): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function mapProduct(row: ProductRow & { images?: unknown }) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    stock: row.stock,
    images: (row.images as string[]) ?? [],
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    isActive: row.is_active,
    isOffer: row.is_offer,
    isSelected: row.is_selected,
    rating: toNumber(row.rating),
    reviewCount: row.review_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** جليب منتجات مع صورها (شكل واحد لجميع قوائم الكتالوج). */
const SELECT_WITH_IMAGES = (prefix: string) => `
  SELECT ${prefix}.*,
         COALESCE(
           (SELECT json_agg(pi.url ORDER BY pi.sort_order)
            FROM product_images pi WHERE pi.product_id = ${prefix}.id),
           '[]'::json
         ) AS images
  FROM products ${prefix}`;

export const productRepo = {
  async findById(db: pg.Pool | pg.PoolClient, id: string) {
    const { rows } = await db.query<ProductRow & { images?: unknown }>(
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
    const orderBy = options.isOffer
      ? 'p.offer_rank NULLS LAST, p.created_at DESC'
      : options.isSelected
        ? 'p.selected_rank NULLS LAST, p.created_at DESC'
        : 'p.created_at DESC';

    const [{ rows }, countRows] = await Promise.all([
      db.query<ProductRow & { images?: unknown }>(
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

  /** بحث نصي جزئي (ILIKE مع دعم العربية) — البحث في PostgreSQL لا في التطبيق. */
  async search(
    db: pg.Pool | pg.PoolClient,
    query: string,
    page: number,
    limit: number,
  ): Promise<Paginated<ReturnType<typeof mapProduct>>> {
    const like = `%${query}%`;
    const [{ rows }, countRows] = await Promise.all([
      db.query<ProductRow & { images?: unknown }>(
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
};