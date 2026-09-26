import { config } from '../config/index.js';
import { db } from '../database/pool.js';
import { mediaRepo } from '../repositories/mediaRepo.js';
import { ALLOWED_IMAGE_MIMES, sniffImageMime, storage } from '../storage/index.js';
import type { MediaPurpose } from '../types/index.js';
import { Errors } from '../utils/errors.js';

export const mediaService = {
  /**
   * يحفظ صورة ويُعيد رابطها العام. نوع الملف يُتحقَّق منه من الـMIME الفعلي
   * لا من امتداد الاسم القادم من العميل.
   */
  async upload(input: {
    buffer: Buffer;
    mimeType: string;
    purpose: MediaPurpose;
    uploadedBy: string | null;
    /** الإدارة معفاة من الحصّة — عملها رفعٌ بالجملة للكتالوج. */
    isAdmin?: boolean;
  }) {
    if (!ALLOWED_IMAGE_MIMES.includes(input.mimeType)) {
      throw Errors.badRequest('نوع الصورة غير مدعوم (JPG/PNG/WebP فقط)', 'UNSUPPORTED_MEDIA');
    }
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

    const saved = await storage.save({
      buffer: input.buffer,
      // الامتداد يتبع المحتوى الحقيقي حتى لو خالف ما أعلنه العميل.
      mimeType: actualMime,
      purpose: input.purpose,
    });

    return mediaRepo.create(db, {
      storageKey: saved.storageKey,
      url: saved.url,
      purpose: input.purpose,
      mimeType: actualMime,
      sizeBytes: input.buffer.byteLength,
      uploadedBy: input.uploadedBy,
    });
  },
};
