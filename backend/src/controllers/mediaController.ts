import type { RequestHandler } from 'express';
import { mediaService } from '../services/mediaService.js';
import { created } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import { Errors } from '../utils/errors.js';
import { uploadPurposeSchema } from '../validators/community.js';

export const mediaController = {
  /**
   * رفع صورة واحدة. العملاء يرفعون صور التقييمات فقط؛ باقي الأغراض
   * (منتجات/بنرات/أنمي) محصورة بالإدارة عبر مسار الإدارة.
   */
  upload: (async (req, res) => {
    const file = req.file;
    if (!file) throw Errors.badRequest('لم تُرفق صورة', 'FILE_REQUIRED');

    const { purpose } = parse(uploadPurposeSchema, req.body ?? {});
    const isAdmin = req.auth?.role === 'admin';
    if (!isAdmin && purpose !== 'review' && purpose !== 'avatar') {
      throw Errors.forbidden('غير مسموح برفع هذا النوع');
    }

    const media = await mediaService.upload({
      buffer: file.buffer,
      mimeType: file.mimetype,
      purpose,
      uploadedBy: req.auth?.id ?? null,
    });

    return created(res, { id: media.id, url: media.url }, 'تم رفع الصورة');
  }) as RequestHandler,
};
