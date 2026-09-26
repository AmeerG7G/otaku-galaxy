import type pg from 'pg';

/**
 * فتحة بصرية: موضعٌ واحد في التطبيق يحمل صورةً دائمة واحدة أو لا شيء،
 * وقد يحمل فوقها صورةً مؤقّتة واحدة إلى لحظةٍ محدّدة.
 *
 * [PRODUCT] قرار 2026-09-20 (الهجرتان ٠٥٤ و٠٥٥): لا تدوير ولا مجموعة صور
 * ولا إيقاف مؤقّت. `imageUrl` الصورة الدائمة و`null` تعني «الرسم المضمَّن
 * في التطبيق». `temporaryImageUrl` صورةٌ مؤقّتة **سارية** (تُخفى هنا متى
 * انتهت)، و`activeImageUrl` هي ما يراه الزبون الآن — تُحسب في القاعدة
 * بقاعدةٍ واحدة لا تُنسخ في اللوحة ولا في التطبيق.
 */
export interface VisualSlotDto {
  id: string;
  /** المفتاح الذي يعرفه كود التطبيق — لا يُترجم ولا يُعاد تسميته. */
  slotKey: string;
  label: string;
  /** أين يظهر هذا الرسم، بلغة صاحب المتجر لا باسم ملف. */
  location: string;
  /** منطقة التطبيق — تُجمَّع بها الفتحات في اللوحة. */
  groupKey: string;
  sortOrder: number;
  /** الصورة الدائمة: مرجع نسبي (`/uploads/...`) أو null حين لا صورة مضبوطة. */
  imageUrl: string | null;
  mediaId: string | null;
  /** الصورة المؤقّتة السارية، أو null إن لم توضع أو انتهت. */
  temporaryImageUrl: string | null;
  temporaryMediaId: string | null;
  /** لحظة انتهاء المؤقّتة (ISO 8601)، أو null. */
  temporaryUntil: string | null;
  /** ما يراه الزبون الآن: المؤقّتة السارية، وإلا الدائمة، وإلا null (المضمَّن). */
  activeImageUrl: string | null;
  /** مصدر الصورة الفعّالة — للعرض في اللوحة بلا إعادة حساب. */
  activeMode: 'temporary' | 'permanent' | 'bundled';
  updatedAt: string;
}

interface SlotRow {
  id: string;
  slot_key: string;
  label: string;
  location: string;
  group_key: string;
  sort_order: number;
  image_url: string | null;
  media_id: string | null;
  temporary_image_url: string | null;
  temporary_media_id: string | null;
  temporary_until: Date | null;
  active_image_url: string | null;
  updated_at: Date;
}

function shapeSlot(row: SlotRow): VisualSlotDto {
  const temporaryLive = row.temporary_image_url !== null;
  return {
    id: row.id,
    slotKey: row.slot_key,
    label: row.label,
    location: row.location ?? '',
    groupKey: row.group_key ?? 'other',
    sortOrder: row.sort_order ?? 0,
    imageUrl: row.image_url,
    mediaId: row.media_id,
    temporaryImageUrl: row.temporary_image_url,
    temporaryMediaId: row.temporary_media_id,
    temporaryUntil: row.temporary_until?.toISOString() ?? null,
    activeImageUrl: row.active_image_url,
    activeMode: temporaryLive ? 'temporary' : row.image_url !== null ? 'permanent' : 'bundled',
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * قاعدة الصورة الفعّالة — **المكان الوحيد** الذي تُكتب فيه.
 *
 * المؤقّتة سارية ما دامت لحظة انتهائها لم تحن بساعة القاعدة؛ بعدها تُعامل
 * كأنها غير موجودة فتعود الدائمة من تلقاء نفسها بلا كتابةٍ ولا مهمّة.
 * المقارنة بـ`now()` هنا لا في JS: ساعةٌ واحدة للحكم في كل الاستعلامات.
 */
const LIVE_TEMPORARY_URL = `CASE WHEN temporary_until > now() THEN temporary_image_url END`;
const LIVE_TEMPORARY_MEDIA = `CASE WHEN temporary_until > now() THEN temporary_media_id END`;
const LIVE_TEMPORARY_UNTIL = `CASE WHEN temporary_until > now() THEN temporary_until END`;
const ACTIVE_URL = `COALESCE(${LIVE_TEMPORARY_URL}, image_url)`;

const SELECT = `SELECT id, slot_key, label, location, group_key, sort_order,
                       image_url, media_id,
                       ${LIVE_TEMPORARY_URL}   AS temporary_image_url,
                       ${LIVE_TEMPORARY_MEDIA} AS temporary_media_id,
                       ${LIVE_TEMPORARY_UNTIL} AS temporary_until,
                       ${ACTIVE_URL}           AS active_image_url,
                       updated_at
                  FROM visual_slots`;

/**
 * الفتحات ذات الصورة الفعّالة — ما يُرسَل إلى التطبيق. الفتحة بلا صورة لا
 * تُرسَل إطلاقاً: غيابها هو إشارة «استعمل الأصل المضمَّن».
 */
const PUBLISHED = `SELECT slot_key, ${ACTIVE_URL} AS active_image_url
                     FROM visual_slots
                    WHERE ${ACTIVE_URL} IS NOT NULL`;

/**
 * بصمة المنشور — بصمةُ **محتوى**: ملخّص أزواج (المفتاح، الصورة الفعّالة)
 * مرتّبةً. المحتوى نفسه يعطي البصمة نفسها مهما تكرّرت الكتابة، فلا يعيد
 * التطبيق بناء رسومه إلا حين يتغيّر ما يراه الزبون فعلاً — وهي تتغيّر من
 * تلقاء نفسها لحظة انتهاء مؤقّتة، لأنها تُحسب على الفعّالة. تُقرأ من
 * `published` (الاسم في [visualsRepo.published]) بالترتيب نفسه الذي تُرسَل به الفتحات.
 */
const PUBLISHED_VERSION = `COALESCE(
  (SELECT MD5(string_agg(slot_key || '=' || active_image_url, E'\\n' ORDER BY slot_key))
     FROM published),
  'empty')`;

/** أقرب لحظةٍ يتغيّر فيها المنشور من تلقاء نفسه — انتهاء أقرب مؤقّتة سارية، أو null. */
const NEXT_CHANGE_AT = `(SELECT MIN(temporary_until) FROM visual_slots WHERE temporary_until > now())`;

interface PublishedRow {
  slots: Array<{ slotKey: string; activeImageUrl: string }>;
  version: string;
  now: Date;
  next_change_at: Date | null;
}

export const visualsRepo = {
  /** كل الفتحات — لوحة التحكم. */
  async listAll(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<SlotRow>(
      `${SELECT} ORDER BY group_key, sort_order, slot_key`,
    );
    return rows.map(shapeSlot);
  },

  /**
   * المنشور كاملاً — واجهة العميل — في **عبارةٍ واحدة**: الفتحات وصورها
   * الفعّالة، والبصمة، وساعة القاعدة، وأقرب انتهاء.
   *
   * [CRITICAL] عبارةٌ واحدة لا ثلاث: كانت الفتحات والبصمة والساعة تُقرأ
   * بثلاثة استعلامات مستقلة (`Promise.all`)، أي من ثلاث لقطاتٍ للقاعدة.
   * كتابةٌ تُلتزم بينها — مسؤولٌ ينهي مؤقّتةً، أو مؤقّتةٌ تنتهي بساعة
   * القاعدة — كانت تُخرج ردّاً لم يوجد قطّ: فتحاتٌ تحمل المؤقّتة وبصمةٌ
   * حُسبت على الدائمة و`nextChangeAt = null`، فلا يجدول التطبيق العودة.
   * العبارة الواحدة ترى لقطةً واحدة (`READ COMMITTED` يثبّت لقطة العبارة
   * عند بدئها)، و`now()` فيها قيمةٌ واحدة: هي نفسها التي حكمت على سريان
   * المؤقّتات وهي نفسها المُرسَلة. لا معاملة، لا قفل، ولا رحلةٌ إضافية.
   *
   * يحرسه `tests/visual-published-snapshot.test.ts`.
   */
  async published(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<PublishedRow>(
      `WITH published AS (${PUBLISHED})
       SELECT COALESCE(
                (SELECT json_agg(json_build_object('slotKey', slot_key, 'activeImageUrl', active_image_url)
                                 ORDER BY slot_key)
                   FROM published),
                '[]'::json)          AS slots,
              ${PUBLISHED_VERSION}   AS version,
              now()                  AS now,
              ${NEXT_CHANGE_AT}      AS next_change_at`,
    );
    const row = rows[0]!;
    return {
      slots: row.slots,
      version: row.version,
      now: row.now,
      nextChangeAt: row.next_change_at,
    };
  },

  async findById(db: pg.Pool | pg.PoolClient, id: string) {
    const { rows } = await db.query<SlotRow>(`${SELECT} WHERE id = $1`, [id]);
    return rows[0] ? shapeSlot(rows[0]) : null;
  },

  /** يضع الصورة الدائمة — كتابة واحدة ذرّية على عموديها وحدهما؛ الأخيرة تغلب. */
  async setImage(
    db: pg.Pool | pg.PoolClient,
    id: string,
    input: { url: string; mediaId: string | null },
  ) {
    const { rowCount } = await db.query(
      'UPDATE visual_slots SET image_url = $2, media_id = $3 WHERE id = $1',
      [id, input.url, input.mediaId],
    );
    return (rowCount ?? 0) > 0;
  },

  /** يزيل الصورة الدائمة — التطبيق يعود إلى الرسم المضمَّن. الملف على القرص يبقى. */
  async clearImage(db: pg.Pool | pg.PoolClient, id: string) {
    const { rowCount } = await db.query(
      'UPDATE visual_slots SET image_url = NULL, media_id = NULL WHERE id = $1',
      [id],
    );
    return (rowCount ?? 0) > 0;
  },

  /**
   * يضع الصورة المؤقّتة ولحظة انتهائها — كتابة واحدة ذرّية على أعمدتها
   * الثلاثة وحدها. [CRITICAL] لا تلمس `image_url`: الدائمة تبقى كما هي
   * وتعود بنفسها حين تنتهي المؤقّتة.
   *
   * [CRITICAL] الحكم على اللحظة — ماضٍ أو أبعد من `maxDays` — في العبارة
   * نفسها وبساعة القاعدة `now()`: هي الساعة التي تقيس سريان المؤقّتة
   * (`temporary_until > now()`)، فلا تُقبل لحظةٌ لن تُعرض قط ولا تُرفض لحظةٌ
   * سارية. كانت تُحكم بساعة Node — ساعةٌ ثانية تختلف عن الأولى بالإزاحة.
   * `now()` واحدة في العبارة كلّها: الحكمُ والكتابة على اللحظة نفسها.
   */
  async setTemporaryImage(
    db: pg.Pool | pg.PoolClient,
    id: string,
    input: { url: string; mediaId: string | null; until: Date; maxDays: number },
  ): Promise<'ok' | 'past' | 'too_far' | 'missing'> {
    const { rows } = await db.query<{ verdict: 'ok' | 'past' | 'too_far'; updated: boolean }>(
      `WITH verdict AS (
         SELECT CASE
                  WHEN $4::timestamptz <= now() THEN 'past'
                  WHEN $4::timestamptz > now() + make_interval(secs => $5::int * 86400) THEN 'too_far'
                  ELSE 'ok'
                END AS verdict
       ), updated AS (
         UPDATE visual_slots
            SET temporary_image_url = $2, temporary_media_id = $3, temporary_until = $4
          WHERE id = $1 AND (SELECT verdict FROM verdict) = 'ok'
          RETURNING id
       )
       SELECT (SELECT verdict FROM verdict) AS verdict,
              EXISTS (SELECT 1 FROM updated)  AS updated`,
      [id, input.url, input.mediaId, input.until, input.maxDays],
    );
    const row = rows[0]!;
    if (row.verdict !== 'ok') return row.verdict;
    return row.updated ? 'ok' : 'missing';
  },

  /** ينهي المؤقّتة الآن — الدائمة (أو المضمَّن) تظهر فوراً. الملف يبقى. */
  async clearTemporaryImage(db: pg.Pool | pg.PoolClient, id: string) {
    const { rowCount } = await db.query(
      `UPDATE visual_slots
          SET temporary_image_url = NULL, temporary_media_id = NULL, temporary_until = NULL
        WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  },
};
