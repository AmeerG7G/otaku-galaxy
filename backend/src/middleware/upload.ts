import multer from 'multer';
import { config } from '../config/index.js';
import { ALLOWED_IMAGE_MIMES } from '../storage/index.js';
import { Errors } from '../utils/errors.js';

/**
 * الرفع في الذاكرة ثم التسليم لسائق التخزين — يُبقي المتحكّم مستقلاً عن
 * وجهة التخزين النهائية (قرص محلي الآن، خدمة كائنات لاحقاً).
 */
export const uploadSingleImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
      callback(Errors.badRequest('نوع الصورة غير مدعوم (JPG/PNG/WebP فقط)', 'UNSUPPORTED_MEDIA'));
      return;
    }
    callback(null, true);
  },
}).single('file');
