import type pg from 'pg';
import type { BannerRow, GovernorateRow } from '../types/index.js';
import { textOrNull } from '../utils/locale.js';

/**
 * التمثيل المعتمد للبنر — **مصدر الحقيقة الوحيد** لشكل استجابة البنر.
 *
 * [CRITICAL] كل مسار يعيد بنراً يمرّ من هنا: القائمة والإنشاء والتعديل.
 *
 * كان `create`/`update` يعيدان صفَّ القاعدة الخام (`image_url`،
 * `destination_type`، `is_active`) بينما تعيد القائمة camelCase. أي مستهلك
 * يثق بجواب الإنشاء — لوحة تحكم تعرض النتيجة مباشرةً بدل إعادة الجلب —
 * يقرأ `undefined` في كل حقل، بلا خطأ يكشف السبب. نفس صنف العطل الذي
 * أصاب المنتجات (§20)، على جدول آخر.
 */
export function toBannerDto(row: BannerRow) {
  return {
    id: row.id,
    imageUrl: row.image_url,
    /**
     * الزوج القديم — لعميلٍ لا يعرف الحقول الصريحة أدناه. هنا هو العمودان
     * العربيان كما هما (لوحة التحكم عربية)؛ وفي الكتالوج يحسمه
     * `localizeBanner` بلغة الطلب.
     */
    title: row.title,
    subtitle: row.subtitle ?? '',
    /**
     * [CRITICAL] نصّ البنر بلغتيه صريحاً (067) — `null` = لا نصّ بهذه اللغة.
     * لوحة التحكم تملأ منها حقول كل لغة، والتطبيق يختار منها بلغة واجهته
     * **الآن**، فتبديل اللغة يبدّل النصّ بلا جلبٍ ثانٍ.
     */
    titleAr: textOrNull(row.title),
    subtitleAr: textOrNull(row.subtitle),
    titleCkb: textOrNull(row.title_ckb),
    subtitleCkb: textOrNull(row.subtitle_ckb),
    /** أين يظهر في الرئيسية: `hero` اللوحة الكبيرة، `promo` الشريط تحتها. */
    placement: row.placement ?? 'promo',
    destinationType: row.destination_type,
    destinationValue: row.destination_value,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

export type BannerDto = ReturnType<typeof toBannerDto>;

export const bannerRepo = {
  async listActive(db: pg.Pool | pg.PoolClient, placement?: 'hero' | 'promo') {
    const { rows } = await db.query<BannerRow>(
      `SELECT * FROM banners
        WHERE is_active = TRUE ${placement ? 'AND placement = $1' : ''}
        ORDER BY sort_order, created_at DESC`,
      placement ? [placement] : [],
    );
    return rows.map(toBannerDto);
  },

  async listAll(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<BannerRow>(
      'SELECT * FROM banners ORDER BY sort_order, created_at DESC',
    );
    return rows.map(toBannerDto);
  },

  async create(
    db: pg.Pool | pg.PoolClient,
    input: {
      imageUrl: string;
      /** نصّ البنر بلغتيه — كلٌّ اختياري، والغياب/`null` = لا نصّ بتلك اللغة. */
      titleAr?: string | null;
      subtitleAr?: string | null;
      titleCkb?: string | null;
      subtitleCkb?: string | null;
      placement?: BannerRow['placement'];
      destinationType: BannerRow['destination_type'];
      destinationValue?: string | null;
      sortOrder?: number;
    },
  ) {
    const { rows } = await db.query<BannerRow>(
      `INSERT INTO banners
         (image_url, title, subtitle, title_ckb, subtitle_ckb,
          placement, destination_type, destination_value, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        input.imageUrl,
        input.titleAr ?? null,
        // العمود العربي `NOT NULL DEFAULT ''` منذ 030: الفراغ فيه = «لا سطر».
        input.subtitleAr ?? '',
        input.titleCkb ?? null,
        input.subtitleCkb ?? null,
        input.placement ?? 'promo',
        input.destinationType,
        input.destinationValue ?? null,
        input.sortOrder ?? 0,
      ],
    );
    return toBannerDto(rows[0]!);
  },

  async update(
    db: pg.Pool | pg.PoolClient,
    id: string,
    input: {
      imageUrl?: string;
      titleAr?: string | null;
      subtitleAr?: string | null;
      titleCkb?: string | null;
      subtitleCkb?: string | null;
      placement?: BannerRow['placement'];
      destinationType?: BannerRow['destination_type'];
      destinationValue?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ): Promise<BannerDto | null> {
    const sets: string[] = [];
    const values: unknown[] = [id];
    if (input.imageUrl !== undefined) {
      values.push(input.imageUrl);
      sets.push(`image_url = $${values.length}`);
    }
    // [CRITICAL] كل لغةٍ في عمودها وحده: الحقل الغائب لا يُمسّ، فحفظُ العربية
    // لا يلمس الكردية ولا العكس. `null` صريحة تمسح نصّ تلك اللغة وحدها.
    if (input.titleAr !== undefined) {
      values.push(input.titleAr);
      sets.push(`title = $${values.length}`);
    }
    if (input.subtitleAr !== undefined) {
      values.push(input.subtitleAr ?? '');
      sets.push(`subtitle = $${values.length}`);
    }
    if (input.titleCkb !== undefined) {
      values.push(input.titleCkb);
      sets.push(`title_ckb = $${values.length}`);
    }
    if (input.subtitleCkb !== undefined) {
      values.push(input.subtitleCkb);
      sets.push(`subtitle_ckb = $${values.length}`);
    }
    if (input.placement !== undefined) {
      values.push(input.placement);
      sets.push(`placement = $${values.length}`);
    }
    if (input.destinationType !== undefined) {
      values.push(input.destinationType);
      sets.push(`destination_type = $${values.length}`);
    }
    if (input.destinationValue !== undefined) {
      values.push(input.destinationValue);
      sets.push(`destination_value = $${values.length}`);
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
      const { rows } = await db.query<BannerRow>('SELECT * FROM banners WHERE id = $1', [id]);
      return rows[0] ? toBannerDto(rows[0]) : null;
    }
    const { rows } = await db.query<BannerRow>(
      `UPDATE banners SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    return rows[0] ? toBannerDto(rows[0]) : null;
  },

  async delete(db: pg.Pool | pg.PoolClient, id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM banners WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },
};

export const governorateRepo = {
  async listActive(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<GovernorateRow>(
      `SELECT * FROM governorates WHERE is_active = TRUE ORDER BY sort_order, name`,
    );
    // `nameCkb` يخرج من هنا وتحسمه الخدمة (`localizeNamed`) — كان مفقوداً
    // فلم تجد الخدمة ما تختاره وبقيت المحافظات عربيةً في الواجهة الكردية.
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      nameCkb: row.name_ckb,
      deliveryFee: Number(row.delivery_fee),
      isActive: row.is_active,
    }));
  },

  /** كل المحافظات للأدمن — النشطة والمعطَّلة، الإدارة تحتاج رؤيتهما معاً. */
  async listAll(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<GovernorateRow>(
      `SELECT * FROM governorates ORDER BY is_active DESC, sort_order, name`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      deliveryFee: Number(row.delivery_fee),
      isActive: row.is_active,
    }));
  },

  async create(db: pg.Pool | pg.PoolClient, input: { name: string; deliveryFee: number }) {
    const { rows } = await db.query<GovernorateRow>(
      'INSERT INTO governorates (name, delivery_fee) VALUES ($1, $2) RETURNING *',
      [input.name, input.deliveryFee],
    );
    return rows[0]!;
  },

  async update(
    db: pg.Pool | pg.PoolClient,
    id: string,
    input: { name?: string; deliveryFee?: number; isActive?: boolean },
  ): Promise<GovernorateRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [id];
    if (input.name !== undefined) {
      values.push(input.name);
      sets.push(`name = $${values.length}`);
    }
    if (input.deliveryFee !== undefined) {
      values.push(input.deliveryFee);
      sets.push(`delivery_fee = $${values.length}`);
    }
    if (input.isActive !== undefined) {
      values.push(input.isActive);
      sets.push(`is_active = $${values.length}`);
    }
    if (sets.length === 0) {
      const { rows } = await db.query<GovernorateRow>('SELECT * FROM governorates WHERE id = $1', [id]);
      return rows[0] ?? null;
    }
    const { rows } = await db.query<GovernorateRow>(
      `UPDATE governorates SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  },

  /**
   * ما يعتمد على المحافظة.
   *
   * الطلبات تُحتسب أولاً: الطلب سجلٌّ تاريخي وحذف محافظته يمزّق سجلّاً
   * محاسبياً مُغلقاً. مناطق التوصيل تُحتسب أيضاً لأنها تنتمي للمحافظة.
   */
  async countDependents(db: pg.Pool | pg.PoolClient, id: string) {
    const { rows } = await db.query<{ orders: string; zones: string }>(
      `SELECT (SELECT COUNT(*)::text FROM orders WHERE governorate_id = $1)        AS orders,
              (SELECT COUNT(*)::text FROM governorate_zones WHERE governorate_id = $1) AS zones`,
      [id],
    );
    return {
      orders: Number(rows[0]?.orders ?? 0),
      zones: Number(rows[0]?.zones ?? 0),
    };
  },

  async delete(db: pg.Pool | pg.PoolClient, id: string): Promise<boolean> {
    const { rowCount } = await db.query('DELETE FROM governorates WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },
};