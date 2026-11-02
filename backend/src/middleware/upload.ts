import multer from 'multer';
import { config } from '../config/index.js';
import { Errors } from '../utils/errors.js';

/**
 * هل **يمكن** أن يحمل هذا الوسمُ المعلَن صورة؟
 *
 * [CRITICAL] الوسم ليس الحَكَم. كان الحارس هنا يقبل `image/jpeg|png|webp`
 * حرفياً ويرفض ما عداها — أي يرفض على قيمةٍ يكتبها العميل، قبل أن يُفحص
 * المحتوى أصلاً. والعملاء الحقيقيون يَسِمون صوراً سليمة بغير ذلك:
 * `image_picker` على أندرويد يعيد ترميز صورةٍ أصلها HEIC إلى JPEG ويُبقي اسم
 * `scaled_….heic` فيعلن Dio `image/heic`، والملف بلا امتداد (وcurl، ومتصفّحٌ
 * لا يعرف الامتداد) يُعلَن `application/octet-stream`. كانت كلها تُردّ
 * «نوع الصورة غير مدعوم» وبايتاتها JPEG صالح.
 *
 * الآن: هذا الحارس يردّ مبكراً ما أُعلن **بصدق** أنه ليس صورة (`text/html`،
 * `application/pdf`…) كي لا يُخزَّن في الذاكرة بلا طائل، والقرارُ الفعلي
 * للتوقيع الثنائي في `mediaService.upload` (`sniffImageMime`) — وهو وحده ما
 * يحدّد القبول والامتداد المخزَّن. لا تخفيف في الفحص: غير الصورة يُرفض مهما
 * كان وسمُها، وSVG (نصٌّ قد يحمل سكربتاً) لا توقيع له في القائمة فيُرفض.
 */
function mayCarryImage(declaredMime: string | undefined): boolean {
  const mime = (declaredMime ?? '').trim().toLowerCase();
  return (
    mime === '' ||
    mime.startsWith('image/') ||
    mime === 'application/octet-stream' ||
    mime === 'binary/octet-stream'
  );
}

/**
 * الرفع في الذاكرة ثم التسليم لسائق التخزين — يُبقي المتحكّم مستقلاً عن
 * وجهة التخزين النهائية (قرص محلي الآن، خدمة كائنات لاحقاً).
 */
export const uploadSingleImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!mayCarryImage(file.mimetype)) {
      callback(Errors.badRequest('نوع الصورة غير مدعوم (JPG/PNG/WebP فقط)', 'UNSUPPORTED_MEDIA'));
      return;
    }
    callback(null, true);
  },
}).single('file');
