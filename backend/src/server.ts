import { createApp } from './app.js';
import { config } from './config/index.js';
import { closePools } from './database/pool.js';
import { startRatingReminderScheduler } from './jobs/ratingReminderJob.js';
import { smsProvider } from './services/sms/index.js';

const app = createApp();

/**
 * فحص إقلاع للمزوّد.
 *
 * بناء المزوّد كسولٌ (عند أول رسالة)، ولو تُرك كذلك لاكتشفنا نقص إعداده عند
 * أول مستخدم يحاول التسجيل لا عند النشر. نبنيه هنا مرة واحدة ليسقط الإقلاع
 * فوراً إن كان الإعداد ناقصاً.
 */
smsProvider();

const server = app.listen(config.port, () => {
  console.log(`Otaku Galaxy API running on http://localhost:${config.port} [${config.nodeEnv}]`);
  console.log(`SMS provider: ${config.sms.provider}`);
  if (config.verification.devOtpEnabled) {
    console.log('⚠  DEV_OTP_ENABLED=true — رمز التحقق ثابت (تطوير فقط، مستحيل في الإنتاج)');
  }
});

// جدولة تذكير التقييم تعيش مع الخادم لا مع التطبيق (createApp)، فلا
// تشتغل أثناء الاختبارات التي تبني التطبيق وحده.
const stopRatingReminders = startRatingReminderScheduler();

/**
 * إغلاق منظَّم.
 *
 * `exitCode` يميّز الخروج الطبيعي (إشارة إيقاف) من الخروج بعد عطل غير
 * قابل للتعافي. المدير (PM2 أو Docker) يقرأ الرمز: الصفر يعني «توقّفتُ كما
 * طُلب مني»، وغيرُه يعني «سقطتُ، أعِد تشغيلي».
 *
 * المهلة القسرية تضمن ألّا يعلق الحاوي إلى الأبد على اتصال لا يُغلق:
 * Docker يمهل عشر ثوانٍ بعد SIGTERM ثم يرسل SIGKILL، فالخروج بأنفسنا قبلها
 * أنظف من أن نُقتل في منتصف كتابة.
 */
async function shutdown(reason: string, exitCode = 0) {
  console.log(`\n${reason} — shutting down...`);
  stopRatingReminders();
  server.close(async () => {
    await closePools();
    process.exit(exitCode);
  });
  setTimeout(() => process.exit(exitCode === 0 ? 1 : exitCode), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT received'));
process.on('SIGTERM', () => void shutdown('SIGTERM received'));

/**
 * [CRITICAL] العطل غير المتوقَّع ينهي العملية — لا يواصل بحالة مجهولة.
 *
 * بعد `uncaughtException` تكون العملية في حالة غير معرَّفة: قد تكون معاملةٌ
 * على القاعدة نصفَ منفَّذة، أو قفلٌ لم يُحرَّر، أو كائنٌ نصفَ مبنيّ. مواصلةُ
 * الخدمة عندئذٍ أخطر من التوقّف — خادمٌ يردّ ببيانات فاسدة أسوأ من خادمٍ لا
 * يردّ، لأن الأول لا يُلاحَظ. المدير يعيد التشغيل على حالة نظيفة خلال ثوانٍ.
 *
 * الرفض غير المعالَج يُعامَل بالمنطق نفسه: Node ينهي العملية عليه افتراضياً
 * منذ الإصدار ١٥، ونحن نسبقه إلى ذلك بإغلاق منظَّم وسجلٍّ مفهوم بدل أثرٍ خام.
 *
 * ما لا نفعله هنا: ابتلاع الخطأ، أو طباعة الإعدادات، أو تسجيل جسم الطلب —
 * فالأسرار والتوكنات تعيش هناك.
 */
let crashing = false;

function fatal(kind: string, error: unknown) {
  // عطلٌ ثانٍ أثناء الإغلاق يجب ألّا يعيد الدورة من أولها.
  if (crashing) return;
  crashing = true;
  console.error(`[fatal] ${kind}:`, error);
  void shutdown(`${kind} — عطل غير قابل للتعافي`, 1);
}

process.on('uncaughtException', (error) => fatal('uncaughtException', error));
process.on('unhandledRejection', (reason) => fatal('unhandledRejection', reason));