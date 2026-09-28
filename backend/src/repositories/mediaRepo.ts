import type pg from 'pg';
import type { MediaPurpose } from '../types/index.js';

export interface MediaDto {
  id: string;
  url: string;
  storageKey: string;
  purpose: MediaPurpose;
  mimeType: string;
  sizeBytes: number;
}

export const mediaRepo = {
  async create(
    db: pg.Pool | pg.PoolClient,
    input: {
      storageKey: string;
      url: string;
      purpose: MediaPurpose;
      mimeType: string;
      sizeBytes: number;
      uploadedBy: string | null;
    },
  ): Promise<MediaDto> {
    const { rows } = await db.query<{
      id: string;
      url: string;
      storage_key: string;
      purpose: MediaPurpose;
      mime_type: string;
      size_bytes: number;
    }>(
      `INSERT INTO media_files (storage_key, url, purpose, mime_type, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, url, storage_key, purpose, mime_type, size_bytes`,
      [
        input.storageKey,
        input.url,
        input.purpose,
        input.mimeType,
        input.sizeBytes,
        input.uploadedBy,
      ],
    );
    const row = rows[0]!;
    return {
      id: row.id,
      url: row.url,
      storageKey: row.storage_key,
      purpose: row.purpose,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
    };
  },

  /**
   * مجموع بايتات ما رفعه مستخدم منذ لحظة — يخدمه
   * `idx_media_files_uploader (uploaded_by, created_at DESC)`.
   */
  async bytesUploadedSince(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    since: Date,
  ): Promise<number> {
    const { rows } = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(size_bytes), 0)::text AS total
         FROM media_files
        WHERE uploaded_by = $1 AND created_at >= $2`,
      [userId, since],
    );
    return Number(rows[0]!.total);
  },

  /**
   * الأعمدة التي قد تحمل مرجعاً إلى ملف مرفوع.
   *
   * [CRITICAL] هذه القائمة **اصطلاح لا قيد**: لا مفتاح أجنبي يربط أياً منها
   * بـ`media_files`. عمودٌ جديد يُضاف ولا يُدرَج
   * هنا يجعل ملفاته الحيّة تبدو يتيمة. يحرس ذلك اختبارُ التغطية في
   * `media.test.ts` الذي يقارن هذه القائمة بمخطّط القاعدة الفعلي — والقائمة
   * وحدها لا تكفي: استعلام [findUnreferenced] أدناه يجب أن يفحص كل عمودٍ
   * منها فعلاً.
   *
   * (كانت `visual_slots` هنا بأعمدتها الأربعة؛ أُسقط الجدول مع ميزة «رسوم
   * الشخصيات» في الهجرة 065 — الشخصيات أصولٌ ثابتة في التطبيق الآن.)
   */
  MEDIA_REFERENCE_COLUMNS: [
    ['banners', 'image_url'],
    ['categories', 'image_url'],
    ['franchises', 'image_url'],
    ['product_images', 'url'],
    ['users', 'avatar_url'],
    ['reviews', 'photo_urls'],
    // لقطة صورة المنتج وقت الطلب — يبقى تاريخ الطلبات صحيحاً ولو حُذف
    // المنتج. اكتشفه اختبارُ التغطية بعد أن أغفلَته المراجعة اليدوية، وهو
    // بالضبط السبب في ألّا يكون الحذف آلياً.
    ['order_items', 'image_url'],
  ] as ReadonlyArray<readonly [string, string]>,

  /**
   * ملفات لا يشير إليها شيء — **قراءة فقط، لا حذف**.
   *
   * الحذف الآلي غير آمن بالمعمارية الحالية: المراجع نصوصٌ في سبعة أعمدة
   * لا مفاتيح أجنبية، فأيّ جدول يُضاف لاحقاً ويُنسى هنا يتحوّل إلى فقدان
   * بيانات صامت. تُستعمل هذه الدالة للتشخيص وقياس التراكم، والحذف — إن
   * أُريد — قرارٌ بشريّ على قائمة مُراجَعة.
   *
   * [CRITICAL] `olderThan` ليس سبب الحذف بل حارسُ السباق: ملفٌ رُفع للتوّ
   * ولم يُربط بعد (المستخدم ما يزال يملأ النموذج) يبدو يتيماً وهو ليس كذلك.
   */
  async findUnreferenced(
    db: pg.Pool | pg.PoolClient,
    olderThan: Date,
  ): Promise<Array<{ id: string; url: string; sizeBytes: number }>> {
    const { rows } = await db.query<{ id: string; url: string; size_bytes: number }>(
      `SELECT m.id, m.url, m.size_bytes
         FROM media_files m
        WHERE m.created_at < $1
          AND NOT EXISTS (SELECT 1 FROM banners            b WHERE b.image_url  = m.url)
          AND NOT EXISTS (SELECT 1 FROM categories         c WHERE c.image_url  = m.url)
          AND NOT EXISTS (SELECT 1 FROM franchises         f WHERE f.image_url  = m.url)
          AND NOT EXISTS (SELECT 1 FROM product_images     p WHERE p.url        = m.url)
          AND NOT EXISTS (SELECT 1 FROM users             us WHERE us.avatar_url = m.url)
          AND NOT EXISTS (SELECT 1 FROM reviews            r WHERE m.url = ANY(r.photo_urls))
          AND NOT EXISTS (SELECT 1 FROM order_items         o WHERE o.image_url  = m.url)
        ORDER BY m.created_at`,
      [olderThan],
    );
    return rows.map((r) => ({ id: r.id, url: r.url, sizeBytes: r.size_bytes }));
  },

  /**
   * الصفّ بمرجعه المخزَّن — مع **مالكه وغرضه**.
   *
   * [SECURITY] فحوص الملكية (صور التقييم، الصورة الشخصية) تقرأ `uploaded_by`
   * و`purpose` من هنا؛ الوجودُ وحده لم يكن كافياً: مرجعٌ عامّ (صورة منتج،
   * صورة زبونٍ آخر في المجتمع) موجودٌ في الجدول لكنه ليس ملكاً للسائل.
   */
  async findByUrl(db: pg.Pool | pg.PoolClient, url: string) {
    const { rows } = await db.query<{
      id: string;
      storage_key: string;
      uploaded_by: string | null;
      purpose: MediaPurpose;
    }>(
      'SELECT id, storage_key, uploaded_by, purpose FROM media_files WHERE url = $1',
      [url],
    );
    return rows[0] ?? null;
  },
};
