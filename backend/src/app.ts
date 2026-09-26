import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config/index.js';
import { uploadsRoot } from './storage/index.js';
import { authenticate, optionalAuthenticate, requireAdmin } from './middleware/auth.js';
import { pinLocale } from './middleware/locale.js';
import { DEFAULT_LOCALE } from './utils/locale.js';
import { requireSupportedAppVersion } from './middleware/app-version.js';
import { errorHandler, globalRateLimiter, notFoundHandler } from './middleware/error-handler.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { customerRoutes } from './routes/customer.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');

  /**
   * الثقة بالوسيط — شرطُ صحّة كل حدود المعدّل خلف nginx أو موازن حِمل.
   *
   * بدونها يرى express عنوان الوسيط لكل الطلبات، فتنهار الحدود إلى دلو
   * واحد مشترك بين كل المستخدمين: أول عشرة طلبات في النافذة تُغلق التسجيل
   * والدخول على الجميع. تُضبط من البيئة لأن عدد الوسطاء يختلف بالنشر.
   */
  const trustProxy = config.trustProxy;
  if (trustProxy !== 'false') {
    app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  }
  // crossOriginResourcePolicy معطّل لأن الصور تُقدَّم لتطبيق على أصل مختلف.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  /**
   * فحص الحياة — **قبل** حدّ المعدّل عمداً.
   *
   * [CRITICAL] كان مسجَّلاً بعده فيُحتسب في الدلو نفسه الذي يستهلكه المرور
   * الحقيقي. ونتيجته أن ازدحاماً عابراً يجعل `/health` يردّ 429، فيقرأ
   * Docker/nginx ذلك «الحاوية ميّتة» ويعيد تشغيل خادمٍ سليم — أي أن الحمل
   * الزائد يتحوّل إلى انقطاع بدل أن يُمتصّ. فحصُ الحياة يجب أن يجيب دائماً.
   *
   * وقد ظهر هذا فعلاً أثناء الاختبار: تشغيلٌ متتالٍ للمجموعة استهلك الحدّ،
   * فصار `/health` يردّ 429 وأعلنت اختبارات التكامل أن «الخادم متوقف» وهو
   * يعمل.
   */
  app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

  app.use(globalRateLimiter());

  /**
   * الصور المرفوعة تُقدَّم كملفات ثابتة (سائق القرص المحلي) — **بالمرجع لا
   * بالتصفّح**.
   *
   * [SECURITY] القرار (تدقيق 2026-09-14): صور التقييم تبقى عامّةً بمرجعها
   * قبل الاعتماد وبعده. ما يحمي المنتظر/المرفوض هو أن المرجع لا يُخمَّن
   * (`غرض/سنة/شهر/<uuid v4>`)، وأن لا سرداً للمجلّدات (`index: false`،
   * و`redirect: false` كي لا يكشف طلبُ مجلّدٍ وجودَه بتحويلة 301)، وأن لا
   * واجهةً عامّة تُدرج مرجعاً غير معتمَد (`uploads-exposure.test.ts`). مسارٌ
   * محميّ كان سيكسر معاينةَ الرافع ولوحةَ المراجعة (لا توكن مع الصور) بلا
   * مكسبٍ حقيقي. من حصل على رابطٍ غير معتمَد بطريقٍ ما يفتحه — مُقرٌّ به.
   */
  app.use(
    config.uploads.publicPath,
    express.static(uploadsRoot, { immutable: true, maxAge: '30d', index: false, redirect: false }),
  );

  app.use('/api/auth', authRoutes);
  // مصادقة اختيارية: الزائر يُخدَم، والمسجَّل يُقرأ تفضيل لغته من صفّه.
  app.use('/api/catalog', optionalAuthenticate, catalogRoutes);
  /**
   * عمليات العميل المحميّة — تمرّ بفحص نسخة التطبيق قبل المصادقة.
   *
   * الفحص هنا وحده: `/api/auth` يبقى مفتوحاً (المحجوب قد يحتاج تسجيل خروج)،
   * و`/api/catalog` عامّ ويحمل مسار النسخة نفسه، و`/api/admin` لوحةُ متصفّح
   * لا تطبيقَ هاتف فلا نسخة لها. والرأس الغائب يمرّ في كل الأحوال — انظر
   * `requireSupportedAppVersion`.
   */
  // اللوحة عربيةٌ مهما قالت الترويسة أو تفضيلُ المسؤول — انظر `pinLocale`.
  // [CRITICAL] يُركَّب **قبل** طبقة `/api` العامّة: بادئة `/api` تطابق
  // `/api/admin/…` أيضاً، فطلبٌ بلا توكن يُجاب من `authenticate` هناك قبل أن
  // يصل إلى طبقة الإدارة — ولا بدّ أن يكون ٤٠١ ذاك عربياً كذلك.
  app.use('/api/admin', pinLocale(DEFAULT_LOCALE));
  app.use('/api', requireSupportedAppVersion, authenticate, customerRoutes);
  app.use('/api/admin', authenticate, requireAdmin, adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}