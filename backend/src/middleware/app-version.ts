import type { RequestHandler } from 'express';
import { appVersionService } from '../services/appVersionService.js';
import { AppError } from '../utils/errors.js';

/** الرأس الذي يعلن به تطبيق العميل نسخته المثبَّتة. */
export const APP_VERSION_HEADER = 'x-app-version';

/** رمز الخطأ الذي يعرفه تطبيق العميل ليعرض شاشة التحديث. */
export const APP_UPDATE_REQUIRED = 'APP_UPDATE_REQUIRED';

/**
 * يرفض عمليات العميل القادمة من نسخة تطبيق أقدم من الحدّ الأدنى المدعوم.
 *
 * لماذا خادميّاً أيضاً وقد حجبت الواجهة الشاشة: الواجهة تُعدَّل. من يعدّل
 * الـAPK أو يخاطب الـAPI مباشرة يتجاوز أي حاجزٍ رُسم في Flutter، ويبقى
 * يكتب في القاعدة بعقدٍ قديم — وهو بالضبط ما يُجبَر التحديث لمنعه.
 *
 * [CRITICAL] الرأس الغائب **يمرّ**. الحاجب هنا هو رأسٌ حاضرٌ ونسخةٌ صالحة
 * دون الحدّ؛ لا شيء غير ذلك. لو حجبنا الغياب لانكسر في اللحظة نفسها كل
 * عميلٍ حاليّ لا يرسل الرأس أصلاً — وهو تعطيلٌ شاملٌ للـAPI لا إجبارُ
 * تحديث. لذلك الأثر على العملاء الحاليين: لا شيء، حتى يُضبط الحدّ.
 */
export const requireSupportedAppVersion: RequestHandler = (req, _res, next) => {
  const raw = req.get(APP_VERSION_HEADER);
  if (!raw) return next();

  appVersionService
    .isUpdateRequired(raw)
    .then(async (required) => {
      if (!required) return next();
      const config = await appVersionService.config();
      next(
        new AppError(
          // 426 Upgrade Required — الرمز القياسي لـ«حدّث ثم عد».
          426,
          APP_UPDATE_REQUIRED,
          config.updateMessage || 'يلزم تحديث التطبيق للمتابعة',
          {
            minimumSupportedVersion: config.minimumSupportedVersion,
            latestVersion: config.latestVersion,
          },
        ),
      );
    })
    // فشل الفحص نفسه لا يحجب: انظر سياسة «لا حجب عند الشكّ» في الخدمة.
    .catch(() => next());
};
