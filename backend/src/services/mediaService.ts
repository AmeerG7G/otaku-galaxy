import { config } from '../config/index.js';
import { db } from '../database/pool.js';
import { mediaRepo } from '../repositories/mediaRepo.js';
import { sniffImageMime, storage } from '../storage/index.js';
import type { MediaPurpose } from '../types/index.js';
import { Errors } from '../utils/errors.js';

export const mediaService = {
  /**
   * يحفظ صورة ويُعيد رابطها العام.
   *
   * [CRITICAL] النوع يُحسم من **محتوى الملف** وحده (التوقيع الثنائي)، لا من
   * `Content-Type` المعلَن ولا من امتداد الاسم — كلاهما يكتبه العميل. كان
   * هنا فحصٌ ثانٍ للنوع المعلَن يرفض صورةً سليمة وُسمت `image/heic` أو
   * `application/octet-stream` — انظر `mayCarryImage` في `middleware/upload.ts`.
   */
  async upload(input: {
    buffer: Buffer;
    purpose: MediaPurpose;
    uploadedBy: string | null;
    /** الإدارة معفاة من الحصّة — عملها رفعٌ بالجملة للكتالوج. */
    isAdmin?: boolean;
  }) {
    if (input.buffer.byteLength === 0) {
      throw Errors.badRequest('الملف فارغ', 'EMPTY_FILE');
    }

    // النوع الحقيقي من محتوى الملف — لا نثق بالنوع المعلن من العميل.
    const actualMime = sniffImageMime(input.buffer);
    if (actualMime === null) {
      throw Errors.badRequest('الملف ليس صورة صالحة', 'UNSUPPORTED_MEDIA');
    }

    // ═══ الحصّة اليومية ═══
    //
    // تُفحص بعد التحقق من النوع وقبل الكتابة على القرص: لا معنى لحجز
    // مساحةٍ لملفٍ سيُرفض، ولا لمحاسبة حسابٍ على ملفٍ ليس صورة أصلاً.
    //
    // القياس بالبايتات لا بالعدد — الخطر مساحةُ القرص. والنافذة متدحرجة
    // من القاعدة لا عدّاداً في الذاكرة، فتصمد عبر إعادة التشغيل وعبر أكثر
    // من نسخة خادم.
    if (input.uploadedBy && !input.isAdmin) {
      const limit = config.uploads.dailyBytesPerCustomer;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const used = await mediaRepo.bytesUploadedSince(db, input.uploadedBy, since);
      if (used + input.buffer.byteLength > limit) {
        throw Errors.tooManyRequests(
          'تجاوزت حصّة الرفع اليومية — حاول غداً',
          'UPLOAD_QUOTA_EXCEEDED',
        );
      }
    }

    // [CRITICAL] فشلُ الكتابة (قرصٌ ممتلئ، حجمٌ مُركَّب بلا صلاحية كتابة) كان
    // يخرج ٥٠٠ عامّاً لا يميّزه العميل ولا المشغّل من أي عطلٍ آخر. السبب
    // الحقيقي — وفيه المسار الداخلي — للسجلّ وحده، والعميل يرى رمزاً ثابتاً.
    let saved: Awaited<ReturnType<typeof storage.save>>;
    try {
      saved = await storage.save({
        buffer: input.buffer,
        // الامتداد يتبع المحتوى الحقيقي حتى لو خالف ما أعلنه العميل.
        mimeType: actualMime,
        purpose: input.purpose,
      });
    } catch (error) {
      console.error('[media] storage write failed', { purpose: input.purpose, error });
      throw Errors.internal('تعذّر حفظ الصورة على الخادم — حاول مرة أخرى بعد قليل', 'STORAGE_FAILED');
    }

    try {
      return await mediaRepo.create(db, {
        storageKey: saved.storageKey,
        url: saved.url,
        purpose: input.purpose,
        mimeType: actualMime,
        sizeBytes: input.buffer.byteLength,
        uploadedBy: input.uploadedBy,
      });
    } catch (error) {
      // الملف كُتب ولا صفّ يشير إليه — ملفٌّ بلا سجلّ لا يراه تشخيص اليتامى
      // (`findUnreferenced` يقرأ الجدول) ولا يُحاسَب في الحصّة. يُحذف هنا.
      //
      // ليس نقضاً لـ«الوسائط لا تُحذف» (§8.5): ذاك لملفٍّ له صفّ وقد يشير إليه
      // عمودٌ نصّي لا نعرفه؛ هذا مرجعه لم يُعَد لأي عميل، فلا شيء يشير إليه.
      // الحالة النادرة — إدراجٌ ثبت ثم انقطع الردّ — تترك صفّاً بلا ملف لا
      // يشير إليه شيء أيضاً، ويُدرجه `findUnreferenced`.
      await storage.remove(saved.storageKey).catch(() => undefined);
      throw error;
    }
  },
};
