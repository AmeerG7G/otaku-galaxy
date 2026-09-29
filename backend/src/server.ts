import { createApp } from './app.js';
import { config } from './config/index.js';
import { closePools } from './database/pool.js';
import { startPushOutboxScheduler } from './jobs/pushOutboxJob.js';
import { startRatingReminderScheduler } from './jobs/ratingReminderJob.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Otaku Galaxy API running on http://localhost:${config.port} [${config.nodeEnv}]`);
});

// جدولة تذكير التقييم تعيش مع الخادم لا مع التطبيق (createApp)، فلا
// تشتغل أثناء الاختبارات التي تبني التطبيق وحده.
const stopRatingReminders = startRatingReminderScheduler();
// صندوق الدفع الصادر — يرسل الإشعارات الفورية خارج الطلبات (هجرة ٠٧٠).
const stopPushOutbox = startPushOutboxScheduler();

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
  stopPushOutbox();
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