import type pg from 'pg';
import type {
  CategoryRow,
  Paginated,
  ProductRow,
  ProductSort,
} from '../types/index.js';
import { kurdishOrNull, type AppLocale } from '../utils/locale.js';

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
  const nameCkb = kurdishOrNull(row.name_ckb);
  const descriptionCkb = kurdishOrNull(row.description_ckb);
  return {
    id: row.id,
    // [I18N] محتوى المنتج بأربعة حقولٍ صريحة (066) — مصدرها هنا وحده.
    // `name`/`description` عربيان هنا؛ طبقة الخدمة (`localizeProduct`) تحسمهما
    // بلغة الزبون وتُبقي الأربعة. لوحة التحكم تقرأ الأربعة كما هي.
    name: row.name,
    description: row.description,
    nameAr: row.name,
    descriptionAr: row.description,
    /** `null` = ناقص (منتج قديم) — لا يُختلق ولا يُملأ بالعربية. */
    nameCkb,
    descriptionCkb,
    /**
     * هل ينقص المنتجَ اسمٌ أو وصفٌ كردي؟ حكمٌ واحد على الخادم: شارة «الكردية
     * ناقصة» في اللوحة، وملاحظة التطبيق حين يعرض العربية مكان الكردية.
     */
    kurdishMissing: nameCkb === null || descriptionCkb === null,
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
    // موعد التوفر القادم (إن حدّده المسؤول) — عرض إرشادي على صفحة المنتج.
    restockAt: row.restock_at ? new Date(row.restock_at).toISOString() : null,
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

/**
 * مستند البحث لكل لغة (066) — جملٌ ثابتة من خريطةٍ مغلقة، لا نصٌّ من العميل.
 *
 * التعبير حرفياً هو تعبير الفهرس (`idx_products_search_{ar,ckb}_trgm`)؛ أي
 * اختلافٍ فيه — ترتيب الوسائط، عمودٌ آخر — يُسقط الفهرس فيُمسح الكتالوج.
 */
const SEARCH_DOCUMENT: Record<AppLocale, (alias: string) => string> = {
  ar: (a) => `product_search_text_ar(${a}.name, ${a}.description)`,
  ckb: (a) =>
    `product_search_text_ckb(${a}.name, ${a}.description, ${a}.name_ckb, ${a}.description_ckb)`,
};

/**
 * الاسم كما تعرضه الواجهة بلغةٍ ما — للمنتج والقسم والقسم الفرعي معاً (لكلٍّ
 * منها `name` عربي و`name_ckb`). الكردي الناقص يسقط إلى العربي، بقاعدة
 * `pickLocalized` نفسها (الفراغ غيابٌ).
 */
const DISPLAYED_NAME: Record<AppLocale, (alias: string) => string> = {
  ar: (a) => `${a}.name`,
  ckb: (a) => `COALESCE(NULLIF(btrim(${a}.name_ckb), ''), ${a}.name)`,
};

/**
 * يهرّب محارف أنماط `LIKE` حتى يُبحث عنها حرفياً.
 *
 * [CRITICAL] بلا هذا كان `%` في الاستعلام يُعيد الكتالوج كله، و`_` يطابق أي
 * حرف — من مسارٍ عام بلا مصادقة. الهروب بـ`\\` مع `ESCAPE '\\'` في الجملة.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export const productRepo = {
  async findById(db: pg.Pool | pg.PoolClient, id: string) {
    const { rows } = await db.query<ProductRow & { images?: unknown; franchise_ids?: unknown }>(
      `${SELECT_WITH_IMAGES('p')} WHERE p.id = $1`,
      [id],
    );
    return rows[0] ? mapProduct(rows[0]) : null;
  },

  /**
   * عدّة منتجات بمعرّفاتها في جملة واحدة — للطلب الذي يحتاجها كلها معاً.
   *
   * كانت معاملة الطلب تقرأ منتج كل سطرٍ في العربة بجملةٍ مستقلة (N+1 تحت
   * قفل العربة). المعرّف المكرَّر أو الغائب لا يظهر في الخريطة.
   */
  async findByIds(db: pg.Pool | pg.PoolClient, ids: string[]) {
    const products = new Map<string, ReturnType<typeof mapProduct>>();
    if (ids.length === 0) return products;
    const { rows } = await db.query<ProductRow & { images?: unknown; franchise_ids?: unknown }>(
      `${SELECT_WITH_IMAGES('p')} WHERE p.id = ANY($1::uuid[])`,
      [ids],
    );
    for (const row of rows) products.set(row.id, mapProduct(row));
    return products;
  },

  async list(
    db: pg.Pool | pg.PoolClient,
    options: {
      page: number;
      limit: number;
      /** بحث بجزء من الاسم (حرفي — `%` و`_` مهرَّبان). */
      query?: string;
      categoryId?: string;
      subcategoryId?: string;
      isOffer?: boolean;
      isSelected?: boolean;
      includeInactive?: boolean;
      /**
       * منتجاتٌ ينقصها اسمٌ أو وصفٌ كردي — للوحة التحكم («أكمل الكردية»).
       * الشرط هو شرط الفهرس الجزئي `idx_products_missing_ckb` حرفياً (066).
       */
      missingKurdish?: boolean;
      sort?: ProductSort;
    },
  ): Promise<Paginated<ReturnType<typeof mapProduct>>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (!options.includeInactive) conditions.push('p.is_active = TRUE');
    if (options.query && options.query.trim() !== '') {
      values.push(`%${escapeLike(options.query.trim())}%`);
      // بحث اللوحة: المسؤول يعرف المنتج باسمه العربي أو الكردي — الاثنان
      // اسمان للمنتج نفسه عنده، لا لغة واجهةٍ يُختار لها.
      conditions.push(
        `(p.name ILIKE $${values.length} ESCAPE '\\' OR p.name_ckb ILIKE $${values.length} ESCAPE '\\')`,
      );
    }
    if (options.missingKurdish === true) {
      conditions.push('(p.name_ckb IS NULL OR p.description_ckb IS NULL)');
    }
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
                (SELECT json_agg(json_build_object(
                          'id', po.id,
                          'name', po.name,
                          'nameCkb', po.name_ckb,
                          'values', po.values,
                          'valuesCkb', po.values_ckb))
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

  /**
   * بحث نصي جزئي **بلغة الواجهة** — البحث في PostgreSQL لا في التطبيق.
   *
   * يطابق اسم المنتج أو **وصفه** بلغة الطلب، أو اسم قسمه أو قسمه الفرعي بها،
   * أو اسم الأنمي المرتبط به ومرادفاته. الأنمي بُعد تصنيف مستقل عن الأقسام،
   * فبحثٌ عن «قاتل الشياطين» يجب أن يجمع منتجاته من كل الأقسام لا أن يعود
   * فارغاً لأن الكلمة ليست في اسم أي منتج. أسماء الأنمي أعلامٌ بلا نسخة
   * كردية (046)، فتُطابَق في اللغتين.
   *
   * [CRITICAL] اللغة (066): `ar` ← الاسم والوصف العربيان؛ `ckb` ← الكرديان.
   * كان 064 يجمع العربي والكردي في مستندٍ واحد، فكلمةٌ عربية في واجهةٍ كردية
   * تُظهر منتجاً باسمٍ كردي لا يحويها. الحقل الكردي **الناقص** (منتج قديم)
   * يحلّ محلّه عربيُّه في مستند الكردية — لأنه ما تعرضه الواجهة الكردية له،
   * فلا يكون منتجٌ ظاهرٌ في قسمه مستحيلَ الإيجاد بالبحث.
   *
   * [CRITICAL] المقارنة على **مفتاح بحث مطويّ** (`search_fold`، 064) لا على
   * النصّ الخام: `ی`/`ي`، `ک`/`ك`، `ە`/`ه`، ZWNJ والتشكيل… صورٌ متكافئة تلتقي
   * في الطرفين بالدالة نفسها. لا قائمة كلمات — ما هو مخزَّن هو ما يُبحث فيه.
   *
   * الامتيازات والأقسام الموقوفة لا تُطابَق: إخفاؤها من الواجهة يعني
   * إخفاءها من البحث أيضاً، وإلا صار البحث باباً خلفياً لما أُخفي عمداً.
   */
  async search(
    db: pg.Pool | pg.PoolClient,
    query: string,
    page: number,
    limit: number,
    locale: AppLocale,
  ): Promise<Paginated<ReturnType<typeof mapProduct>>> {
    // النمط يُبنى في القاعدة (`search_like_pattern`): يُطوى نصّ الزبون بالدالة
    // نفسها التي طُوي بها المخزَّن، ثم تُهرَّب `%`/`_`/`\` — حرفياً لا أنماطاً،
    // والهروب مُعلَن بـ`ESCAPE '\'` لا موروثاً من إعداد الخادم.
    const pattern = `search_like_pattern($1)`;
    const document = SEARCH_DOCUMENT[locale];
    const displayedName = DISPLAYED_NAME[locale];
    // [PERF] المعرّفات المطابِقة تُجمع أولاً في مصفوفةٍ واحدة (`UNION` لكل
    // مصدر) ثم يُقارَن بها المعرّف بفهرس المفتاح — لا `EXISTS` مرتبطاً بكل صف
    // ولا `OR` بين مصادر مختلفة. الشرط المرتبط داخل `OR` كان يمنع فهرس
    // trigram فيُمسح الكتالوج كله في كل بحث (ومع تقديرٍ مبالغ يعبر عتبة JIT
    // فيُترجَم كل بحث من جديد)؛ و`OR category_id = ANY(…)` يفعل الشيء نفسه لأن
    // الأقسام قليلة فيُقدَّر أنها تطابق معظم الكتالوج. هنا يُخطَّط كل فرعٍ بفهرسه:
    // مستند اللغة (`idx_products_search_ar_trgm` / `idx_products_search_ckb_trgm`)،
    // وفهرسا القسم والقسم الفرعي الجزئيّان (`is_active` في الفرع شرطُ
    // استعمالهما)، ثم `products_pkey`. و`UNION` يجعل المنتج الذي يطابق اسمُه
    // ووصفُه وقسمُه معاً نتيجةً واحدة لا ثلاثاً.
    const nameMatches = `search_fold(${displayedName('p')}) LIKE ${pattern} ESCAPE '\\'`;
    const matches = `p.is_active = TRUE AND p.id = ANY (ARRAY(
           SELECT pn.id FROM products pn
            WHERE pn.is_active = TRUE
              AND ${document('pn')} LIKE ${pattern} ESCAPE '\\'
           UNION
           SELECT pf.product_id
             FROM product_franchises pf
             JOIN franchises f
               ON f.id = pf.franchise_id AND f.is_active = TRUE
            WHERE search_fold(franchise_search_text(f.name, f.alt_names)) LIKE ${pattern} ESCAPE '\\'
           UNION
           SELECT pc.id
             FROM categories c
             JOIN products pc ON pc.category_id = c.id AND pc.is_active = TRUE
            WHERE c.is_active = TRUE
              AND search_fold(${displayedName('c')}) LIKE ${pattern} ESCAPE '\\'
           UNION
           SELECT ps.id
             FROM subcategories s
             JOIN products ps ON ps.subcategory_id = s.id AND ps.is_active = TRUE
            WHERE s.is_active = TRUE
              AND search_fold(${displayedName('s')}) LIKE ${pattern} ESCAPE '\\'
         ))`;
    const [{ rows }, countRows] = await Promise.all([
      db.query<ProductRow & { images?: unknown; franchise_ids?: unknown }>(
        `${SELECT_WITH_IMAGES('p')}
         WHERE ${matches}
         ORDER BY (${nameMatches}) DESC, ${displayedName('p')} ASC, p.id
         LIMIT $2 OFFSET $3`,
        [query, limit, (page - 1) * limit],
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM products p
         WHERE ${matches}`,
        [query],
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
                  json_build_object(
                    'id', s.id,
                    'name', s.name,
                    'nameCkb', s.name_ckb,
                    'sortOrder', s.sort_order,
                    'isActive', s.is_active
                  )
                  ORDER BY s.sort_order, s.name
                ) FILTER (WHERE s.id IS NOT NULL ${includeInactive ? '' : 'AND s.is_active = TRUE'}),
                '[]'
              ) AS subcategories
       FROM categories c
       LEFT JOIN subcategories s ON s.category_id = c.id
       ${where}
       GROUP BY c.id
       ORDER BY c.sort_order, c.name`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      nameCkb: (row as { name_ckb?: string | null }).name_ckb ?? null,
      imageUrl: row.image_url,
      sortOrder: row.sort_order,
      isActive: row.is_active,
      subcategories: row.subcategories as {
        id: string;
        name: string;
        nameCkb: string | null;
        sortOrder: number;
        isActive: boolean;
      }[],
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