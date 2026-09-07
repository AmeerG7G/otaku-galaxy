import { config } from '../config/index.js';
import { db, withTransaction } from '../database/pool.js';
import { mediaRepo } from '../repositories/mediaRepo.js';
import {
  visualsRepo,
  type RotationMode,
  type VisualSlotDto,
} from '../repositories/visualsRepo.js';
import { Errors } from '../utils/errors.js';

/** فتحة كما يقرؤها التطبيق: الرابط المختار الآن + القائمة للتحميل المسبق. */
export interface ResolvedSlot {
  slotKey: string;
  rotationMode: RotationMode;
  /** الرابط الذي يجب عرضه الآن. */
  currentUrl: string;
  /** كل الروابط النشطة — يستعملها التطبيق للتحميل المسبق لا للاختيار. */
  urls: string[];
  /** متى يتغيّر الاختيار (ISO)، أو null إن كان ثابتاً. */
  validUntil: string | null;
}

/**
 * «اليوم» بتقويم المتجر، كعدد أيام منذ حقبة يونكس.
 *
 * [CRITICAL] يُحسب على الخادم لا على الجهاز. ساعة الهاتف يملكها صاحبه:
 * تقديمها يوماً يمنحه شخصية الغد، وخادمٌ بـUTC يبدّل الشخصية الثالثة فجراً
 * ببغداد. رقم واحد من مصدر واحد يجعل كل الأجهزة ترى الشخصية نفسها.
 */
async function storeDayNumber(): Promise<number> {
  const { rows } = await db.query<{ day: string }>(
    `SELECT ((now() AT TIME ZONE $1)::date - DATE '1970-01-01')::text AS day`,
    [config.storeTimezone],
  );
  return Number(rows[0]?.day ?? 0);
}

/** بداية الغد بتقويم المتجر — لحظة انتهاء صلاحية الاختيار اليومي. */
async function nextStoreMidnight(): Promise<string> {
  const { rows } = await db.query<{ at: Date }>(
    `SELECT (((now() AT TIME ZONE $1)::date + 1) AT TIME ZONE $1) AS at`,
    [config.storeTimezone],
  );
  return rows[0]!.at.toISOString();
}

/**
 * يختار صورة الفتحة.
 *
 * `fixed`: الأولى في الترتيب الذي ضبطه المسؤول.
 * `daily`: فهرس حتمي مشتقّ من رقم اليوم — بلا عشوائية وبلا حالة على الجهاز،
 * فالنتيجة ثابتة طوال اليوم مهما أعاد التطبيق البناء أو أُعيد تشغيله.
 */
function chooseIndex(mode: RotationMode, count: number, dayNumber: number) {
  if (count <= 1 || mode === 'fixed') return 0;
  return dayNumber % count;
}

/** فتحة كما تراها اللوحة: بيانات الفتحة + الصورة المعروضة الآن. */
export interface AdminSlotDto extends VisualSlotDto {
  /** معرّف الصورة التي يخدمها الخادم الآن، أو null إن لم تكن الفتحة معروضة. */
  currentImageId: string | null;
}

export const visualsService = {
  // ── واجهة العميل ──

  /**
   * الإعداد المنشور. الفتحات بلا صور نشطة لا تُذكر إطلاقاً — غيابُها هو
   * إشارة «استعمل الأصل المضمَّن»، وهي الحالة الافتراضية بعد الترقية.
   */
  async published(): Promise<{
    slots: ResolvedSlot[];
    timezone: string;
    version: string;
  }> {
    const [slots, version] = await Promise.all([
      visualsRepo.listPublished(db),
      visualsRepo.publishedVersion(db),
    ]);
    if (slots.length === 0) {
      return { slots: [], timezone: config.storeTimezone, version };
    }

    const needsDay = slots.some((slot) => slot.rotationMode === 'daily');
    const dayNumber = needsDay ? await storeDayNumber() : 0;
    const validUntil = needsDay ? await nextStoreMidnight() : null;

    return {
      timezone: config.storeTimezone,
      version,
      slots: slots.map((slot) => {
        const urls = slot.images.map((image) => image.url);
        const index = chooseIndex(slot.rotationMode, urls.length, dayNumber);
        return {
          slotKey: slot.slotKey,
          rotationMode: slot.rotationMode,
          currentUrl: urls[index]!,
          urls,
          validUntil: slot.rotationMode === 'daily' ? validUntil : null,
        };
      }),
    };
  },

  // ── لوحة التحكم ──

  /**
   * الفتحات للوحة التحكم، ومعها **الصورة التي سيراها الزبون الآن**.
   *
   * [CRITICAL] الاختيار يُحسب هنا بـ`chooseIndex` نفسها التي تخدم التطبيق.
   * كانت اللوحة تعيد تنفيذ القاعدة بـTypeScript في المتصفح وتقرأ ساعة
   * الجهاز: نسختان من قاعدة واحدة عبر حدّ لغتين، لا اختبار يربطهما. أوّل
   * نمط تدوير يُضاف إلى الخادم كان سيجعل المعاينة تكذب بصمت — يرى المسؤول
   * صورةً ويصل الزبونَ غيرها، ولا شيء يكسر ليُنبّه.
   */
  async listForAdmin(): Promise<{ items: AdminSlotDto[] }> {
    const slots = await visualsRepo.listAll(db);
    const needsDay = slots.some(
      (slot) => slot.isActive && slot.rotationMode === 'daily',
    );
    const dayNumber = needsDay ? await storeDayNumber() : 0;

    return {
      items: slots.map((slot) => {
        // بعد إسقاط غير النشط يصير الترتيب هو ترتيب `listPublished` نفسه
        // (`sort_order` ثم `created_at`)، فالفهرس يشير إلى الصورة ذاتها.
        const active = slot.images.filter((image) => image.isActive);
        const visible = slot.isActive && active.length > 0;
        return {
          ...slot,
          currentImageId: visible
            ? active[chooseIndex(slot.rotationMode, active.length, dayNumber)]!.id
            : null,
        };
      }),
    };
  },

  async createSlot(input: {
    slotKey: string;
    label?: string;
    location?: string;
    groupKey?: string;
    rotationMode?: RotationMode;
  }) {
    try {
      return await visualsRepo.create(db, input);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw Errors.conflict('توجد فتحة بهذا المفتاح', 'SLOT_KEY_TAKEN');
      }
      throw error;
    }
  },

  async updateSlot(
    id: string,
    input: {
      label?: string;
      location?: string;
      groupKey?: string;
      isActive?: boolean;
      rotationMode?: RotationMode;
    },
  ) {
    const updated = await visualsRepo.update(db, id, input);
    if (!updated) throw Errors.notFound('الفتحة غير موجودة');
    return updated;
  },

  /**
   * حذف فتحة.
   *
   * مسموح دائماً: التطبيق يعود إلى الأصل المضمَّن فوراً، فلا شاشة تنكسر.
   * صور الفتحة تُحذف معها (`ON DELETE CASCADE`) لأنها بلا معنى خارجها —
   * أما الملفات على القرص فتبقى، وهي قرار تنظيف منفصل.
   */
  async deleteSlot(id: string) {
    const removed = await visualsRepo.remove(db, id);
    if (!removed) throw Errors.notFound('الفتحة غير موجودة');
    return { id };
  },

  /**
   * إضافة صورة إلى فتحة.
   *
   * الرابط يجب أن يكون ملفاً يعرفه الخادم أو رابطاً خارجياً كاملاً — نفس
   * القاعدة التي تحرس صور التقييمات. رابط `/uploads/` لا يقابله صفّ في
   * `media_files` يعني مرجعاً معلّقاً منذ لحظته الأولى.
   */
  /**
   * إضافة صورة إلى فتحة، أو استبدال ما فيها.
   *
   * [CRITICAL] الاستبدال عملية قائمة بذاتها لا مجرد إضافة.
   *
   * كانت الإضافة تضع الصورة في **آخر** القائمة، والنمط الثابت يعرض
   * **أولها**. فالمسؤول يرفع بديلاً، ويراه في اللوحة، ويبقى التطبيق يعرض
   * القديمة إلى الأبد — واللوحة تقول إن الصورة تغيّرت بينما لم يتغيّر شيء.
   * وهو أسوأ صنف من الأعطال: لا خطأ، ولا سجل، ولا شيء يُلاحَظ إلا التناقض.
   *
   * `replace` يوقف كل الصور القائمة ويضع الجديدة في المقدمة، فتصير هي
   * المعروضة فوراً مهما كان النمط. القديمة تبقى موقوفة لا محذوفة: الملف
   * يظل على القرص وقد تشير إليه أشياء أخرى، والتراجع يبقى ممكناً بضغطة.
   */
  async addImage(slotId: string, url: string, mode: 'append' | 'replace' = 'append') {
    const slot = await visualsRepo.findById(db, slotId);
    if (!slot) throw Errors.notFound('الفتحة غير موجودة');

    const trimmed = url.trim();
    let mediaId: string | null = null;

    if (trimmed.startsWith(config.uploads.publicPath)) {
      const media = await mediaRepo.findByUrl(db, trimmed);
      if (!media) {
        throw Errors.badRequest(
          'هذه الصورة غير مرفوعة على الخادم',
          'MEDIA_NOT_FOUND',
        );
      }
      mediaId = media.id;
    }

    try {
      // معاملة واحدة: إمّا أن تُوقف القديمة وتُدرج الجديدة معاً، أو لا
      // يقع شيء. الفشل في المنتصف كان سيترك الفتحة بلا صورة نشطة.
      await withTransaction(async (tx) => {
        if (mode === 'replace') {
          await visualsRepo.deactivateAllImages(tx, slotId);
        }
        await visualsRepo.addImage(tx, {
          slotId,
          url: trimmed,
          mediaId,
          position: mode === 'replace' ? 'first' : 'last',
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw Errors.conflict('الصورة مضافة لهذه الفتحة مسبقاً', 'IMAGE_ALREADY_IN_SLOT');
      }
      throw error;
    }
    return (await visualsRepo.findById(db, slotId))!;
  },

  async updateImage(
    slotId: string,
    imageId: string,
    input: { isActive?: boolean; sortOrder?: number },
  ) {
    // الملكية تُتحقَّق صراحةً: تعديل صورة فتحة أخرى بمعرّفها وحده يجب أن
    // يُرفض، لا أن ينجح بصمت لأن الجملة طابقت صفاً في مكان آخر.
    if (!(await visualsRepo.imageBelongsToSlot(db, imageId, slotId))) {
      throw Errors.notFound('الصورة غير موجودة في هذه الفتحة');
    }
    await visualsRepo.updateImage(db, imageId, input);
    return (await visualsRepo.findById(db, slotId))!;
  },

  async removeImage(slotId: string, imageId: string) {
    if (!(await visualsRepo.imageBelongsToSlot(db, imageId, slotId))) {
      throw Errors.notFound('الصورة غير موجودة في هذه الفتحة');
    }
    await visualsRepo.removeImage(db, imageId);
    return (await visualsRepo.findById(db, slotId))!;
  },

  async reorderImages(slotId: string, imageIds: string[]) {
    const slot = await visualsRepo.findById(db, slotId);
    if (!slot) throw Errors.notFound('الفتحة غير موجودة');

    const known = new Set(slot.images.map((image) => image.id));
    if (imageIds.length !== known.size || imageIds.some((id) => !known.has(id))) {
      throw Errors.badRequest(
        'قائمة الترتيب يجب أن تحتوي كل صور الفتحة مرة واحدة',
        'REORDER_MISMATCH',
      );
    }

    await visualsRepo.reorder(db, slotId, imageIds);
    return (await visualsRepo.findById(db, slotId))!;
  },
};
