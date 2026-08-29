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

async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down...`);
  stopRatingReminders();
  server.close(async () => {
    await closePools();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));