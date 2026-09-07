import type pg from 'pg';

export const ROTATION_MODES = ['fixed', 'daily'] as const;
export type RotationMode = (typeof ROTATION_MODES)[number];

export interface VisualSlotImageDto {
  id: string;
  url: string;
  mediaId: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface VisualSlotDto {
  id: string;
  slotKey: string;
  label: string;
  /** أين يظهر هذا الرسم، بلغة صاحب المتجر لا باسم ملف. */
  location: string;
  /** منطقة التطبيق — تُجمَّع بها الفتحات في اللوحة. */
  groupKey: string;
  sortOrder: number;
  isActive: boolean;
  rotationMode: RotationMode;
  images: VisualSlotImageDto[];
}

interface SlotRow {
  id: string;
  slot_key: string;
  label: string;
  location: string;
  group_key: string;
  sort_order: number;
  is_active: boolean;
  rotation_mode: RotationMode;
  images: unknown;
}

function shapeSlot(row: SlotRow): VisualSlotDto {
  const images = (row.images as VisualSlotImageDto[] | null) ?? [];
  return {
    id: row.id,
    slotKey: row.slot_key,
    label: row.label,
    location: row.location ?? '',
    groupKey: row.group_key ?? 'other',
    sortOrder: row.sort_order ?? 0,
    isActive: row.is_active,
    rotationMode: row.rotation_mode,
    images,
  };
}

/**
 * الصور مرتَّبة داخل الاستعلام نفسه.
 *
 * الترتيب جزء من العقد لا تفصيلاً: التدوير اليومي يختار بالفهرس، فترتيبٌ
 * غير محدَّد يعني شخصيةً تتبدّل بين طلبين في اليوم نفسه. `sort_order` ثم
 * `created_at` يجعلان الترتيب كلّيّاً حتى لو تساوى الأول.
 */
const SELECT_WITH_IMAGES = `
  SELECT s.*,
         COALESCE(
           (SELECT json_agg(
                     json_build_object(
                       'id', i.id,
                       'url', i.url,
                       'mediaId', i.media_id,
                       'isActive', i.is_active,
                       'sortOrder', i.sort_order
                     )
                     ORDER BY i.sort_order, i.created_at
                   )
              FROM visual_slot_images i
             WHERE i.slot_id = s.id),
           '[]'::json
         ) AS images
    FROM visual_slots s`;

export const visualsRepo = {
  /** كل الفتحات بصورها — لوحة التحكم. */
  async listAll(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<SlotRow>(
      `${SELECT_WITH_IMAGES} ORDER BY s.group_key, s.sort_order, s.slot_key`,
    );
    return rows.map(shapeSlot);
  },

  /**
   * الفتحات النشطة التي لها صورة نشطة واحدة على الأقل — واجهة العميل.
   *
   * الفتحة الفارغة لا تُرسَل إطلاقاً: إرسالها بقائمة فارغة يجعل التطبيق
   * يميّز بين «غير مضبوطة» و«مضبوطة بلا صور»، وكلتاهما تعنيان الشيء نفسه
   * عنده — اعرض الأصل المضمَّن.
   */
  async listPublished(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<SlotRow>(
      `SELECT s.*,
              (SELECT json_agg(
                        json_build_object('id', i.id, 'url', i.url,
                                          'mediaId', i.media_id,
                                          'isActive', i.is_active,
                                          'sortOrder', i.sort_order)
                        ORDER BY i.sort_order, i.created_at
                      )
                 FROM visual_slot_images i
                WHERE i.slot_id = s.id AND i.is_active = TRUE) AS images
         FROM visual_slots s
        WHERE s.is_active = TRUE
          AND EXISTS (SELECT 1 FROM visual_slot_images i
                       WHERE i.slot_id = s.id AND i.is_active = TRUE)
        ORDER BY s.slot_key`,
    );
    return rows.map(shapeSlot);
  },

  async findByKey(db: pg.Pool | pg.PoolClient, slotKey: string) {
    const { rows } = await db.query<SlotRow>(
      `${SELECT_WITH_IMAGES} WHERE s.slot_key = $1`,
      [slotKey],
    );
    return rows[0] ? shapeSlot(rows[0]) : null;
  },

  async findById(db: pg.Pool | pg.PoolClient, id: string) {
    const { rows } = await db.query<SlotRow>(`${SELECT_WITH_IMAGES} WHERE s.id = $1`, [id]);
    return rows[0] ? shapeSlot(rows[0]) : null;
  },

  async create(
    db: pg.Pool | pg.PoolClient,
    input: {
      slotKey: string;
      label?: string;
      location?: string;
      groupKey?: string;
      rotationMode?: RotationMode;
    },
  ) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO visual_slots (slot_key, label, location, group_key, rotation_mode)
       VALUES ($1, $2, $3, COALESCE($4, 'other'), COALESCE($5, 'fixed'))
       RETURNING id`,
      [
        input.slotKey,
        input.label ?? '',
        input.location ?? '',
        input.groupKey ?? null,
        input.rotationMode ?? null,
      ],
    );
    return (await this.findById(db, rows[0]!.id))!;
  },

  async update(
    db: pg.Pool | pg.PoolClient,
    id: string,
    input: {
      label?: string;
      location?: string;
      groupKey?: string;
      isActive?: boolean;
      rotationMode?: RotationMode;
    },
  ) {
    const sets: string[] = [];
    const values: unknown[] = [id];
    const push = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (input.label !== undefined) push('label', input.label);
    if (input.location !== undefined) push('location', input.location);
    if (input.groupKey !== undefined) push('group_key', input.groupKey);
    if (input.isActive !== undefined) push('is_active', input.isActive);
    if (input.rotationMode !== undefined) push('rotation_mode', input.rotationMode);
    if (sets.length === 0) return this.findById(db, id);

    const { rowCount } = await db.query(
      `UPDATE visual_slots SET ${sets.join(', ')} WHERE id = $1`,
      values,
    );
    if ((rowCount ?? 0) === 0) return null;
    return this.findById(db, id);
  },

  async remove(db: pg.Pool | pg.PoolClient, id: string) {
    const { rowCount } = await db.query('DELETE FROM visual_slots WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },

  // ── صور الفتحة ──

  /**
   * إضافة صورة إلى نهاية القائمة.
   *
   * `sort_order` يُحسب في الجملة نفسها لا في التطبيق: قراءةُ الأقصى ثم
   * الكتابة في رحلتين تسمح لطلبين متزامنين بأخذ الرقم نفسه.
   */
  async addImage(
    db: pg.Pool | pg.PoolClient,
    input: {
      slotId: string;
      url: string;
      mediaId?: string | null;
      /**
       * `last` — تُضاف إلى آخر القائمة (بناء مجموعة تدوير).
       * `first` — تتصدّر القائمة، فتصير هي المعروضة فوراً في النمط الثابت.
       */
      position?: 'first' | 'last';
    },
  ) {
    // [CRITICAL] `sort_order` يُحسب في الجملة نفسها لا في التطبيق: قراءةُ
    // الحدّ ثم الكتابة في رحلتين تسمح لطلبين متزامنين بأخذ الرقم نفسه.
    const order =
      input.position === 'first'
        ? `COALESCE((SELECT MIN(sort_order) - 1 FROM visual_slot_images WHERE slot_id = $1), 0)`
        : `COALESCE((SELECT MAX(sort_order) + 1 FROM visual_slot_images WHERE slot_id = $1), 0)`;

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO visual_slot_images (slot_id, url, media_id, sort_order)
       VALUES ($1, $2, $3, ${order})
       RETURNING id`,
      [input.slotId, input.url, input.mediaId ?? null],
    );
    return rows[0]!.id;
  },

  /** يوقف كل صور الفتحة. يُستعمل في الاستبدال قبل إدراج البديلة. */
  async deactivateAllImages(db: pg.Pool | pg.PoolClient, slotId: string) {
    const { rowCount } = await db.query(
      'UPDATE visual_slot_images SET is_active = FALSE WHERE slot_id = $1 AND is_active = TRUE',
      [slotId],
    );
    return rowCount ?? 0;
  },

  /**
   * بصمة الإعداد المنشور.
   *
   * تتغيّر مع أي تعديل يمسّ ما يراه التطبيق: إضافة صورة، تعطيلها، إعادة
   * ترتيبها، تغيير نمط التدوير، تفعيل فتحة أو إيقافها. يقارنها التطبيق
   * بما لديه فيعرف أن هناك جديداً بلا تنزيل الصور من جديد.
   */
  async publishedVersion(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<{ version: string }>(
      `SELECT COALESCE(
                MD5(
                  COALESCE(MAX(GREATEST(s.updated_at, i.updated_at))::text, '') ||
                  COUNT(*)::text
                ),
                'empty'
              ) AS version
         FROM visual_slots s
         JOIN visual_slot_images i ON i.slot_id = s.id
        WHERE s.is_active = TRUE AND i.is_active = TRUE`,
    );
    return rows[0]?.version ?? 'empty';
  },

  async updateImage(
    db: pg.Pool | pg.PoolClient,
    imageId: string,
    input: { isActive?: boolean; sortOrder?: number },
  ) {
    const sets: string[] = [];
    const values: unknown[] = [imageId];
    if (input.isActive !== undefined) {
      values.push(input.isActive);
      sets.push(`is_active = $${values.length}`);
    }
    if (input.sortOrder !== undefined) {
      values.push(input.sortOrder);
      sets.push(`sort_order = $${values.length}`);
    }
    if (sets.length === 0) return true;
    const { rowCount } = await db.query(
      `UPDATE visual_slot_images SET ${sets.join(', ')} WHERE id = $1`,
      values,
    );
    return (rowCount ?? 0) > 0;
  },

  async removeImage(db: pg.Pool | pg.PoolClient, imageId: string) {
    const { rowCount } = await db.query('DELETE FROM visual_slot_images WHERE id = $1', [
      imageId,
    ]);
    return (rowCount ?? 0) > 0;
  },

  async imageBelongsToSlot(db: pg.Pool | pg.PoolClient, imageId: string, slotId: string) {
    const { rows } = await db.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM visual_slot_images WHERE id = $1 AND slot_id = $2) AS exists',
      [imageId, slotId],
    );
    return rows[0]?.exists ?? false;
  },

  /** ترتيب دفعة واحدة — يحفظ ترتيب السحب والإفلات في اللوحة. */
  async reorder(db: pg.Pool | pg.PoolClient, slotId: string, imageIds: string[]) {
    await db.query(
      `UPDATE visual_slot_images AS i
          SET sort_order = o.position
         FROM UNNEST($2::uuid[]) WITH ORDINALITY AS o(id, position)
        WHERE i.id = o.id AND i.slot_id = $1`,
      [slotId, imageIds],
    );
  },

  /** هل تشير أي فتحة إلى هذا الرابط؟ يحرس حذف الوسائط من مرجع معلّق. */
  async countReferences(db: pg.Pool | pg.PoolClient, url: string) {
    const { rows } = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM visual_slot_images WHERE url = $1',
      [url],
    );
    return Number(rows[0]?.total ?? 0);
  },
};
