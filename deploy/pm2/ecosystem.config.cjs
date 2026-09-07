/**
 * إعداد PM2 لخادم مجرّة الأوتاكو.
 *
 * [CRITICAL] مديرٌ واحد لا اثنان. هذا الملف هو مسار النشر **بلا حاويات**
 * (Node مباشرةً على الخادم). إن نُشر المشروع بـDocker Compose فإن
 * `restart: unless-stopped` هناك يقوم بالدور نفسه، ولا يجوز تشغيل الاثنين
 * على العملية ذاتها: مديران يتنازعان الإشارات، فيعيد أحدهما التشغيل بينما
 * يوقفه الآخر، وتصير حالة الخادم غير قابلة للتوقّع. اختر واحداً.
 *
 * لماذا PM2 لا systemd على هذا المسار: المشروع يحتاج إعادة تشغيل عند العطل،
 * وتدوير سجلّات، وإعادة تحميل بلا انقطاع، وسقفاً للذاكرة — وكلها موجودة هنا
 * في ملف واحد يعيش مع المستودع ويُراجَع معه، بدل وحدة systemd تعيش خارجه
 * على الخادم فتتباعد نسخُها بين البيئات بلا أن يلاحظ أحد.
 *
 * الأسرار ليست هنا. التطبيق يقرأ `.env.${APP_ENV}` من مجلّد التشغيل عبر
 * dotenv، فيكفي أن يحدّد هذا الملف البيئة ويترك القيم للملف الذي يعيش على
 * الخادم وحده. لا سرّ يدخل Git.
 *
 * التشغيل:
 *   pm2 start deploy/pm2/ecosystem.config.cjs --only otaku-api-staging
 *   pm2 start deploy/pm2/ecosystem.config.cjs --only otaku-api-prod
 *   pm2 save && pm2 startup     # ليبقى بعد إعادة تشغيل الخادم
 */

/** ما يشترك فيه التطبيقان — الفرق بينهما البيئة وحدها. */
const shared = {
  script: 'dist/server.js',
  cwd: '/srv/otaku-galaxy/backend',

  /**
   * نسخة واحدة، لا وضع العنقود.
   *
   * الجدولة نفسها آمنة تحت أكثر من نسخة (`FOR UPDATE SKIP LOCKED` في
   * `ratingReminderJob`)، لكن حدود المعدّل في `express-rate-limit` تعيش في
   * ذاكرة العملية: أربع نسخ تعني أربعة دلاء مستقلة، أي أربعة أضعاف السقف
   * الفعلي لتخمين كلمات المرور ورموز التحقق. رفعُ عدد النسخ يتطلّب مخزناً
   * مشتركاً للحدود (Redis) أولاً — انظر `deploy/README.md`.
   */
  exec_mode: 'fork',
  instances: 1,

  // إعادة التشغيل عند العطل، مع كبح التذبذب: خمس محاولات ثم توقّف عن
  // المحاولة بدل حلقة سقوطٍ لا نهائية تُغرق السجلّ وتخفي السبب الأصلي.
  autorestart: true,
  max_restarts: 5,
  min_uptime: '30s',
  restart_delay: 2000,

  /**
   * سقف الذاكرة — شبكة أمان لا سياسة.
   *
   * تسريبٌ بطيء يقتل الخادم بـOOM في وقتٍ لا يمكن التنبؤ به. إعادة التشغيل
   * عند حدٍّ معلوم تحوّل عطلاً غامضاً إلى حدث مُسجَّل. الرقم واسع عمداً كي
   * لا يُعيد التشغيل تحت حمل طبيعي.
   */
  max_memory_restart: '512M',

  /**
   * الإغلاق المنظَّم.
   *
   * `kill_timeout` أطول من المهلة القسرية داخل `server.ts` (عشر ثوانٍ) كي
   * يُتاح للخادم أن يُنهي طلباته ويغلق مجمّع القاعدة بنفسه قبل أن يُقتل.
   * `wait_ready` غير مفعَّل لأن التطبيق لا يرسل `process.send('ready')`.
   */
  kill_timeout: 15000,
  listen_timeout: 10000,

  // السجلّات: مسار ثابت خارج المستودع، بطابع زمني، ومدموجة بين النسخ.
  merge_logs: true,
  time: true,
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

  // لا مراقبة للملفات في الإنتاج: تعديلٌ عابر على القرص يجب ألّا يعيد تشغيل
  // خادمٍ يخدم زبائن.
  watch: false,
};

module.exports = {
  apps: [
    {
      ...shared,
      name: 'otaku-api-staging',
      env: {
        // هذان فقط. الباقي يأتي من `.env.staging` على الخادم.
        APP_ENV: 'staging',
        NODE_ENV: 'production',
      },
      error_file: '/var/log/otaku-galaxy/staging-error.log',
      out_file: '/var/log/otaku-galaxy/staging-out.log',
    },
    {
      ...shared,
      name: 'otaku-api-prod',
      env: {
        APP_ENV: 'prod',
        NODE_ENV: 'production',
      },
      error_file: '/var/log/otaku-galaxy/prod-error.log',
      out_file: '/var/log/otaku-galaxy/prod-out.log',
    },
  ],
};
