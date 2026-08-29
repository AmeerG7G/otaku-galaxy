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
