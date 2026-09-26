import type pg from 'pg';
import { config } from '../config/index.js';
import { db } from '../database/pool.js';
import { REVIEWABLE_ITEMS_OF_ORDER } from '../repositories/orderRepo.js';

/**
 * تذكير التقييم بعد الاستلام.
 *
 * لماذا جدولة على الخادم لا مؤقّت في التطبيق: المطلوب أن يصل التذكير بعد
 * يوم من الاستلام حتى لو أغلق العميل التطبيق، أو أعاد تشغيل هاتفه، أو بقي
 * بلا إنترنت، أو لم يفتح التطبيق إلا بعد أسبوع. `setTimeout` في الواجهة
 * يموت مع العملية؛ العمود `rating_reminder_at` في قاعدة البيانات لا يموت.
 *
 * الاستحقاق مشتقّ من حالة قاعدة البيانات لا من ذاكرة العملية، فإعادة تشغيل
 * الخادم لا تُضيّع أي تذكير ولا تُكرّره: `rating_reminder_sent_at` هو
 * الحارس، ويُكتب في نفس الجملة التي تُنشئ الإشعار.
 */

const REMINDER_TITLE = 'شلونها المنتجات؟ ⭐';
const REMINDER_BODY =
  'مرّ يوم على استلامك الطلب — شاركنا رأيك واكسب نقاط المجرّة.';

/**
 * يُرسل التذكيرات المستحقة ويعيد عددها.
 *
 * الجملة واحدة ومتذرّية: `FOR UPDATE SKIP LOCKED` يقفل دفعة المستحقّ (تشغيل
 * أكثر من نسخة من الخادم آمن — كل نسخة تأخذ دفعة مختلفة بلا تكرار)، ثم يُحسم
 * كل طلبٍ فيها مرةً واحدة وفي الجملة نفسها:
 *   • بقي فيه ما يُقيَّم ⇒ يُعلَّم مُرسَلاً ويُدرج إشعاره.
 *   • قُيّم كل منتجٍ فيه ⇒ **يُسحب** التذكير (`rating_reminder_at = NULL`):
 *     لا إشعار، ولا «أُرسل» تدّعيه اللوحة، ولا صفٌّ مستحقٌّ يُعاد فحصه في
 *     كل دورة ثم يُطلق متأخّراً بأيام إن رُفض تقييمٌ لاحقاً (الرفض يُبلغ
 *     الزبونَ بإشعاره هو).
 *
 * [CRITICAL] النصّ يعد بنقاط، ومهلته موثَّقة «لمن استلم ولم يقيّم بعد»
 * (`config.orders.reviewReminderDelayHours`). طلبٌ قُيّمت منتجاته كلها لا يبقى
 * فيه ما يُكسب (§40.5) — والأهلية هي `REVIEWABLE_ITEMS_OF_ORDER` نفسها التي
 * يُخفي بها التطبيق كل دعوة تقييم (CA-16، STEP 57).
 *
 * تعابير `WITH` المعدِّلة تُنفَّذ مرةً واحدة كاملةً وإن لم يُقرأ ناتجها.
 */
export async function dispatchDueRatingReminders(
  client: pg.Pool | pg.PoolClient = db,
  batchSize = config.orders.ratingReminderBatchSize,
): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    `WITH candidates AS (
       SELECT o.id, EXISTS (SELECT 1 ${REVIEWABLE_ITEMS_OF_ORDER}) AS reviewable
         FROM orders o
        WHERE o.status = 'COMPLETED'
          AND o.rating_reminder_sent_at IS NULL
          AND o.rating_reminder_at IS NOT NULL
          AND o.rating_reminder_at <= now()
        ORDER BY o.rating_reminder_at
        LIMIT $1
        FOR UPDATE OF o SKIP LOCKED
     ),
     withdrawn AS (
       UPDATE orders
          SET rating_reminder_at = NULL
        WHERE id IN (SELECT id FROM candidates WHERE NOT reviewable)
     ),
     due AS (
       UPDATE orders
          SET rating_reminder_sent_at = now()
        WHERE id IN (SELECT id FROM candidates WHERE reviewable)
        RETURNING id, user_id
     )
     INSERT INTO notifications (user_id, type, title, body, order_id)
     SELECT due.user_id, 'receiptReminder', $2, $3, due.id
       FROM due
     RETURNING id`,
    [Math.max(1, Math.trunc(batchSize)), REMINDER_TITLE, REMINDER_BODY],
  );
  return rows.length;
}

/**
 * إرسال تذكير طلب واحد فوراً (زرّ «إرسال الإشعار الآن» في لوحة الإدارة).
 *
 * يستخدم نفس حارس `rating_reminder_sent_at` وفي نفس الجملة المتذرّية، فلا
 * فرق بين الإرسال اليدوي والمجدول من ناحية منع التكرار: أول من يعلّم الصف
 * يفوز. ضغطتان متتاليتان تُنتجان إشعاراً واحداً، والجدولة لن تعيد إرساله.
 *
 * يعيد `false` إذا كان الطلب غير مستلَم، أو كان التذكير مُرسَلاً أصلاً، أو لم
 * يبقَ فيه ما يُقيَّم — الأهلية نفسها التي تحكم الجدولة (CA-16)، في الجملة
 * نفسها لا في فحصٍ قبلها.
 */
export async function sendRatingReminderNow(
  orderId: string,
  client: pg.Pool | pg.PoolClient = db,
): Promise<boolean> {
  const { rows } = await client.query<{ id: string }>(
    `WITH due AS (
       UPDATE orders o
          SET rating_reminder_sent_at = now()
        WHERE o.id = $1
          AND o.status = 'COMPLETED'
          AND o.delivered_at IS NOT NULL
          AND o.rating_reminder_sent_at IS NULL
          AND EXISTS (SELECT 1 ${REVIEWABLE_ITEMS_OF_ORDER})
        RETURNING o.id, o.user_id
     )
     INSERT INTO notifications (user_id, type, title, body, order_id)
     SELECT due.user_id, 'receiptReminder', $2, $3, due.id
       FROM due
     RETURNING id`,
    [orderId, REMINDER_TITLE, REMINDER_BODY],
  );
  return rows.length > 0;
}

/**
 * يشغّل الفحص الدوري ويعيد دالة إيقاف.
 *
 * يُستدعى من `server.ts` وحده — لا من `createApp()` — حتى لا تشغّل
 * الاختباراتُ التي تبني التطبيق مؤقّتاً في الخلفية.
 */
export function startRatingReminderScheduler(
  intervalMs = config.orders.ratingReminderIntervalMs,
): () => void {
  let running = false;

  const tick = async () => {
    // منع تداخل دورتين إذا طالت واحدة أكثر من الفاصل الزمني.
    if (running) return;
    running = true;
    try {
      const sent = await dispatchDueRatingReminders();
      if (sent > 0) {
        console.log(`[rating-reminder] أُرسل ${sent} تذكير تقييم`);
      }
    } catch (error) {
      // فشل دورة واحدة لا يُسقط الخادم؛ الدورة التالية تلتقط نفس الصفوف
      // لأنها لم تُعلَّم مُرسَلة.
      console.error('[rating-reminder] فشلت دورة التذكير:', error);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  // لا يمنع الخروج عند الإغلاق.
  timer.unref();

  return () => clearInterval(timer);
}
